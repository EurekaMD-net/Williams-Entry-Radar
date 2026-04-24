/**
 * expand.ts — Weekly universe expansion + ticker discard management
 *
 * Rules (Fede, 2026-04-24):
 *   DISCARD: only when ALL of these hold:
 *     1. Signal is ≥ 20 weeks old  (MIN_SIGNAL_AGE_TO_DISCARD)
 *     2. AO has never turned positive in that window (no confirmation)
 *     3. OR: an extraordinary structural break is explicitly confirmed
 *      (e.g. company announces bankruptcy, implosion, or sector invalidation)
 *   DISCARD IS IMMEDIATE once those conditions are met.
 *   Historical data is NEVER deleted — discard just removes from live scan.
 *
 * CLI usage:
 *   npx tsx src/index.ts --expand=XLU:21-30    → add batch from expansion schedule
 *   npx tsx src/index.ts --discard=KHC --reason="..." → discard a ticker
 *   npx tsx src/index.ts --check-stale         → report tickers near 20w threshold
 */

import { discardTicker, ensureTicker } from "./db.js";
import { EXPANSION_SCHEDULE, UNIVERSE, type TickerMeta } from "./universe.js";
import { isCacheValid } from "./cache.js";

export const MIN_SIGNAL_AGE_TO_DISCARD = 20; // weeks — minimum age before a signal can be discarded

/**
 * Add a batch of tickers to the registry and trigger an initial data fetch.
 * Batch format: "XLU:21-30" maps to expansion schedule week for that sector.
 */
export async function expandUniverse(batchSpec: string): Promise<void> {
  // Parse spec: "XLU:21-30" or "XLU:2" (week number)
  const [sector, rangeOrWeek] = batchSpec.split(":");
  if (!sector) {
    console.error("[expand] Invalid batch spec. Use: SECTOR:rank-range or SECTOR:week-number");
    process.exit(1);
  }

  // Find matching expansion schedule entry
  const schedule = EXPANSION_SCHEDULE.find((s) => s.sector.toUpperCase() === sector.toUpperCase());
  if (!schedule) {
    console.error(`[expand] No expansion schedule found for sector: ${sector}`);
    console.error(`  Available: ${EXPANSION_SCHEDULE.map((s) => s.sector).join(", ")}`);
    process.exit(1);
  }

  // Filter by rank range if specified (e.g. "21-30")
  let tickers = schedule.tickers;
  if (rangeOrWeek && rangeOrWeek.includes("-")) {
    const [startStr, endStr] = rangeOrWeek.split("-");
    const start = parseInt(startStr, 10);
    const end = parseInt(endStr, 10);
    // Expansion schedule starts at rank 21 — index offset accordingly
    const baseRank = 21;
    tickers = tickers.filter((_, i) => {
      const rank = baseRank + i;
      return rank >= start && rank <= end;
    });
  }

  if (tickers.length === 0) {
    console.log("[expand] No tickers match the specified range.");
    return;
  }

  console.log(`[expand] Adding ${tickers.length} tickers to ${sector} universe: ${tickers.join(", ")}`);

  for (const ticker of tickers) {
    // Already in universe?
    const existing = UNIVERSE.find((t) => t.ticker === ticker);
    if (existing) {
      console.log(`  [skip] ${ticker} — already in universe`);
      continue;
    }

    // Register in DB
    ensureTicker(ticker, sector, 2);
    console.log(`  [+] ${ticker} registered as Tier 2 / ${sector}`);

    // Initial fetch if not cached
    if (!isCacheValid(ticker)) {
      console.log(`  [fetch] ${ticker}...`);
      try {
        await fetchWeeklyBarsForTicker(ticker);
        console.log(`  [✓] ${ticker} cached`);
      } catch (err) {
        console.error(`  [!] ${ticker} fetch failed: ${(err as Error).message}`);
      }
      // Sequential — 1.1s delay
      await new Promise((r) => setTimeout(r, 1100));
    } else {
      console.log(`  [cache] ${ticker} already fresh`);
    }
  }

  console.log("[expand] Done.");
}

/**
 * Discard a ticker from the live scan.
 * Data is preserved. Use when signal is ≥ 20 weeks old with no confirmation,
 * OR for an immediate structural break (e.g. bankruptcy filing).
 */
export function discardTickerWithReason(ticker: string, reason: string): void {
  if (!reason || reason.trim().length < 10) {
    console.error("[discard] Reason too short — be descriptive (min 10 chars).");
    process.exit(1);
  }
  discardTicker(ticker, reason.trim());
  console.log(`[discard] ${ticker} removed from live scan.`);
  console.log(`  Reason: ${reason}`);
  console.log(`  Historical data preserved. Ticker status = 'discarded' in registry.`);
}

/**
 * Report tickers in S1 that are approaching the 20-week discard threshold.
 * Called with --check-stale. Useful for the Thursday pre-scan review.
 */
export function checkStaleSignals(
  activeSignals: Array<{ ticker: string; signalLevel: string; weeksActive: number }>
): void {
  const WARNING_THRESHOLD = 16; // warn at 16 weeks
  const candidates = activeSignals.filter(
    (s) => s.signalLevel === "S1" && s.weeksActive >= WARNING_THRESHOLD
  );

  if (candidates.length === 0) {
    console.log("[stale] No S1 signals approaching 20-week threshold.");
    return;
  }

  console.log(`\n[stale] ⚠️  S1 signals approaching ${MIN_SIGNAL_AGE_TO_DISCARD}w discard threshold:\n`);
  for (const c of candidates) {
    const remaining = MIN_SIGNAL_AGE_TO_DISCARD - c.weeksActive;
    const label = c.weeksActive >= MIN_SIGNAL_AGE_TO_DISCARD
      ? "⛔ ELIGIBLE FOR DISCARD"
      : `⚠️  ${remaining}w remaining`;
    console.log(`  ${c.ticker.padEnd(7)} — ${c.weeksActive}w active  ${label}`);
  }
  console.log();
}

// ── Fetch helper (wraps fetcher.ts public API) ──────────────────────────────
async function fetchWeeklyBarsForTicker(ticker: string): Promise<void> {
  const { fetchTicker } = await import("./fetcher.js");
  await fetchTicker(ticker);
}
