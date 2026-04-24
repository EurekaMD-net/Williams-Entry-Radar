/**
 * radar.ts — Williams Entry Radar CLI entry point
 *
 * Usage:
 *   tsx src/radar.ts                  → full scan (all 79+ tickers)
 *   tsx src/radar.ts --tier=1         → only Tier 1 outliers (fast, ~15 tickers)
 *   tsx src/radar.ts --ticker=SO      → single ticker with detail
 *   tsx src/radar.ts --expand=XLU:21-30  → add expansion batch to universe
 *
 * Output: console table + results/radar_YYYY-WNN.csv
 */

import { fetchAll } from "./fetcher.js";
import { runScan, scanTicker } from "./scanner.js";
import { printReport, saveCSV } from "./weekly-report.js";
import { getUniverseTickers, UNIVERSE, getMetaForTicker } from "./universe.js";
import { getCacheStats } from "./cache.js";

const args = process.argv.slice(2);

const tierArg = args.find((a) => a.startsWith("--tier="));
const tickerArg = args.find((a) => a.startsWith("--ticker="));
const tier = tierArg ? (parseInt(tierArg.split("=")[1]) as 1 | 2) : undefined;
const singleTicker = tickerArg ? tickerArg.split("=")[1].toUpperCase() : undefined;

const runDate = new Date().toISOString().slice(0, 10);

async function main(): Promise<void> {
  console.log(`\n  Williams Entry Radar — Run ${runDate}`);

  // Single ticker mode
  if (singleTicker) {
    console.log(`\n  Single ticker mode: ${singleTicker}\n`);
    const { fetchTicker } = await import("./fetcher.js");
    const { calculateIndicators } = await import("./indicators.js");

    const bars = await fetchTicker(singleTicker);
    const meta = getMetaForTicker(singleTicker);

    console.log(`  Fetched ${bars.length} weekly bars for ${singleTicker}`);
    if (!meta) console.log(`  (not in universe — no historical HR data)`);

    const indicatorBars = calculateIndicators(bars.map((b) => ({
      date: b.date, open: b.open, high: b.high, low: b.low,
      close: b.close, volume: b.volume, midpoint: (b.high + b.low) / 2,
    })));

    // Show last 4 bars
    console.log("\n  Last 4 weeks:");
    const last4 = indicatorBars.slice(-4);
    for (const b of last4) {
      console.log(`    ${b.date}  AO: ${b.ao.toFixed(4)}  AC: ${b.ac.toFixed(4)}  Color: ${b.acColor}`);
    }

    // Run scan
    const tickerBars = new Map([[singleTicker, bars]]);
    // Add SPY for context if in universe
    const spyBars = await (async () => {
      try { return await fetchTicker("SPY"); } catch { return []; }
    })();
    if (spyBars.length) tickerBars.set("SPY", spyBars);

    // Inject meta for the ticker if not in universe
    // Push temporarily so getMetaForTicker() finds it inside runScan/scanTicker
    let injected = false;
    if (!meta) {
      UNIVERSE.push({ ticker: singleTicker, sector: "?", tier: 2 });
      injected = true;
    }
    const results = runScan(tickerBars);
    // Clean up temporary injection
    if (injected) UNIVERSE.pop();
    const r = results.find((x) => x.ticker === singleTicker);
    if (r) {
      console.log(`\n  Signal: ${r.signalLevel}  |  Weeks active: ${r.weeksActive}  |  Signal date: ${r.signalDate ?? "—"}`);
      if (r.signalLevel === "S2") {
        console.log(`  AO recovery: ${r.aoRecovery?.toFixed(4)}  |  AO bottom depth: ${r.aoBottomDepth}W`);
      }
    }
    return;
  }

  // Full scan
  const cacheStats = getCacheStats();
  console.log(`  Cache: ${cacheStats.valid} valid / ${cacheStats.total} total (TTL 6d)`);

  const tickers = getUniverseTickers(tier);
  // Always include SPY for macro context
  const allTickers = [...new Set([...tickers, "SPY"])];

  console.log(`  Universe: ${tickers.length} tickers${tier ? ` (Tier ${tier})` : ""}`);
  console.log(`  Fetching data (cache-first, 1.1s delay for API calls)...\n`);

  let apiCalls = 0;
  const tickerBars = await fetchAll(allTickers, (done, total, ticker, fromCache) => {
    if (!fromCache) apiCalls++;
    const bar = fromCache ? "▪" : "●";
    process.stdout.write(`  ${bar} ${ticker.padEnd(6)} (${done}/${total})\r`);
  });

  console.log(`\n  Fetch complete — ${apiCalls} API calls, ${allTickers.length - apiCalls} from cache\n`);

  // Run scan
  const results = runScan(tickerBars);

  // Print report
  printReport(results, runDate);

  // Save CSV
  const csvPath = saveCSV(results, runDate);
  console.log(`  CSV saved: ${csvPath}\n`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
