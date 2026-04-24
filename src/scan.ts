/**
 * scan.ts — Live scanner: check current state of each ticker
 * Reports which tickers have an ACTIVE signal right now (last bar)
 * and which are in "watch" state (approaching signal conditions).
 */

import { fetchWeeklyData } from "./data.js";
import { calculateIndicators } from "./indicators.js";
import { detectSignals } from "./signals.js";

const UNIVERSE: Record<string, string[]> = {
  "Defensive": ["XLU", "XLP"],
  "Cyclical": ["XLE", "XLI"],
  "Growth/Tech": ["XLK", "XLY"],
  "High-Vol": ["XBI", "ARKG"],
};

const ALL_TICKERS = Object.values(UNIVERSE).flat();

type Status = "🚨 SIGNAL" | "👁 WATCH" | "⬇ BEAR" | "📈 BULL";

async function main(): Promise<void> {
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  WILLIAMS ENTRY RADAR — LIVE SCAN");
  console.log(`  ${new Date().toISOString().split("T")[0]}`);
  console.log("═══════════════════════════════════════════════════════\n");
  console.log("  Ticker  Group         AO        AC      Status");
  console.log("  ──────  ────────────  ────────  ──────  ──────────────");

  let processed = 0;
  const tickerToGroup: Record<string, string> = {};
  for (const [group, tickers] of Object.entries(UNIVERSE)) {
    for (const t of tickers) tickerToGroup[t] = group;
  }

  for (const ticker of ALL_TICKERS) {
    try {
      const candles = await fetchWeeklyData(ticker);
      const bars = calculateIndicators(candles);
      if (bars.length < 2) continue;

      const curr = bars[bars.length - 1];
      const prev = bars[bars.length - 2];
      const signals = detectSignals(ticker, bars);
      const lastSignal = signals[signals.length - 1];
      const isActiveSignal = lastSignal?.date === curr.date;

      let status: Status;
      if (isActiveSignal) {
        status = "🚨 SIGNAL";
      } else if (curr.ao < 0 && curr.ac < 0 && curr.acColor === "red" && prev.acColor === "red") {
        // AC still falling but both negative — approaching potential signal
        status = "👁 WATCH";
      } else if (curr.ao < 0) {
        status = "⬇ BEAR";
      } else {
        status = "📈 BULL";
      }

      const group = tickerToGroup[ticker];
      console.log(
        `  ${ticker.padEnd(6)}  ${group.padEnd(12)}  ` +
        `${curr.ao.toFixed(4).padStart(8)}  ${curr.ac.toFixed(4).padStart(6)}  ${status}`
      );

      processed++;
      if (processed < ALL_TICKERS.length) {
        await new Promise((r) => setTimeout(r, 13000));
      }
    } catch (err) {
      console.error(`  ${ticker}: ERROR — ${(err as Error).message}`);
    }
  }

  console.log("\n  Legend: 🚨 SIGNAL = active entry alert | 👁 WATCH = approaching | ⬇ BEAR = bearish | 📈 BULL = bullish");
  console.log();
}

main().catch(console.error);
