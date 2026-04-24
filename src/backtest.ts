/**
 * backtest.ts — Main backtesting engine
 *
 * For each detected signal, measures forward returns at 4W, 8W, 12W,
 * max drawdown in the 12W window, and lag to AO zero cross.
 *
 * Outputs:
 *   - All signals with outcomes (CSV)
 *   - Scorecard per ticker group (console)
 */

import { fetchWeeklyData } from "./data.js";
import { calculateIndicators } from "./indicators.js";
import { detectSignals } from "./signals.js";
import type { IndicatorBar } from "./indicators.js";
import type { Signal } from "./signals.js";
import { writeFileSync } from "fs";

// ─── Universe ────────────────────────────────────────────────────────────────
const UNIVERSE: Record<string, string[]> = {
  "Defensive": ["XLU", "XLP"],
  "Cyclical": ["XLE", "XLI"],
  "Growth/Tech": ["XLK", "XLY"],
  "High-Vol": ["XBI", "ARKG"],
};

const ALL_TICKERS = Object.values(UNIVERSE).flat();

// ─── Outcome measurement ─────────────────────────────────────────────────────
interface Outcome {
  signal: Signal;
  group: string;
  entryPrice: number;
  return4W: number | null;
  return8W: number | null;
  return12W: number | null;
  maxDrawdown12W: number | null;
  aoLagWeeks: number | null;   // weeks until AO crosses zero (null if never in 12W)
}

function measureOutcome(
  signal: Signal,
  bars: IndicatorBar[],
  group: string
): Outcome {
  const idx = signal.signalIndex;
  const entryPrice = bars[idx].close;

  const fwd = (weeks: number): number | null => {
    const target = bars[idx + weeks];
    if (!target) return null;
    return (target.close - entryPrice) / entryPrice * 100;
  };

  // Max drawdown in 12W window
  let maxDrawdown12W: number | null = null;
  let peak = entryPrice;
  for (let w = 1; w <= 12; w++) {
    const bar = bars[idx + w];
    if (!bar) break;
    if (bar.close > peak) peak = bar.close;
    const dd = (bar.close - peak) / peak * 100;
    if (maxDrawdown12W === null || dd < maxDrawdown12W) maxDrawdown12W = dd;
  }

  // AO lag: how many weeks until AO crosses from negative to positive
  let aoLagWeeks: number | null = null;
  for (let w = 1; w <= 12; w++) {
    const bar = bars[idx + w];
    if (!bar) break;
    if (bar.ao > 0) {
      aoLagWeeks = w;
      break;
    }
  }

  return {
    signal,
    group,
    entryPrice,
    return4W: fwd(4),
    return8W: fwd(8),
    return12W: fwd(12),
    maxDrawdown12W,
    aoLagWeeks,
  };
}

// ─── Stats ────────────────────────────────────────────────────────────────────
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function hitRate(values: number[]): number {
  if (values.length === 0) return 0;
  return values.filter((v) => v > 0).length / values.length * 100;
}

// ─── Report ───────────────────────────────────────────────────────────────────
function printScorecard(outcomes: Outcome[]): void {
  const groups = [...new Set(outcomes.map((o) => o.group))];

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  WILLIAMS ENTRY RADAR — BACKTEST SCORECARD (2019–2026, Weekly)");
  console.log("═══════════════════════════════════════════════════════════════\n");

  for (const group of groups) {
    const g = outcomes.filter((o) => o.group === group);
    const r8 = g.map((o) => o.return8W).filter((v): v is number => v !== null);
    const r4 = g.map((o) => o.return4W).filter((v): v is number => v !== null);
    const r12 = g.map((o) => o.return12W).filter((v): v is number => v !== null);
    const dd = g.map((o) => o.maxDrawdown12W).filter((v): v is number => v !== null);
    const lag = g.map((o) => o.aoLagWeeks).filter((v): v is number => v !== null);

    console.log(`▶ ${group}`);
    console.log(`  Signals detected : ${g.length}`);
    console.log(`  Hit rate 8W      : ${hitRate(r8).toFixed(1)}%  (${r8.filter(v=>v>0).length}/${r8.length} positive)`);
    console.log(`  Avg return 4W    : ${mean(r4).toFixed(2)}%`);
    console.log(`  Avg return 8W    : ${mean(r8).toFixed(2)}%`);
    console.log(`  Avg return 12W   : ${mean(r12).toFixed(2)}%`);
    console.log(`  Avg max drawdown : ${mean(dd).toFixed(2)}%`);
    console.log(`  Avg AO lag       : ${lag.length > 0 ? mean(lag).toFixed(1) + " weeks" : "N/A (AO stayed negative 12W)"}`);
    console.log();
  }

  // Top signals by 8W return
  const top10 = [...outcomes]
    .filter((o) => o.return8W !== null)
    .sort((a, b) => (b.return8W ?? 0) - (a.return8W ?? 0))
    .slice(0, 10);

  console.log("─── TOP 10 SIGNALS (8W return) ────────────────────────────────");
  console.log("  Ticker  Date        Group         4W%    8W%   12W%   MaxDD%");
  for (const o of top10) {
    console.log(
      `  ${o.signal.ticker.padEnd(6)}  ${o.signal.date}  ${o.group.padEnd(12)}  ` +
      `${(o.return4W ?? 0).toFixed(1).padStart(5)}  ${(o.return8W ?? 0).toFixed(1).padStart(5)}  ` +
      `${(o.return12W ?? 0).toFixed(1).padStart(5)}  ${(o.maxDrawdown12W ?? 0).toFixed(1).padStart(7)}`
    );
  }
  console.log();
}

function exportCsv(outcomes: Outcome[], path: string): void {
  const header = "ticker,group,date,ao,ac,acBottomDepth,entryPrice,return4W,return8W,return12W,maxDrawdown12W,aoLagWeeks";
  const rows = outcomes.map((o) =>
    [
      o.signal.ticker,
      o.group,
      o.signal.date,
      o.signal.ao.toFixed(4),
      o.signal.ac.toFixed(4),
      o.signal.acBottomDepth.toFixed(4),
      o.entryPrice.toFixed(2),
      o.return4W?.toFixed(2) ?? "",
      o.return8W?.toFixed(2) ?? "",
      o.return12W?.toFixed(2) ?? "",
      o.maxDrawdown12W?.toFixed(2) ?? "",
      o.aoLagWeeks?.toString() ?? "",
    ].join(",")
  );
  writeFileSync(path, [header, ...rows].join("\n"));
  console.log(`CSV saved → ${path}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const tickerToGroup: Record<string, string> = {};
  for (const [group, tickers] of Object.entries(UNIVERSE)) {
    for (const t of tickers) tickerToGroup[t] = group;
  }

  const allOutcomes: Outcome[] = [];
  let processed = 0;

  for (const ticker of ALL_TICKERS) {
    process.stdout.write(`Fetching ${ticker}...`);
    try {
      const candles = await fetchWeeklyData(ticker);
      const bars = calculateIndicators(candles);
      const signals = detectSignals(ticker, bars);
      const group = tickerToGroup[ticker];

      for (const signal of signals) {
        const outcome = measureOutcome(signal, bars, group);
        allOutcomes.push(outcome);
      }

      console.log(` ${candles.length} weeks, ${signals.length} signals`);
      processed++;

      // Alpha Vantage free tier: 5 calls/min — add delay between calls
      if (processed < ALL_TICKERS.length) {
        await new Promise((r) => setTimeout(r, 12500)); // 12.5s gap = ~4.8 calls/min
      }
    } catch (err) {
      console.error(` ERROR: ${(err as Error).message}`);
    }
  }

  printScorecard(allOutcomes);
  exportCsv(allOutcomes, "/tmp/williams_backtest_results.csv");
}

main().catch(console.error);
