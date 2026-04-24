/**
 * db.ts — SQLite persistence layer for Williams Entry Radar
 *
 * Two tables:
 *   weekly_bars      — price data per ticker+date (UPSERT-safe, never deleted)
 *   ticker_registry  — universe state: active / watchlist / discarded
 *
 * Design principles:
 *   - Data is NEVER deleted. Discarded tickers stay in the DB with status='discarded'.
 *   - UPSERT on (ticker, date) — safe to re-run fetches without duplicates.
 *   - DB path defaults to project data dir; overridable via RADAR_DB_PATH env var.
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WeeklyBarRow {
  ticker: string;
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number; // adjusted close
  volume: number;
  fetched_at: string; // ISO timestamp of the fetch that produced this row
}

export type TickerStatus = "active" | "watchlist" | "discarded";

export interface TickerRegistryRow {
  ticker: string;
  sector: string;
  tier: number; // 1 | 2 | 3
  status: TickerStatus;
  added_at: string;
  discarded_at: string | null;
  discard_reason: string | null;
  last_fetched_at: string | null;
  fetch_errors: number;
}

// ---------------------------------------------------------------------------
// Singleton DB
// ---------------------------------------------------------------------------

const DEFAULT_DB_PATH = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  "data",
  "radar.db",
);

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  const dbPath = process.env.RADAR_DB_PATH ?? DEFAULT_DB_PATH;
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  _db = new Database(dbPath);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  applySchema(_db);
  return _db;
}

// ---------------------------------------------------------------------------
// Schema (additive — safe to call on existing DB)
// ---------------------------------------------------------------------------

function applySchema(db: Database.Database): void {
  // OHLC CHECK constraints are DATA-QUALITY guards: without them, a
  // botched fetch parsing a zero or inverted bar would silently land in
  // the cache and contaminate every downstream backtest/scan.
  db.exec(`
    CREATE TABLE IF NOT EXISTS weekly_bars (
      ticker      TEXT    NOT NULL,
      date        TEXT    NOT NULL,
      open        REAL    NOT NULL,
      high        REAL    NOT NULL,
      low         REAL    NOT NULL,
      close       REAL    NOT NULL,
      volume      INTEGER NOT NULL,
      fetched_at  TEXT    NOT NULL,
      PRIMARY KEY (ticker, date),
      CHECK (open   > 0),
      CHECK (high   > 0),
      CHECK (low    > 0),
      CHECK (close  > 0),
      CHECK (high  >= low),
      CHECK (high  >= open),
      CHECK (high  >= close),
      CHECK (low   <= open),
      CHECK (low   <= close),
      CHECK (volume >= 0)
    );

    CREATE TABLE IF NOT EXISTS ticker_registry (
      ticker          TEXT    PRIMARY KEY,
      sector          TEXT    NOT NULL,
      tier            INTEGER NOT NULL DEFAULT 2,
      status          TEXT    NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'watchlist', 'discarded')),
      added_at        TEXT    NOT NULL,
      discarded_at    TEXT,
      discard_reason  TEXT,
      last_fetched_at TEXT,
      fetch_errors    INTEGER NOT NULL DEFAULT 0
    );
  `);
}

// ---------------------------------------------------------------------------
// weekly_bars operations
// ---------------------------------------------------------------------------

/**
 * Upsert a batch of weekly bars for a ticker.
 * Uses INSERT OR REPLACE — safe to call repeatedly on the same data.
 */
export function upsertBars(rows: WeeklyBarRow[]): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO weekly_bars
      (ticker, date, open, high, low, close, volume, fetched_at)
    VALUES
      (@ticker, @date, @open, @high, @low, @close, @volume, @fetched_at)
  `);

  const insertMany = db.transaction((items: WeeklyBarRow[]) => {
    for (const row of items) stmt.run(row);
  });

  insertMany(rows);
}

/**
 * Load all bars for a ticker, ordered ascending by date.
 * Returns [] if ticker has no data.
 */
export function loadBars(ticker: string): WeeklyBarRow[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM weekly_bars WHERE ticker = ? ORDER BY date ASC")
    .all(ticker) as WeeklyBarRow[];
}

/**
 * Get the most recent fetch timestamp for a ticker.
 * Returns null if no bars stored.
 */
export function getLastFetchedAt(ticker: string): string | null {
  const db = getDb();
  const row = db
    .prepare("SELECT MAX(fetched_at) as last FROM weekly_bars WHERE ticker = ?")
    .get(ticker) as { last: string | null } | undefined;
  return row?.last ?? null;
}

/**
 * How many weeks of data does this ticker have?
 */
export function getBarCount(ticker: string): number {
  const db = getDb();
  const row = db
    .prepare("SELECT COUNT(*) as n FROM weekly_bars WHERE ticker = ?")
    .get(ticker) as { n: number };
  return row.n;
}

/**
 * Returns true if ticker has fresh data (fetched within TTL_DAYS).
 */
export function isCacheValid(ticker: string, ttlDays = 6): boolean {
  const last = getLastFetchedAt(ticker);
  if (!last) return false;
  const ageMs = Date.now() - new Date(last).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return ageDays < ttlDays;
}

// ---------------------------------------------------------------------------
// ticker_registry operations
// ---------------------------------------------------------------------------

/**
 * Register a ticker if not already present (INSERT OR IGNORE).
 */
export function ensureTicker(
  ticker: string,
  sector: string,
  tier: number,
): void {
  const db = getDb();
  db.prepare(
    `
    INSERT OR IGNORE INTO ticker_registry
      (ticker, sector, tier, status, added_at)
    VALUES
      (?, ?, ?, 'active', ?)
  `,
  ).run(ticker, sector, tier, new Date().toISOString());
}

/**
 * Mark a ticker as discarded. Its price data is preserved forever.
 * Call this explicitly — the scanner will skip discarded tickers.
 */
export function discardTicker(ticker: string, reason: string): void {
  const db = getDb();
  db.prepare(
    `
    UPDATE ticker_registry
    SET status = 'discarded',
        discarded_at = ?,
        discard_reason = ?
    WHERE ticker = ?
  `,
  ).run(new Date().toISOString(), reason, ticker);
}

/**
 * Update fetch tracking metadata after a successful or failed fetch.
 */
export function recordFetch(ticker: string, success: boolean): void {
  const db = getDb();
  if (success) {
    db.prepare(
      `
      UPDATE ticker_registry
      SET last_fetched_at = ?,
          fetch_errors = 0
      WHERE ticker = ?
    `,
    ).run(new Date().toISOString(), ticker);
  } else {
    db.prepare(
      `
      UPDATE ticker_registry
      SET fetch_errors = fetch_errors + 1
      WHERE ticker = ?
    `,
    ).run(ticker);
  }
}

/**
 * Get all active tickers from the registry.
 */
export function getActiveTickers(): TickerRegistryRow[] {
  const db = getDb();
  return db
    .prepare(
      "SELECT * FROM ticker_registry WHERE status != 'discarded' ORDER BY tier, ticker",
    )
    .all() as TickerRegistryRow[];
}

/**
 * Get all tickers (including discarded) — for audit/reporting.
 */
export function getAllTickers(): TickerRegistryRow[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM ticker_registry ORDER BY tier, ticker")
    .all() as TickerRegistryRow[];
}

/**
 * DB stats for reporting.
 */
export function getDbStats(): {
  totalTickers: number;
  activeTickers: number;
  discardedTickers: number;
  totalBars: number;
  oldestBar: string | null;
  newestBar: string | null;
} {
  const db = getDb();
  const counts = db
    .prepare(
      `
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status != 'discarded' THEN 1 ELSE 0 END) as active,
      SUM(CASE WHEN status  = 'discarded' THEN 1 ELSE 0 END) as discarded
    FROM ticker_registry
  `,
    )
    .get() as { total: number; active: number; discarded: number };

  const barStats = db
    .prepare(
      `
    SELECT COUNT(*) as n, MIN(date) as oldest, MAX(date) as newest
    FROM weekly_bars
  `,
    )
    .get() as { n: number; oldest: string | null; newest: string | null };

  return {
    totalTickers: counts.total,
    activeTickers: counts.active,
    discardedTickers: counts.discarded,
    totalBars: barStats.n,
    oldestBar: barStats.oldest,
    newestBar: barStats.newest,
  };
}
