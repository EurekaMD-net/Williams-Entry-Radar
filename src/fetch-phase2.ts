/**
 * fetch-phase2.ts — Batch downloader for Phase 2 (80 tickers + SPY)
 * Premium API: no delay needed. ~23s total for 81 tickers.
 * Cache: data/cache/{ticker}.json — skip if file exists and < 7 days old
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { fetchWeeklyData } from "./data.js";
import { getAllTickers } from "./get-components.js";

const CACHE_DIR = "/tmp/williams-entry-radar/data/cache";
const CACHE_TTL_DAYS = 7;

function isCacheFresh(ticker: string): boolean {
  const path = `${CACHE_DIR}/${ticker}.json`;
  if (!existsSync(path)) return false;
  const stat = JSON.parse(readFileSync(path, "utf-8"));
  // Check if fetched_at is within TTL
  const meta = (stat as { _fetched_at?: string })._fetched_at;
  if (!meta) return false;
  const age = (Date.now() - new Date(meta).getTime()) / (1000 * 60 * 60 * 24);
  return age < CACHE_TTL_DAYS;
}

async function main() {
  mkdirSync(CACHE_DIR, { recursive: true });

  const tickers = getAllTickers();
  console.log(`Fetching ${tickers.length} tickers (cache-first, no delay)...`);

  let fetched = 0;
  let cached = 0;
  const errors: string[] = [];

  // Sequential with 1s delay (Premium: 75/min = 1.25/s safe cadence)
  // 81 tickers × 1s = ~81s → runs in background via nohup
  const DELAY_MS = 1000;
  const results: PromiseSettledResult<unknown>[] = [];

  for (const ticker of tickers) {
    const cachePath = `${CACHE_DIR}/${ticker}.json`;

    try {
      if (isCacheFresh(ticker)) {
        cached++;
        results.push({ status: "fulfilled", value: { ticker, status: "cached" } });
        process.stdout.write(`[cache] ${ticker} `);
        continue;
      }

      const candles = await fetchWeeklyData(ticker);
      const payload = { _fetched_at: new Date().toISOString(), candles };
      writeFileSync(cachePath, JSON.stringify(payload));
      fetched++;
      process.stdout.write(`[ok] ${ticker}(${candles.length}w) `);
      results.push({ status: "fulfilled", value: { ticker, status: "fetched", count: candles.length } });

      // Delay only after actual API call (not cached)
      await new Promise(r => setTimeout(r, DELAY_MS));
    } catch (err) {
      results.push({ status: "rejected", reason: err });
      process.stdout.write(`[ERR] ${ticker} `);
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  for (const r of results) {
    if (r.status === "rejected") {
      errors.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
    }
  }

  console.log(`\nDone: ${fetched} fetched, ${cached} from cache, ${errors.length} errors`);
  if (errors.length > 0) {
    console.log("Errors:");
    for (const e of errors) console.log(" -", e);
  }
  console.log(`Cache: ${CACHE_DIR}`);
}

main().catch(console.error);
