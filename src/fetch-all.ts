/**
 * fetch-all.ts — Download weekly data for all tickers and cache to /tmp/
 * Run this first, then run backtest-local.ts which reads from cache.
 * Splits into batches to respect Alpha Vantage 5 calls/min limit.
 */
import { fetchWeeklyData } from "./data.js";
import { writeFileSync } from "fs";

const TICKERS = ["XLU", "XLP", "XLE", "XLI", "XLK", "XLY", "XBI", "ARKG"];
const CACHE_DIR = "/tmp/wer-cache";

import { mkdirSync } from "fs";
mkdirSync(CACHE_DIR, { recursive: true });

for (let i = 0; i < TICKERS.length; i++) {
  const ticker = TICKERS[i];
  const cachePath = `${CACHE_DIR}/${ticker}.json`;
  process.stdout.write(`[${i+1}/${TICKERS.length}] Fetching ${ticker}...`);
  try {
    const candles = await fetchWeeklyData(ticker);
    writeFileSync(cachePath, JSON.stringify(candles));
    console.log(` ${candles.length} weeks → ${cachePath}`);
  } catch (err) {
    console.error(` ERROR: ${(err as Error).message}`);
  }
  // 12.5s between calls to stay under 5 calls/min
  if (i < TICKERS.length - 1) {
    process.stdout.write("  waiting 12.5s...\n");
    await new Promise(r => setTimeout(r, 12500));
  }
}
console.log("\nAll done. Run backtest-local.ts next.");
