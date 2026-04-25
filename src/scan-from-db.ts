/**
 * scan-from-db.ts — Run scanner directly from SQLite cache (no API key needed)
 * Usage: tsx src/scan-from-db.ts
 */

import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { runScan } from "./scanner.js";
import { printReport, saveCSV } from "./weekly-report.js";
import type { WeeklyBar } from "./fetcher.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "../data/radar.db");

const db = new Database(DB_PATH);

// Load all active tickers and their bars from SQLite
const tickers = db.prepare(
  "SELECT DISTINCT ticker FROM weekly_bars WHERE ticker != 'SPY' ORDER BY ticker"
).all() as { ticker: string }[];

console.log(`\n  Loading ${tickers.length} tickers from SQLite cache...`);

const tickerBars = new Map<string, WeeklyBar[]>();

for (const { ticker } of tickers) {
  const rows = db.prepare(
    `SELECT date, open, high, low, close, volume
     FROM weekly_bars WHERE ticker = ? ORDER BY date ASC`
  ).all(ticker) as { date: string; open: number; high: number; low: number; close: number; volume: number }[];

  const bars: WeeklyBar[] = rows.map((r) => ({
    date: r.date,
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    volume: r.volume,
  }));

  tickerBars.set(ticker, bars);
}

const runDate = new Date().toISOString().slice(0, 10);
const results = runScan(tickerBars);
printReport(results, runDate);
const csvPath = saveCSV(results, runDate);
console.log(`  CSV saved: ${csvPath}\n`);

db.close();
