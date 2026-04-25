/**
 * fetch-tickers.ts — one-shot fetch of every ticker in the universe.
 *
 * Cache-first: tickers already in the SQLite weekly_bars cache are skipped
 * (no API call). Only missing or stale entries hit Alpha Vantage. Existing
 * 1.1s throttle in fetchAll() keeps us safely under AV's premium 75 req/min.
 *
 * Operator-triggered after a universe-expansion PR merges, so new tickers
 * have data before the next scheduled scan. Invoked via scripts/fetch.sh
 * which sources /etc/williams-radar.env (where AV_API_KEY lives).
 */

import { fetchAll } from "./fetcher.js";
import { getUniverseTickers } from "./universe.js";

async function main(): Promise<void> {
  const tickers = getUniverseTickers();
  console.log(
    `[fetch-tickers] ${tickers.length} tickers — cache-first, 1.1s inter-call throttle.`,
  );

  // Track which tickers were attempted from the API vs served from cache.
  // Counted in the progress callback (fromCache flag is authoritative) but
  // error tallying happens after — so an attempted-but-errored fetch ends
  // up in `attempted` AND `errored`. Final summary keeps these mutually
  // exclusive: succeeded = attempted - errored. (audit W3)
  let cachedCount = 0;
  let attemptedCount = 0;

  const results = await fetchAll(tickers, (done, total, ticker, fromCache) => {
    if (fromCache) cachedCount++;
    else attemptedCount++;
    process.stdout.write(
      `[${String(done).padStart(3)}/${total}] ${ticker.padEnd(6)} ${fromCache ? "cache" : "fetched"}\n`,
    );
  });

  let erroredCount = 0;
  for (const bars of results.values()) {
    if (bars.length === 0) erroredCount++;
  }
  const succeededCount = attemptedCount - erroredCount;

  console.log(
    `\n[fetch-tickers] cache=${cachedCount} fetched=${succeededCount} errors=${erroredCount} total=${tickers.length}`,
  );
  if (erroredCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[fetch-tickers] fatal:", err);
  process.exit(1);
});
