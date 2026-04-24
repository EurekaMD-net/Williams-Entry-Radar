/**
 * backtest-local.ts — Run backtest from cached JSON files (no API calls)
 * Must run fetch-all.ts first to populate /tmp/wer-cache/
 */
import { calculateIndicators } from "./indicators.js";
import { detectSignals } from "./signals.js";
import type { IndicatorBar } from "./indicators.js";
import type { Signal } from "./signals.js";
import type { WeeklyCandle } from "./data.js";
import { readFileSync, writeFileSync } from "fs";

const CACHE_DIR = "/tmp/wer-cache";
const UNIVERSE: Record<string, string[]> = {
  "Defensive":   ["XLU", "XLP"],
  "Cyclical":    ["XLE", "XLI"],
  "Growth/Tech": ["XLK", "XLY"],
  "High-Vol":    ["XBI", "ARKG"],
};
const ALL_TICKERS = Object.values(UNIVERSE).flat();

interface Outcome {
  signal: Signal;
  group: string;
  entryPrice: number;
  return4W: number | null;
  return8W: number | null;
  return12W: number | null;
  maxDrawdown12W: number | null;
  aoLagWeeks: number | null;
}

function measureOutcome(signal: Signal, bars: IndicatorBar[], group: string): Outcome {
  const idx = signal.signalIndex;
  const entryPrice = bars[idx].close;
  const fwd = (w: number) => bars[idx + w] ? (bars[idx + w].close - entryPrice) / entryPrice * 100 : null;

  let maxDrawdown12W: number | null = null;
  let peak = entryPrice;
  for (let w = 1; w <= 12; w++) {
    const bar = bars[idx + w];
    if (!bar) break;
    if (bar.close > peak) peak = bar.close;
    const dd = (bar.close - peak) / peak * 100;
    if (maxDrawdown12W === null || dd < maxDrawdown12W) maxDrawdown12W = dd;
  }

  let aoLagWeeks: number | null = null;
  for (let w = 1; w <= 12; w++) {
    if (bars[idx + w]?.ao > 0) { aoLagWeeks = w; break; }
  }

  return { signal, group, entryPrice, return4W: fwd(4), return8W: fwd(8), return12W: fwd(12), maxDrawdown12W, aoLagWeeks };
}

function mean(arr: number[]) { return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0; }
function hitRate(arr: number[]) { return arr.length ? arr.filter(v=>v>0).length/arr.length*100 : 0; }

function printScorecard(outcomes: Outcome[]) {
  const groups = [...new Set(outcomes.map(o => o.group))];
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  WILLIAMS ENTRY RADAR — BACKTEST SCORECARD (2019–2026, Weekly)");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const overallR8: number[] = [];
  for (const group of groups) {
    const g = outcomes.filter(o => o.group === group);
    const r4 = g.map(o => o.return4W).filter((v): v is number => v !== null);
    const r8 = g.map(o => o.return8W).filter((v): v is number => v !== null);
    const r12 = g.map(o => o.return12W).filter((v): v is number => v !== null);
    const dd = g.map(o => o.maxDrawdown12W).filter((v): v is number => v !== null);
    const lag = g.map(o => o.aoLagWeeks).filter((v): v is number => v !== null);
    overallR8.push(...r8);

    console.log(`▶ ${group}`);
    console.log(`  Signals          : ${g.length}`);
    console.log(`  Hit rate 8W      : ${hitRate(r8).toFixed(1)}%  (${r8.filter(v=>v>0).length}/${r8.length} positive)`);
    console.log(`  Avg return 4W    : ${mean(r4).toFixed(2)}%`);
    console.log(`  Avg return 8W    : ${mean(r8).toFixed(2)}%`);
    console.log(`  Avg return 12W   : ${mean(r12).toFixed(2)}%`);
    console.log(`  Avg max drawdown : ${mean(dd).toFixed(2)}%`);
    console.log(`  Avg AO lag       : ${lag.length ? mean(lag).toFixed(1)+" weeks" : "N/A"}`);
    console.log();
  }

  console.log(`OVERALL hit rate 8W: ${hitRate(overallR8).toFixed(1)}%  (${overallR8.filter(v=>v>0).length}/${overallR8.length})`);
  console.log();

  const top10 = [...outcomes]
    .filter(o => o.return8W !== null)
    .sort((a,b) => (b.return8W??0)-(a.return8W??0))
    .slice(0, 10);

  console.log("─── TOP 10 SIGNALS (8W return) ────────────────────────────────");
  console.log("  Ticker  Date        Group         4W%    8W%   12W%   MaxDD%");
  for (const o of top10) {
    console.log(
      `  ${o.signal.ticker.padEnd(6)}  ${o.signal.date}  ${o.group.padEnd(12)}  ` +
      `${(o.return4W??0).toFixed(1).padStart(5)}  ${(o.return8W??0).toFixed(1).padStart(5)}  ` +
      `${(o.return12W??0).toFixed(1).padStart(5)}  ${(o.maxDrawdown12W??0).toFixed(1).padStart(7)}`
    );
  }

  // Bottom 10 (worst outcomes — identify false signals)
  const bottom10 = [...outcomes]
    .filter(o => o.return8W !== null)
    .sort((a,b) => (a.return8W??0)-(b.return8W??0))
    .slice(0, 10);

  console.log("\n─── BOTTOM 10 SIGNALS (8W return — false positives) ───────────");
  console.log("  Ticker  Date        Group         4W%    8W%   12W%   MaxDD%");
  for (const o of bottom10) {
    console.log(
      `  ${o.signal.ticker.padEnd(6)}  ${o.signal.date}  ${o.group.padEnd(12)}  ` +
      `${(o.return4W??0).toFixed(1).padStart(5)}  ${(o.return8W??0).toFixed(1).padStart(5)}  ` +
      `${(o.return12W??0).toFixed(1).padStart(5)}  ${(o.maxDrawdown12W??0).toFixed(1).padStart(7)}`
    );
  }
  console.log();
}

function exportCsv(outcomes: Outcome[], path: string) {
  const header = "ticker,group,date,ao,ac,acBottomDepth,entryPrice,return4W,return8W,return12W,maxDrawdown12W,aoLagWeeks";
  const rows = outcomes.map(o => [
    o.signal.ticker, o.group, o.signal.date,
    o.signal.ao.toFixed(4), o.signal.ac.toFixed(4), o.signal.acBottomDepth.toFixed(4),
    o.entryPrice.toFixed(2),
    o.return4W?.toFixed(2)??"", o.return8W?.toFixed(2)??"", o.return12W?.toFixed(2)??"",
    o.maxDrawdown12W?.toFixed(2)??"", o.aoLagWeeks?.toString()??""
  ].join(","));
  writeFileSync(path, [header, ...rows].join("\n"));
  console.log(`CSV saved → ${path}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const tickerToGroup: Record<string, string> = {};
for (const [group, tickers] of Object.entries(UNIVERSE)) {
  for (const t of tickers) tickerToGroup[t] = group;
}

const allOutcomes: Outcome[] = [];

for (const ticker of ALL_TICKERS) {
  const cachePath = `${CACHE_DIR}/${ticker}.json`;
  try {
    const candles: WeeklyCandle[] = JSON.parse(readFileSync(cachePath, "utf-8"));
    const bars = calculateIndicators(candles);
    const signals = detectSignals(ticker, bars);
    const group = tickerToGroup[ticker];
    console.log(`${ticker}: ${bars.length} bars, ${signals.length} signals`);
    for (const signal of signals) {
      allOutcomes.push(measureOutcome(signal, bars, group));
    }
  } catch {
    console.error(`${ticker}: cache not found at ${cachePath} — run fetch-all.ts first`);
  }
}

printScorecard(allOutcomes);
exportCsv(allOutcomes, "/tmp/williams_backtest_results.csv");
