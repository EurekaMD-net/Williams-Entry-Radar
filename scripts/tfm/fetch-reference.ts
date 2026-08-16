/**
 * fetch-reference.ts — Polygon reference data (dividends + recent splits) for the universe,
 * used to put the Alpha-Vantage-era bars on Polygon's split-only basis in a BACKTEST COPY of
 * radar.db (see make-splitbasis-db.py). Free-tier friendly: v3 reference endpoints serve full
 * history; 13 s pacing (5 req/min). radar.db is opened read-only; nothing under src/ is used.
 *
 *   sudo systemd-run --wait --pipe --collect --quiet -p EnvironmentFile=/etc/williams-radar.env \
 *     --working-directory=/root/claude/williams-entry-radar \
 *     /usr/bin/npx tsx scripts/tfm/fetch-reference.ts --out results/tfm-backtest/reference [--delay-ms 13000] [--start-at T]
 *
 * Writes <out>/dividends.json {ticker: [{ex, cash}...]} (merged into an existing file, so a
 * killed run resumes with --start-at) and <out>/splits.json (splits executed since 2026-04-01).
 * Exit 0 · 1 setup · 2 some tickers failed (listed).
 */
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.RADAR_DB_PATH ?? path.resolve(__dirname, "..", "..", "data", "radar.db");
const BASE = process.env.POLYGON_BASE_URL ?? "https://api.polygon.io";
const DEFAULT_SPLITS_SINCE = "2026-04-01"; // AV-era rows were fetched 2026-04-24 … 07-11; a split after that de-syncs the bases

function arg(name: string, def: string): string {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : def;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const redact = (s: string) => s.replace(/apiKey=[^&\s]+/g, "apiKey=[REDACTED]");

async function getJson(url: string): Promise<any> {
  const key = process.env.POLYGON_API_KEY ?? "";
  const full = `${url}${url.includes("?") ? "&" : "?"}apiKey=${encodeURIComponent(key)}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(full);
    if (res.status === 429) { await sleep(60_000); continue; }
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${redact(url)}`);
    const j = await res.json();
    if (j.status === "ERROR" || j.error) throw new Error(`Polygon error: ${j.error ?? j.message}`);
    return j;
  }
  throw new Error(`rate limited twice for ${redact(url)}`);
}

async function fetchDividends(ticker: string, delayMs: number): Promise<{ ex: string; cash: number }[]> {
  const out: { ex: string; cash: number }[] = [];
  let url: string | undefined = `${BASE}/v3/reference/dividends?ticker=${encodeURIComponent(ticker)}&order=asc&sort=ex_dividend_date&limit=1000`;
  while (url) {
    const j = await getJson(url);
    for (const r of j.results ?? []) {
      if (r.ex_dividend_date && Number.isFinite(Number(r.cash_amount)) && Number(r.cash_amount) > 0) out.push({ ex: r.ex_dividend_date, cash: Number(r.cash_amount) });
    }
    url = j.next_url; // rare (>1000 dividends); paginate with the same pacing
    if (url) await sleep(delayMs);
  }
  return out;
}

async function main(): Promise<number> {
  const outDir = arg("out", "results/tfm-backtest/reference");
  const delayMs = parseInt(arg("delay-ms", "13000"), 10);
  const startAt = arg("start-at", "");
  const splitsSince = arg("splits-since", DEFAULT_SPLITS_SINCE);
  const splitsOnly = process.argv.includes("--splits-only"); // e.g. --splits-only --splits-since 1990-01-01 → splits-all.json (bars start 1999-11)
  const splitsFile = splitsSince === DEFAULT_SPLITS_SINCE ? "splits.json" : "splits-all.json";
  if (!process.env.POLYGON_API_KEY) { console.error("POLYGON_API_KEY missing — run under the service env file (see header)"); return 1; }
  if (!Number.isFinite(delayMs) || delayMs < 0) { console.error("--delay-ms must be >= 0"); return 1; }
  fs.mkdirSync(outDir, { recursive: true });
  const divPath = path.join(outDir, "dividends.json");
  const dividends: Record<string, { ex: string; cash: number }[]> = fs.existsSync(divPath) ? JSON.parse(fs.readFileSync(divPath, "utf8")) : {};

  const db = new Database(DB_PATH, { readonly: true });
  const tickers = (db.prepare("SELECT ticker FROM ticker_registry WHERE status != 'discarded' ORDER BY ticker").all() as { ticker: string }[]).map((r) => r.ticker);
  db.close();
  const todo = tickers.filter((t) => (!startAt || t >= startAt) && !(t in dividends));
  console.log(`[fetch-reference] ${tickers.length} tickers · ${todo.length} to fetch (${tickers.length - todo.length} already in ${divPath}) · delay ${delayMs} ms · ETA ${Math.round((todo.length * delayMs) / 60000)} min`);

  // Splits since SPLITS_SINCE across the market (one call), filtered to the universe.
  const universe = new Set(tickers);
  const splits: { ticker: string; execution_date: string; split_from: number; split_to: number }[] = [];
  const today = new Date().toISOString().slice(0, 10);
  // execution_date.lte=today: the feed also lists ANNOUNCED splits (e.g. APH 2026-09-03 seen on 2026-08-16);
  // applying one before it executes would rescale rows onto a basis nothing in the DB is on.
  let surl: string | undefined = `${BASE}/v3/reference/splits?execution_date.gte=${splitsSince}&execution_date.lte=${today}&order=asc&sort=execution_date&limit=1000`;
  while (surl) {
    const j = await getJson(surl);
    for (const r of j.results ?? []) if (universe.has(r.ticker)) splits.push({ ticker: r.ticker, execution_date: r.execution_date, split_from: Number(r.split_from), split_to: Number(r.split_to) });
    surl = j.next_url;
    if (surl) await sleep(delayMs);
  }
  fs.writeFileSync(path.join(outDir, splitsFile), JSON.stringify({ since: splitsSince, until: today, fetched_at: new Date().toISOString(), splits }, null, 1));
  console.log(`[fetch-reference] splits since ${splitsSince} in universe: ${splits.length} → ${splitsFile}${splits.length && splits.length <= 12 ? " " + splits.map((s) => `${s.ticker}@${s.execution_date} ${s.split_from}:${s.split_to}`).join(", ") : ""}`);
  if (splitsOnly) return 0;
  await sleep(delayMs);

  const failed: string[] = [];
  let done = 0;
  for (const t of todo) {
    try {
      dividends[t] = await fetchDividends(t, delayMs);
    } catch (e) {
      failed.push(t);
      console.log(`  ${t}: FAILED ${redact((e as Error).message)}`);
    }
    done++;
    if (done % 25 === 0 || done === todo.length) {
      fs.writeFileSync(divPath, JSON.stringify(dividends, null, 0)); // checkpoint for --start-at resume
      console.log(`  ${done}/${todo.length} · failed ${failed.length}`);
    }
    if (done < todo.length) await sleep(delayMs);
  }
  fs.writeFileSync(divPath, JSON.stringify(dividends, null, 0));
  const payers = Object.values(dividends).filter((d) => d.length).length;
  console.log(`[fetch-reference] wrote ${divPath}: ${Object.keys(dividends).length} tickers, ${payers} with ≥1 dividend · failed ${failed.length}${failed.length ? ` (${failed.join(",")})` : ""}`);
  return failed.length ? 2 : 0;
}

main().then((c) => process.exit(c), (e) => { console.error(redact(String(e))); process.exit(1); });
