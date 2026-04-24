/**
 * backtest-s2.ts — S2 confirmation signal backtest
 *
 * Runs S2 signal (AC zero-cross with AO recovering from bottom) on the same
 * 79-ticker universe from Phase 2. Compares vs S1 results.
 *
 * Uses cached data only — no API calls needed.
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { calculateIndicators } from "./indicators.js";
import { detectSignalsS2 } from "./signals-s2.js";
import { SECTOR_COMPONENTS, MACRO_TICKER } from "./get-components.js";
import type { WeeklyCandle } from "./data.js";

const CACHE_DIR = "/tmp/williams-entry-radar/data/cache";
const RESULTS_DIR = "/tmp/williams-entry-radar/results";

interface TickerResultS2 {
  ticker: string;
  sector: string;
  sectorName: string;
  totalSignals: number;
  hitRate8W: number;
  avgReturn4W: number;
  avgReturn8W: number;
  avgReturn12W: number;
  avgMaxDD: number;
  avgAoLag: number;
  cleanSignals: number;
  cleanHitRate: number;
  score: number;
  bestReturn8W: number;
  worstReturn8W: number;
}

interface SignalOutcomeS2 {
  ticker: string;
  date: string;
  sector: string;
  ret4W: number;
  ret8W: number;
  ret12W: number;
  maxDD: number;
  aoLag: number;
  aoBottomDepth: number;
  aoRecovery: number;
  macroFilter: "bull" | "bear";
  clean: boolean;
}

function loadCache(ticker: string): WeeklyCandle[] | null {
  const path = `${CACHE_DIR}/${ticker}.json`;
  if (!existsSync(path)) return null;
  const raw = JSON.parse(readFileSync(path, "utf-8")) as {
    candles: WeeklyCandle[];
  };
  return raw.candles;
}

/**
 * Max drawdown across `weeks` bars AFTER the entry bar. `entryIdx` is
 * the fill bar (signalIdx + 1), not the signal bar — using the signal
 * bar as entry would bake lookahead into every number.
 */
function computeMaxDrawdown(
  candles: WeeklyCandle[],
  entryIdx: number,
  weeks: number,
): number {
  const endIdx = Math.min(entryIdx + weeks, candles.length - 1);
  const entryClose = candles[entryIdx].close;
  let maxDD = 0;
  for (let i = entryIdx + 1; i <= endIdx; i++) {
    const dd = (candles[i].close - entryClose) / entryClose;
    if (dd < maxDD) maxDD = dd;
  }
  return maxDD;
}

function computeReturn(
  candles: WeeklyCandle[],
  entryIdx: number,
  weeks: number,
): number {
  const targetIdx = Math.min(entryIdx + weeks, candles.length - 1);
  if (targetIdx <= entryIdx) return 0;
  return (
    (candles[targetIdx].close - candles[entryIdx].close) /
    candles[entryIdx].close
  );
}

function computeAoLag(
  bars: ReturnType<typeof calculateIndicators>,
  signalIdx: number,
): number {
  for (let i = signalIdx + 1; i < bars.length && i < signalIdx + 52; i++) {
    if (bars[i].ao > 0) return i - signalIdx;
  }
  return 52; // capped: didn't cross in a year
}

function buildSpy40SmaMap(spyCandles: WeeklyCandle[]): Map<string, boolean> {
  const closes = spyCandles.map((c) => c.close);
  const result = new Map<string, boolean>();
  for (let i = 0; i < spyCandles.length; i++) {
    if (i < 39) {
      result.set(spyCandles[i].date, false);
      continue;
    }
    const slice = closes.slice(i - 39, i + 1);
    const sma40 = slice.reduce((a, b) => a + b, 0) / 40;
    result.set(spyCandles[i].date, closes[i] > sma40);
  }
  return result;
}

async function main() {
  mkdirSync(RESULTS_DIR, { recursive: true });

  const spyCandles = loadCache(MACRO_TICKER);
  if (!spyCandles) {
    console.error("SPY cache not found. Run fetch-phase2.ts first.");
    process.exit(1);
  }
  const macroMap = buildSpy40SmaMap(spyCandles);
  console.log(`SPY macro filter loaded: ${macroMap.size} weeks`);

  const allOutcomes: SignalOutcomeS2[] = [];
  const tickerResults: TickerResultS2[] = [];
  let totalTickers = 0;
  let missingCache = 0;

  for (const [etf, { name, tickers }] of Object.entries(SECTOR_COMPONENTS)) {
    console.log(`\n=== ${etf} (${name}) ===`);

    for (const ticker of tickers) {
      totalTickers++;
      const candles = loadCache(ticker);
      if (!candles || candles.length < 50) {
        console.log(`  ${ticker}: NO CACHE (skip)`);
        missingCache++;
        continue;
      }

      const bars = calculateIndicators(candles);
      const signals = detectSignalsS2(ticker, bars);

      if (signals.length === 0) {
        console.log(`  ${ticker}: 0 S2 signals`);
        continue;
      }

      const barDateMap = new Map(bars.map((b, i) => [b.date, i]));
      const candleDateMap = new Map(candles.map((c, i) => [c.date, i]));

      const outcomes: SignalOutcomeS2[] = [];

      for (const sig of signals) {
        const candleIdx = candleDateMap.get(sig.date);
        const barIdx = barDateMap.get(sig.date);
        if (candleIdx === undefined || barIdx === undefined) continue;

        // Lookahead fix: fill on the bar AFTER the signal.
        const entryIdx = candleIdx + 1;
        if (entryIdx + 12 >= candles.length) continue; // need 12W forward

        const ret4W = computeReturn(candles, entryIdx, 4);
        const ret8W = computeReturn(candles, entryIdx, 8);
        const ret12W = computeReturn(candles, entryIdx, 12);
        const maxDD = computeMaxDrawdown(candles, entryIdx, 8);
        const aoLag = computeAoLag(bars, barIdx);
        const isBull = macroMap.get(sig.date) ?? false;

        outcomes.push({
          ticker,
          date: sig.date,
          sector: etf,
          ret4W,
          ret8W,
          ret12W,
          maxDD,
          aoLag,
          aoBottomDepth: sig.aoBottomDepth,
          aoRecovery: sig.aoRecovery,
          macroFilter: isBull ? "bull" : "bear",
          clean: maxDD > -0.15,
        });
      }

      if (outcomes.length === 0) continue;
      allOutcomes.push(...outcomes);

      // Compute ticker-level stats
      const hitRate8W =
        outcomes.filter((o) => o.ret8W > 0).length / outcomes.length;
      const avgReturn4W =
        outcomes.reduce((s, o) => s + o.ret4W, 0) / outcomes.length;
      const avgReturn8W =
        outcomes.reduce((s, o) => s + o.ret8W, 0) / outcomes.length;
      const avgReturn12W =
        outcomes.reduce((s, o) => s + o.ret12W, 0) / outcomes.length;
      const avgMaxDD =
        outcomes.reduce((s, o) => s + o.maxDD, 0) / outcomes.length;
      const avgAoLag =
        outcomes.reduce((s, o) => s + o.aoLag, 0) / outcomes.length;
      const cleanOutcomes = outcomes.filter((o) => o.clean);
      const cleanHitRate =
        cleanOutcomes.length > 0
          ? cleanOutcomes.filter((o) => o.ret8W > 0).length /
            cleanOutcomes.length
          : 0;

      // Composite score (same formula as Phase 2 for comparability)
      const samplePenalty = outcomes.length < 10 ? 0.5 : 1.0;
      const score =
        (((hitRate8W * 0.4 +
          cleanHitRate * 0.3 +
          Math.min(avgReturn8W * 5, 0.3)) *
          (1 + cleanOutcomes.length / Math.max(outcomes.length, 1))) /
          (1 + Math.abs(avgMaxDD) * 3)) *
        samplePenalty;

      const result: TickerResultS2 = {
        ticker,
        sector: etf,
        sectorName: name,
        totalSignals: outcomes.length,
        hitRate8W,
        avgReturn4W,
        avgReturn8W,
        avgReturn12W,
        avgMaxDD,
        avgAoLag,
        cleanSignals: cleanOutcomes.length,
        cleanHitRate,
        score,
        bestReturn8W: Math.max(...outcomes.map((o) => o.ret8W)),
        worstReturn8W: Math.min(...outcomes.map((o) => o.ret8W)),
      };

      tickerResults.push(result);
      console.log(
        `  ${ticker}: ${outcomes.length} S2 signals | HR=${(hitRate8W * 100).toFixed(1)}% | ret8W=${(avgReturn8W * 100).toFixed(2)}% | DD=${(avgMaxDD * 100).toFixed(2)}%`,
      );
    }
  }

  // Write outcomes CSV
  const outcomesHeader =
    "ticker,date,sector,ret4W,ret8W,ret12W,maxDD,aoLag,aoBottomDepth,aoRecovery,macroFilter,clean";
  const outcomesRows = allOutcomes.map((o) =>
    [
      o.ticker,
      o.date,
      o.sector,
      o.ret4W.toFixed(4),
      o.ret8W.toFixed(4),
      o.ret12W.toFixed(4),
      o.maxDD.toFixed(4),
      o.aoLag,
      o.aoBottomDepth,
      o.aoRecovery.toFixed(6),
      o.macroFilter,
      o.clean,
    ].join(","),
  );
  writeFileSync(
    `${RESULTS_DIR}/s2_outcomes.csv`,
    [outcomesHeader, ...outcomesRows].join("\n"),
  );

  // Write scorecard CSV
  const scorecardHeader =
    "ticker,sector,sectorName,totalSignals,hitRate8W,avgReturn4W,avgReturn8W,avgReturn12W,avgMaxDD,avgAoLag,cleanSignals,cleanHitRate,score,bestReturn8W,worstReturn8W";
  const scorecardRows = tickerResults
    .sort((a, b) => b.score - a.score)
    .map((r) =>
      [
        r.ticker,
        r.sector,
        r.sectorName,
        r.totalSignals,
        r.hitRate8W.toFixed(4),
        r.avgReturn4W.toFixed(4),
        r.avgReturn8W.toFixed(4),
        r.avgReturn12W.toFixed(4),
        r.avgMaxDD.toFixed(4),
        r.avgAoLag.toFixed(1),
        r.cleanSignals,
        r.cleanHitRate.toFixed(4),
        r.score.toFixed(4),
        r.bestReturn8W.toFixed(4),
        r.worstReturn8W.toFixed(4),
      ].join(","),
    );
  writeFileSync(
    `${RESULTS_DIR}/s2_scorecard.csv`,
    [scorecardHeader, ...scorecardRows].join("\n"),
  );

  console.log("\n=== S2 BACKTEST SUMMARY ===");
  console.log(`Tickers analyzed: ${totalTickers - missingCache}`);
  console.log(`Total S2 signals: ${allOutcomes.length}`);
  const overallHR =
    allOutcomes.filter((o) => o.ret8W > 0).length / allOutcomes.length;
  const overallDD =
    allOutcomes.reduce((s, o) => s + o.maxDD, 0) / allOutcomes.length;
  const overallRet =
    allOutcomes.reduce((s, o) => s + o.ret8W, 0) / allOutcomes.length;
  const overallLag =
    allOutcomes.reduce((s, o) => s + o.aoLag, 0) / allOutcomes.length;
  console.log(`Overall Hit Rate 8W: ${(overallHR * 100).toFixed(1)}%`);
  console.log(`Overall Avg Return 8W: ${(overallRet * 100).toFixed(2)}%`);
  console.log(`Overall Avg Max DD: ${(overallDD * 100).toFixed(2)}%`);
  console.log(`Overall Avg AO Lag: ${overallLag.toFixed(1)}W`);

  // Bull vs bear
  const bull = allOutcomes.filter((o) => o.macroFilter === "bull");
  const bear = allOutcomes.filter((o) => o.macroFilter === "bear");
  if (bull.length > 0 && bear.length > 0) {
    const bullHR = bull.filter((o) => o.ret8W > 0).length / bull.length;
    const bearHR = bear.filter((o) => o.ret8W > 0).length / bear.length;
    console.log(
      `\nMacro filter: Bull HR=${(bullHR * 100).toFixed(1)}% (n=${bull.length}) | Bear HR=${(bearHR * 100).toFixed(1)}% (n=${bear.length})`,
    );
  }

  console.log("\n=== TOP 15 S2 TICKERS BY SCORE ===");
  tickerResults
    .sort((a, b) => b.score - a.score)
    .slice(0, 15)
    .forEach((r, i) => {
      console.log(
        `${i + 1}. ${r.ticker} (${r.sector}) | ${r.totalSignals} signals | HR=${(r.hitRate8W * 100).toFixed(1)}% | ret8W=${(r.avgReturn8W * 100).toFixed(2)}% | DD=${(r.avgMaxDD * 100).toFixed(2)}% | score=${r.score.toFixed(3)}`,
      );
    });

  console.log("\nFiles written:");
  console.log(`  ${RESULTS_DIR}/s2_outcomes.csv (${allOutcomes.length} rows)`);
  console.log(
    `  ${RESULTS_DIR}/s2_scorecard.csv (${tickerResults.length} tickers)`,
  );
}

main().catch(console.error);
