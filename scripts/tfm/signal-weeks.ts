/**
 * Historical signal-week population for the TimesFM Fase 1 calibration backtest.
 * Spec: docs/timesfm-fase1-spec.md §3.3
 *
 * READ-ONLY import of the frozen scanner (`scanTicker`) — nothing under src/ is
 * edited, and radar.db is opened read-only. For every active ticker and every
 * as-of week since --since, the frozen scanner is run on the bars known at that
 * week (bars.slice(0, i+1) — no lookahead); weeks with an S1/S2D/S2 signal and a
 * realised close `horizon` weeks later become rows.
 *
 *   npx tsx scripts/tfm/signal-weeks.ts --since 2019-01-01 --cap 3000 --out FILE.json
 *
 * Prints the population (rows per year × level, post-2025 count) BEFORE the cap
 * and exits 3 if the post-2025 subset is smaller than --min-recent (default 150).
 */

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanTicker } from "../../src/scanner.js";
import type { WeeklyBar } from "../../src/fetcher.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB = path.resolve(__dirname, "..", "..", "data", "radar.db");
const RECENT_CUTOFF = "2025-01-01";
export const MIN_BARS_FOR_SCAN = 104; // priceContext() window in the frozen scanner

export interface SignalWeek {
  ticker: string;
  as_of: string;
  level: "S1" | "S2D" | "S2";
  quality: string;
  close: number;
  close_h4: number;
  ranging: boolean;
  nearLows: boolean;
}

/** As-of signal rows for one ticker. Pure: depends only on `bars` up to each row's as_of. */
export function buildSignalWeeks(
  ticker: string,
  bars: WeeklyBar[],
  since: string,
  horizon = 4,
): SignalWeek[] {
  const out: SignalWeek[] = [];
  const firstSince = bars.findIndex((b) => b.date >= since);
  if (firstSince < 0) return out; // every bar predates `since` — never emit pre-since rows
  const first = Math.max(MIN_BARS_FOR_SCAN - 1, firstSince);
  for (let i = first; i + horizon < bars.length; i++) {
    const r = scanTicker(ticker, bars.slice(0, i + 1));
    if (r.signalLevel === "none") continue;
    out.push({
      ticker,
      as_of: bars[i].date,
      level: r.signalLevel,
      quality: r.signalQuality,
      close: bars[i].close,
      close_h4: bars[i + horizon].close,
      ranging: r.ranging,
      nearLows: r.nearLows,
    });
  }
  return out;
}

/** Deterministic PRNG (mulberry32) so the cap sample is reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cap to `cap` rows, proportionally per year (stratified), seeded. Order preserved within years. */
export function stratifiedCap(rows: SignalWeek[], cap: number, seed = 42): SignalWeek[] {
  if (rows.length <= cap) return rows;
  const rnd = mulberry32(seed);
  const byYear = new Map<string, SignalWeek[]>();
  for (const r of rows) {
    const y = r.as_of.slice(0, 4);
    (byYear.get(y) ?? byYear.set(y, []).get(y)!).push(r);
  }
  const out: SignalWeek[] = [];
  for (const [, group] of [...byYear.entries()].sort()) {
    const take = Math.max(1, Math.round((group.length / rows.length) * cap));
    const idx = group.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    const chosen = idx.slice(0, take).sort((a, b) => a - b);
    for (const i of chosen) out.push(group[i]);
  }
  return out;
}

export function populationTable(rows: SignalWeek[]): string {
  const years = [...new Set(rows.map((r) => r.as_of.slice(0, 4)))].sort();
  const levels = ["S2", "S2D", "S1"] as const;
  const lines = ["year   S2   S2D    S1  total"];
  for (const y of years) {
    const ys = rows.filter((r) => r.as_of.startsWith(y));
    const cells = levels.map((l) => String(ys.filter((r) => r.level === l).length).padStart(5));
    lines.push(`${y} ${cells.join(" ")} ${String(ys.length).padStart(6)}`);
  }
  const recent = rows.filter((r) => r.as_of >= RECENT_CUTOFF).length;
  lines.push(`total ${String(rows.length).padStart(23)}   (post-${RECENT_CUTOFF}: ${recent})`);
  return lines.join("\n");
}

function arg(name: string, def: string): string {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

function intArg(name: string, def: string): number {
  const v = parseInt(arg(name, def), 10);
  if (!Number.isFinite(v) || v <= 0) {
    console.error(`[signal-weeks] --${name} must be a positive integer (got "${arg(name, def)}")`);
    process.exit(1);
  }
  return v;
}

function main(): number {
  const since = arg("since", "2019-01-01");
  const cap = intArg("cap", "3000");
  const horizon = intArg("horizon", "4");
  const minRecent = intArg("min-recent", "150");
  const dbPath = arg("db", DEFAULT_DB);
  const out = arg("out", "");
  if (!out) {
    console.error("usage: signal-weeks.ts --out FILE.json [--since YYYY-MM-DD] [--cap N] [--horizon 4] [--db PATH]");
    return 1;
  }

  const db = new Database(dbPath, { readonly: true });
  // Same population the live scanner sees: registry minus discarded (src/db.ts getActiveTickers)
  // minus SPY, which src/scanner.ts runScan() skips (benchmark only, never a signal).
  const tickers = (db.prepare("SELECT ticker FROM ticker_registry WHERE status != 'discarded' ORDER BY ticker").all() as { ticker: string }[])
    .map((r) => r.ticker)
    .filter((t) => t !== "SPY");
  const stmt = db.prepare("SELECT date, open, high, low, close, volume FROM weekly_bars WHERE ticker=? ORDER BY date ASC");

  const t0 = Date.now();
  let all: SignalWeek[] = [];
  for (const t of tickers) {
    const bars = stmt.all(t) as WeeklyBar[];
    all = all.concat(buildSignalWeeks(t, bars, since, horizon));
  }
  db.close();
  console.log(`[signal-weeks] ${tickers.length} tickers scanned in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(populationTable(all));

  const recent = all.filter((r) => r.as_of >= RECENT_CUTOFF).length;
  if (recent < minRecent) {
    console.error(`[signal-weeks] STOP: post-${RECENT_CUTOFF} subset has ${recent} rows (< ${minRecent}); gate would be underpowered`);
    return 3;
  }

  const rows = stratifiedCap(all, cap);
  if (rows.length < all.length) console.log(`[signal-weeks] capped ${all.length} → ${rows.length} rows (stratified by year, seed 42)`);
  const recentCapped = rows.filter((r) => r.as_of >= RECENT_CUTOFF).length;
  if (recentCapped < minRecent) {
    console.error(`[signal-weeks] STOP: post-${RECENT_CUTOFF} subset after the cap has ${recentCapped} rows (< ${minRecent}); raise --cap`);
    return 3;
  }
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(
    out,
    JSON.stringify(
      {
        meta: { since, horizon, cap, generated_at: new Date().toISOString(), tickers: tickers.length, total_before_cap: all.length, post_2025_before_cap: recent, post_2025: recentCapped, recent_cutoff: RECENT_CUTOFF },
        rows,
      },
      null,
      1,
    ),
  );
  console.log(`[signal-weeks] wrote ${out} (${rows.length} rows)`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
