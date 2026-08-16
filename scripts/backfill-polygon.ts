/**
 * backfill-polygon.ts — replace the Alpha-Vantage-era weekly bars in radar.db
 * (dividend-adjusted closes, dates < 2024-07-19) with Polygon bars (split-adjusted
 * only) so the whole history shares ONE adjustment basis. Found 2026-08-16: 166/387
 * tickers jump >5% in the 2024-07-12→19 week purely from the basis change.
 *
 * READ-ONLY imports of the frozen fetcher/db modules; nothing under src/ changes.
 *
 *   DRY RUN (default — plans, probes, writes nothing):
 *     sudo systemd-run --wait --pipe --collect --quiet -p EnvironmentFile=/etc/williams-radar.env \
 *       --working-directory=/root/claude/williams-entry-radar \
 *       /usr/bin/npx tsx scripts/backfill-polygon.ts [--lookback-years 9] [--delay-ms 13000] [--start-at TICKER] [--before 2024-07-19]
 *   APPLY (backs radar.db up to /root/claude-backups/radar-db-pre-polygon-backfill-<timestamp>/ first;
 *          refuses if that backup path already exists, and refuses Fridays 15:00–20:00 MX — the scan window):
 *     ... scripts/backfill-polygon.ts --apply
 *
 * Only bars inside the lookback window are converted (the frozen fetcher caps one call at 500
 * weekly bars ⇒ --lookback-years ≤ 9). Tickers whose DB history predates the window keep their
 * AV-basis bars before it, so the basis boundary MOVES to ~lookback start (or to a ticker's own
 * first Polygon bar) instead of vanishing — the run prints how many tickers still jump >5% there.
 *
 * Plan-tier guard: the first ticker is probed; if Polygon's earliest bar is not
 * before --before, this API key's plan cannot serve the backfill (free tier = 2 y)
 * and the script exits 4 without touching anything. Rows with date >= --before are
 * never written; a checksum over them is compared before/after --apply. Backfilled
 * rows keep their original fetched_at (isCacheValid() reads MAX(fetched_at) — a fresh
 * stamp would make Friday's fetch skip the ticker); per-ticker MAX(fetched_at) is
 * asserted unchanged after --apply.
 *
 * Exit: 0 ok · 1 setup/usage · 2 some tickers failed (listed) · 4 plan tier too shallow.
 */

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchWeeklyFromPolygon, POLYGON_DELAY_MS } from "../src/fetch-polygon.js";
import { polygonBarsToSeries, type WeeklyBar } from "../src/fetcher.js";
import { upsertBars, type WeeklyBarRow } from "../src/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.RADAR_DB_PATH ?? path.resolve(__dirname, "..", "data", "radar.db");
const BACKUP_ROOT = "/root/claude-backups";
export const DEFAULT_BEFORE = "2024-07-19"; // first Polygon-era bar in radar.db

/**
 * Pure planner: Polygon bars → upsert rows for dates < `before`, snapped to existing same-week dates.
 * `existing` maps date → fetched_at for the ticker's current rows. Backfilled rows KEEP the replaced
 * row's fetched_at (new dates get the ticker's oldest fetched_at, or `fallbackFetchedAt` if the ticker
 * has none) so MAX(fetched_at) never advances — src/db.ts isCacheValid() reads MAX(fetched_at) and a
 * fresh stamp would make Friday's fetch skip the ticker (stale scan).
 */
export function planRows(ticker: string, bars: WeeklyBar[], existing: Map<string, string>, before: string, fallbackFetchedAt: string): WeeklyBarRow[] {
  const kept = bars.filter((b) => b.date < before);
  const series = polygonBarsToSeries(kept, [...existing.keys()]);
  const oldest = [...existing.values()].sort()[0] ?? fallbackFetchedAt;
  const rows: WeeklyBarRow[] = [];
  for (const [date, v] of Object.entries(series)) {
    if (date >= before) throw new Error(`${ticker}: snapped date ${date} is not before ${before}`);
    const row: WeeklyBarRow = {
      ticker,
      date,
      open: Number(v["1. open"]),
      high: Number(v["2. high"]),
      low: Number(v["3. low"]),
      close: Number(v["5. adjusted close"]),
      volume: Number(v["6. volume"]),
      fetched_at: existing.get(date) ?? oldest,
    };
    if (![row.open, row.high, row.low, row.close].every((x) => Number.isFinite(x) && x > 0) || !Number.isFinite(row.volume) || row.volume < 0) {
      throw new Error(`${ticker} ${date}: non-positive/non-finite OHLCV from Polygon`);
    }
    rows.push(row);
  }
  return rows.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Fridays 15:00–20:00 America/Mexico_City: reload timer 17:50, scan 18:00 (~85 min) — an 85-min run must not overlap. */
export function inFridayScanWindow(now: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Mexico_City", weekday: "short", hour: "numeric", hour12: false }).formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value;
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10) % 24;
  return weekday === "Fri" && hour >= 15 && hour < 20;
}

function arg(name: string, def: string): string {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : def;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(ticker: string, lookback: number): Promise<WeeklyBar[]> {
  try {
    return await fetchWeeklyFromPolygon(ticker, lookback);
  } catch (e) {
    if (!String((e as Error).message).includes("429")) throw e;
    console.log(`  ${ticker}: 429 — waiting 60 s and retrying once`);
    await sleep(60_000);
    return fetchWeeklyFromPolygon(ticker, lookback);
  }
}

function liveEraChecksum(db: Database.Database, before: string): { n: number; sum: number } {
  return db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(close),0) AS sum FROM weekly_bars WHERE date >= ?").get(before) as { n: number; sum: number };
}

function seamJumpCount(db: Database.Database): number {
  const r = db
    .prepare(
      `WITH a AS (SELECT ticker, close c1 FROM weekly_bars WHERE date='2024-07-12'),
            b AS (SELECT ticker, close c2 FROM weekly_bars WHERE date='2024-07-19')
       SELECT SUM(CASE WHEN c2/c1 > 1.05 THEN 1 ELSE 0 END) AS jumps FROM a JOIN b USING(ticker)`,
    )
    .get() as { jumps: number | null };
  return r.jumps ?? 0;
}

async function main(): Promise<number> {
  const apply = process.argv.includes("--apply");
  const before = arg("before", DEFAULT_BEFORE);
  const lookback = parseInt(arg("lookback-years", "9"), 10);
  const delayMs = parseInt(arg("delay-ms", String(POLYGON_DELAY_MS)), 10);
  const startAt = arg("start-at", "");
  if (!Number.isFinite(lookback) || lookback < 1 || lookback > 9 || !Number.isFinite(delayMs) || delayMs < 0) {
    console.error("usage: --lookback-years 1..9 (the frozen fetcher caps a call at 500 weekly bars) · --delay-ms >= 0");
    return 1;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(before)) {
    console.error(`--before must be YYYY-MM-DD (got "${before}") — every date guard here is a string comparison`);
    return 1;
  }
  if (!process.env.POLYGON_API_KEY) {
    console.error("POLYGON_API_KEY missing — run under the service env file (see header), never paste the key");
    return 1;
  }
  if (apply && inFridayScanWindow(new Date())) {
    console.error("--apply refused: Fridays 15:00–20:00 America/Mexico_City is the radar's fetch/scan window (reload 17:50, scan 18:00, ~85 min); a concurrent scan would trip the checksums");
    return 1;
  }
  const ro = new Database(DB_PATH, { readonly: true });
  // Probe order: deepest DB history first — the plan-tier guard should look at the ticker that needs
  // the most history, not whichever sorts first alphabetically.
  const tickers = (ro.prepare("SELECT ticker FROM ticker_registry WHERE status != 'discarded' ORDER BY ticker").all() as { ticker: string }[])
    .map((r) => r.ticker)
    .filter((t) => !startAt || t >= startAt);
  if (!tickers.length) {
    console.error(`no non-discarded tickers${startAt ? ` >= --start-at ${startAt}` : ""}`);
    ro.close();
    return 1;
  }
  const deepest = (ro.prepare("SELECT ticker FROM weekly_bars WHERE ticker IN (SELECT ticker FROM ticker_registry WHERE status != 'discarded') GROUP BY ticker ORDER BY MIN(date) LIMIT 1").get() as { ticker: string } | undefined)?.ticker;
  const probeTicker = deepest && tickers.includes(deepest) ? deepest : tickers[0];
  const datesStmt = ro.prepare("SELECT date, fetched_at FROM weekly_bars WHERE ticker=? ORDER BY date ASC");
  const maxFetchedStmt = ro.prepare("SELECT ticker, MAX(fetched_at) AS m FROM weekly_bars GROUP BY ticker");
  const snapshotMaxFetched = () => new Map((maxFetchedStmt.all() as { ticker: string; m: string }[]).map((r) => [r.ticker, r.m]));
  const liveBefore = liveEraChecksum(ro, before);
  const maxFetchedBefore = snapshotMaxFetched();
  console.log(`[backfill] ${apply ? "APPLY" : "DRY RUN"} · ${tickers.length} tickers · bars < ${before} · lookback ${lookback}y · delay ${delayMs} ms`);
  console.log(`[backfill] seam jumps (>5% in 2024-07-12→19) before: ${seamJumpCount(ro)} · live-era rows ${liveBefore.n} (checksum ${liveBefore.sum.toFixed(2)})`);

  // Plan-tier guard on the deepest-history ticker.
  const probeBars = await fetchWithRetry(probeTicker, lookback);
  const earliest = probeBars[0]?.date ?? "n/a";
  if (!(earliest < before)) {
    console.error(`[backfill] plan tier too shallow: earliest Polygon bar for ${probeTicker} is ${earliest} (need < ${before}). Nothing to backfill — exit 4.`);
    ro.close();
    return 4;
  }
  console.log(`[backfill] probe ${probeTicker}: ${probeBars.length} bars, earliest ${earliest} — proceeding (bars older than that stay AV-basis)`);

  if (apply) {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const dir = path.join(BACKUP_ROOT, `radar-db-pre-polygon-backfill-${stamp}`);
    const dest = path.join(dir, "radar.db");
    if (fs.existsSync(dest)) {
      console.error(`[backfill] refusing to overwrite an existing backup: ${dest}`);
      ro.close();
      return 1;
    }
    fs.mkdirSync(dir, { recursive: true });
    await ro.backup(dest);
    console.log(`[backfill] backup written: ${dest} (${(fs.statSync(dest).size / 1e6).toFixed(1)} MB) — a resumed --apply --start-at run writes ANOTHER backup (timestamped); keep the earliest one for rollback`);
  }

  const fallbackFetchedAt = "1970-01-01T00:00:00.000Z"; // only for tickers with NO rows at all — never advances MAX(fetched_at)
  const prevCloseStmt = ro.prepare("SELECT close FROM weekly_bars WHERE ticker=? AND date<? ORDER BY date DESC LIMIT 1");
  const failed: string[] = [];
  const boundaryJumps: string[] = []; // tickers whose first Polygon-basis bar jumps >5% vs the AV bar before it
  let replaced = 0, added = 0, done = 0, withOlderHistory = 0;
  for (const t of tickers) {
    try {
      const bars = t === probeTicker ? probeBars : await fetchWithRetry(t, lookback);
      const existing = new Map((datesStmt.all(t) as { date: string; fetched_at: string }[]).map((r) => [r.date, r.fetched_at]));
      const rows = planRows(t, bars, existing, before, fallbackFetchedAt);
      const nRep = rows.filter((r) => existing.has(r.date)).length;
      replaced += nRep;
      added += rows.length - nRep;
      if (rows.length) {
        const prev = prevCloseStmt.get(t, rows[0].date) as { close: number } | undefined;
        if (prev) {
          withOlderHistory++;
          if (Math.abs(rows[0].close / prev.close - 1) > 0.05) boundaryJumps.push(`${t}@${rows[0].date}`);
        }
      }
      if (apply && rows.length) upsertBars(rows);
      done++;
      if (done % 25 === 0 || done === tickers.length) console.log(`  ${done}/${tickers.length} · replaced ${replaced} · added ${added} · failed ${failed.length}`);
    } catch (e) {
      failed.push(t);
      console.log(`  ${t}: FAILED ${(e as Error).message.replace(/apiKey=[^&\s]+/g, "apiKey=[REDACTED]")}`);
    }
    if (t !== tickers[tickers.length - 1] && delayMs) await sleep(delayMs);
  }

  const liveAfter = liveEraChecksum(ro, before);
  const jumpsAfter = seamJumpCount(ro);
  const maxFetchedAfter = snapshotMaxFetched();
  const cacheDrift = [...maxFetchedAfter].filter(([t, m]) => maxFetchedBefore.get(t) !== undefined && maxFetchedBefore.get(t) !== m).map(([t]) => t);
  ro.close();
  const vacuous = apply ? "" : " (dry run — no writes, check is vacuous)";
  console.log(`[backfill] ${apply ? "applied" : "planned"}: replaced ${replaced} · added ${added} · failed ${failed.length}${failed.length ? ` (${failed.join(",")})` : ""}`);
  console.log(`[backfill] residual basis boundary: ${withOlderHistory} tickers keep AV-basis bars older than their first Polygon bar; ${boundaryJumps.length} of them jump >5% there${boundaryJumps.length ? ` (${boundaryJumps.slice(0, 5).join(", ")}${boundaryJumps.length > 5 ? ", …" : ""})` : ""}`);
  console.log(`[backfill] live-era rows ${liveAfter.n} (checksum ${liveAfter.sum.toFixed(2)}) — ${liveAfter.n === liveBefore.n && Math.abs(liveAfter.sum - liveBefore.sum) < 1e-6 ? "UNCHANGED ✓" : "CHANGED ✗"} · ${before === DEFAULT_BEFORE ? `2024-07-12→19 seam jumps after: ${jumpsAfter}` : "seam metric skipped (non-default --before)"}${vacuous}`);
  console.log(`[backfill] MAX(fetched_at) per ticker ${cacheDrift.length ? `CHANGED for ${cacheDrift.length} tickers ✗ (${cacheDrift.slice(0, 5).join(",")}…) — isCacheValid() would skip their Friday fetch` : "unchanged ✓ (Friday fetch cache untouched)"}${vacuous}`);
  if (apply && (liveAfter.n !== liveBefore.n || Math.abs(liveAfter.sum - liveBefore.sum) >= 1e-6 || cacheDrift.length)) return 2;
  return failed.length ? 2 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code), (e) => { console.error(e); process.exit(1); });
}
