/**
 * cache.ts — SQLite-backed cache adapter for Williams Entry Radar
 *
 * Replaces the old JSON-file cache. All data lives in radar.db (weekly_bars table).
 * Data persists across sessions and server restarts.
 * Tickers are NEVER deleted — only status changes (active/discarded).
 *
 * Public API is intentionally identical to the old cache.ts so fetcher.ts
 * requires no changes to its import surface.
 */

import {
  isCacheValid as dbIsCacheValid,
  loadBars,
  upsertBars,
  ensureTicker,
  recordFetch,
  getDbStats,
  getLastFetchedAt,
  type WeeklyBarRow,
} from "./db.js";
import { UNIVERSE } from "./universe.js";

export type { WeeklyBarRow };

// Raw AV series format (keyed by date string)
export type AVRawSeries = Record<
  string,
  {
    "1. open": string;
    "2. high": string;
    "3. low": string;
    "5. adjusted close": string;
    "6. volume"?: string;
    "5. volume"?: string;
  }
>;

// ---------------------------------------------------------------------------
// Ensure all tickers in the universe are registered
// ---------------------------------------------------------------------------
export function seedRegistry(): void {
  for (const meta of UNIVERSE) {
    ensureTicker(meta.ticker, meta.sector, meta.tier);
  }
}

// ---------------------------------------------------------------------------
// Core cache operations (replaces JSON file API)
// ---------------------------------------------------------------------------

/**
 * Returns true if ticker has fresh data (< 6 days old).
 * Replaces: isCacheValid(ticker) from old cache.ts
 */
export function isCacheValid(ticker: string): boolean {
  return dbIsCacheValid(ticker, 6);
}

/**
 * Write AV raw series to SQLite.
 * Replaces: writeCache(ticker, data) from old cache.ts
 */
export function writeCache(ticker: string, series: AVRawSeries): void {
  const fetchedAt = new Date().toISOString();

  const rows: WeeklyBarRow[] = Object.entries(series).map(([date, vals]) => ({
    ticker,
    date,
    open: parseFloat(vals["1. open"]),
    high: parseFloat(vals["2. high"]),
    low: parseFloat(vals["3. low"]),
    close: parseFloat(vals["5. adjusted close"]),
    volume: parseInt(
      vals["6. volume"] ?? vals["5. volume"] ?? "0",
      10
    ),
    fetched_at: fetchedAt,
  }));

  upsertBars(rows);
  recordFetch(ticker, true);
}

/**
 * Read bars from SQLite for a ticker.
 * Returns null if no data (so fetcher.ts knows to hit AV).
 * Replaces: readCache(ticker) from old cache.ts
 */
export function readCache(ticker: string): AVRawSeries | null {
  const bars = loadBars(ticker);
  if (bars.length === 0) return null;

  // Re-serialize to AVRawSeries format so fetcher.ts parseSeries() works unchanged
  const series: AVRawSeries = {};
  for (const bar of bars) {
    series[bar.date] = {
      "1. open": bar.open.toString(),
      "2. high": bar.high.toString(),
      "3. low": bar.low.toString(),
      "5. adjusted close": bar.close.toString(),
      "6. volume": bar.volume.toString(),
    };
  }
  return series;
}

/**
 * Record a failed fetch for error tracking.
 */
export function recordFetchError(ticker: string): void {
  recordFetch(ticker, false);
}

// ---------------------------------------------------------------------------
// Stats (replaces getCacheStats)
// ---------------------------------------------------------------------------
export function getCacheStats(): {
  total: number;
  valid: number;
  stale: number;
  dbPath: string;
  totalBars: number;
  oldestBar: string | null;
  newestBar: string | null;
} {
  const stats = getDbStats();
  const allTickers = UNIVERSE.map((u) => u.ticker);
  const valid = allTickers.filter((t) => isCacheValid(t)).length;
  const withData = allTickers.filter(
    (t) => (getLastFetchedAt(t) ?? null) !== null
  ).length;

  const dbPath =
    process.env.RADAR_DB_PATH ??
    new URL("../data/radar.db", import.meta.url).pathname;

  return {
    total: withData,
    valid,
    stale: withData - valid,
    dbPath,
    totalBars: stats.totalBars,
    oldestBar: stats.oldestBar,
    newestBar: stats.newestBar,
  };
}
