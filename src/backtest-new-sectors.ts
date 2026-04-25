/**
 * backtest-phase2.ts — Phase 2 backtesting engine
 *
 * Runs Williams AC rojo→verde signal on 80 individual tickers (4 sectors × 20).
 * New vs Phase 1:
 *   - Macro filter: S&P 500 (SPY) SMA(40W) — signals only valid when SPY > SMA40
 *   - Cleanliness score: penalizes signals with >15% drawdown even if final return is positive
 *   - Dynamic AO lag: actual weeks until AO crosses zero (vs fixed windows)
 *   - Output: top outliers per sector
 */

import { readFileSync, existsSync } from "fs";
import { calculateIndicators } from "./indicators.js";
import { detectSignals } from "./signals.js";
import { SECTOR_COMPONENTS, MACRO_TICKER } from "./get-components.js";
import type { WeeklyCandle } from "./data.js";

const CACHE_DIR = "/tmp/williams-entry-radar/data/cache";
const RESULTS_DIR = "/tmp/williams-entry-radar/results";

interface TickerResult {
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
  cleanSignals: number; // signals with maxDD < 15%
  cleanHitRate: number; // hit rate on clean signals only
  score: number; // composite score (hit rate × clean ratio / drawdown)
  bestReturn8W: number;
  worstReturn8W: number;
}

interface SignalOutcome {
  ticker: string;
  date: string;
  sector: string;
  ret4W: number;
  ret8W: number;
  ret12W: number;
  maxDD: number;
  aoLag: number; // weeks until AO crosses zero
  macroFilter: "bull" | "bear"; // SPY vs SMA40 at signal date
  clean: boolean; // maxDD < 15%
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
 * Max drawdown in the `weeks` bars AFTER entry.
 * `entryIdx` is the bar whose close is the fill price (i.e. signalIdx + 1).
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
  return maxDD; // negative number
}

/**
 * Forward return from entry close to `entry + weeks` close.
 * `entryIdx` must be the fill bar (signalIdx + 1), not the signal bar,
 * otherwise the return double-counts the signal bar's move.
 */
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
  // How many weeks after signal until AO crosses to positive
  let lag = 0;
  for (let i = signalIdx + 1; i < bars.length && i < signalIdx + 52; i++) {
    lag++;
    if (bars[i].ao > 0) return lag;
  }
  return lag; // never crossed in window
}

function buildSpy40SmaMap(spyCandles: WeeklyCandle[]): Map<string, boolean> {
  // Returns map of date → (SPY > SMA40W)
  const closes = spyCandles.map((c) => c.close);
  const result = new Map<string, boolean>();

  for (let i = 0; i < spyCandles.length; i++) {
    if (i < 39) {
      result.set(spyCandles[i].date, false); // not enough data
      continue;
    }
    const slice = closes.slice(i - 39, i + 1);
    const sma40 = slice.reduce((a, b) => a + b, 0) / 40;
    result.set(spyCandles[i].date, closes[i] > sma40);
  }
  return result;
}

async function main() {
  const { mkdirSync, writeFileSync } = await import("fs");
  mkdirSync(RESULTS_DIR, { recursive: true });

  // Load SPY for macro filter
  const spyCandles = loadCache(MACRO_TICKER);
  if (!spyCandles) {
    console.error("SPY cache not found. Run fetch-phase2.ts first.");
    process.exit(1);
  }
  const macroMap = buildSpy40SmaMap(spyCandles);
  console.log(`SPY macro filter loaded: ${macroMap.size} weeks`);

  const allOutcomes: SignalOutcome[] = [];
  const tickerResults: TickerResult[] = [];

  let totalTickers = 0;
  let missingCache = 0;

  for (const [etf, { name, tickers }] of Object.entries(SECTOR_COMPONENTS).filter(([k])=>["XLF","XLV","XLB","XLY"].includes(k))) {
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
      const signals = detectSignals(ticker, bars);

      if (signals.length === 0) {
        console.log(`  ${ticker}: 0 signals`);
        continue;
      }

      // Map bars by date for index lookup
      const barDateMap = new Map(bars.map((b, i) => [b.date, i]));
      const candleDateMap = new Map(candles.map((c, i) => [c.date, i]));

      const outcomes: SignalOutcome[] = [];

      for (const sig of signals) {
        const candleIdx = candleDateMap.get(sig.date);
        const barIdx = barDateMap.get(sig.date);
        if (candleIdx === undefined || barIdx === undefined) continue;

        // Lookahead fix: fill on the bar AFTER the signal, not ON it.
        const entryIdx = candleIdx + 1;
        // Need at least 12 weeks forward from the entry bar
        if (entryIdx + 12 >= candles.length) continue;

        const ret4W = computeReturn(candles, entryIdx, 4);
        const ret8W = computeReturn(candles, entryIdx, 8);
        const ret12W = computeReturn(candles, entryIdx, 12);
        const maxDD = computeMaxDrawdown(candles, entryIdx, 12);
        const aoLag = computeAoLag(bars, barIdx);

        // Macro filter: is SPY above SMA40 at signal date?
        // Find closest SPY date
        const macroIsBull = macroMap.get(sig.date) ?? false;

        outcomes.push({
          ticker,
          date: sig.date,
          sector: etf,
          ret4W,
          ret8W,
          ret12W,
          maxDD,
          aoLag,
          macroFilter: macroIsBull ? "bull" : "bear",
          clean: maxDD > -0.15,
        });
      }

      if (outcomes.length === 0) continue;

      // Aggregate per ticker
      const hits8W = outcomes.filter((o) => o.ret8W > 0).length;
      const cleanSigs = outcomes.filter((o) => o.clean);
      const cleanHits = cleanSigs.filter((o) => o.ret8W > 0).length;

      const avg = (arr: number[]) =>
        arr.reduce((a, b) => a + b, 0) / arr.length;

      const hitRate8W = hits8W / outcomes.length;
      const avgReturn4W = avg(outcomes.map((o) => o.ret4W));
      const avgReturn8W = avg(outcomes.map((o) => o.ret8W));
      const avgReturn12W = avg(outcomes.map((o) => o.ret12W));
      const avgMaxDD = avg(outcomes.map((o) => o.maxDD));
      const avgAoLag = avg(outcomes.map((o) => o.aoLag));
      const cleanHitRate =
        cleanSigs.length > 0 ? cleanHits / cleanSigs.length : 0;

      // Composite score: rewards high hit rate + clean signals + positive return, penalizes drawdown
      const score =
        ((hitRate8W * 0.4 +
          cleanHitRate * 0.3 +
          Math.min(avgReturn8W * 5, 0.3)) *
          (1 + cleanSigs.length / outcomes.length)) /
        (1 + Math.abs(avgMaxDD) * 3);

      const ret8Ws = outcomes.map((o) => o.ret8W);

      tickerResults.push({
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
        cleanSignals: cleanSigs.length,
        cleanHitRate,
        score,
        bestReturn8W: Math.max(...ret8Ws),
        worstReturn8W: Math.min(...ret8Ws),
      });

      allOutcomes.push(...outcomes);

      console.log(
        `  ${ticker}: ${outcomes.length} signals, ` +
          `HR=${(hitRate8W * 100).toFixed(0)}%, ` +
          `ret8W=${(avgReturn8W * 100).toFixed(1)}%, ` +
          `DD=${(avgMaxDD * 100).toFixed(1)}%, ` +
          `score=${score.toFixed(3)}`,
      );
    }
  }

  // Sort by score
  tickerResults.sort((a, b) => b.score - a.score);

  // Write full outcomes CSV
  const outcomesCsv = [
    "ticker,date,sector,ret4W,ret8W,ret12W,maxDD,aoLag,macroFilter,clean",
    ...allOutcomes.map((o) =>
      [
        o.ticker,
        o.date,
        o.sector,
        (o.ret4W * 100).toFixed(2),
        (o.ret8W * 100).toFixed(2),
        (o.ret12W * 100).toFixed(2),
        (o.maxDD * 100).toFixed(2),
        o.aoLag,
        o.macroFilter,
        o.clean ? "1" : "0",
      ].join(","),
    ),
  ].join("\n");
  writeFileSync(`${RESULTS_DIR}/phase2_outcomes.csv`, outcomesCsv);

  // Write ticker scorecard CSV
  const scorecardCsv = [
    "rank,ticker,sector,signals,hitRate8W,avgRet4W,avgRet8W,avgRet12W,avgMaxDD,avgAoLag,cleanSigs,cleanHitRate,score,bestRet8W,worstRet8W",
    ...tickerResults.map((r, i) =>
      [
        i + 1,
        r.ticker,
        r.sector,
        r.totalSignals,
        (r.hitRate8W * 100).toFixed(1),
        (r.avgReturn4W * 100).toFixed(2),
        (r.avgReturn8W * 100).toFixed(2),
        (r.avgReturn12W * 100).toFixed(2),
        (r.avgMaxDD * 100).toFixed(2),
        r.avgAoLag.toFixed(1),
        r.cleanSignals,
        (r.cleanHitRate * 100).toFixed(1),
        r.score.toFixed(4),
        (r.bestReturn8W * 100).toFixed(2),
        (r.worstReturn8W * 100).toFixed(2),
      ].join(","),
    ),
  ].join("\n");
  writeFileSync(`${RESULTS_DIR}/phase2_scorecard.csv`, scorecardCsv);

  // Print top 15 outliers
  console.log("\n\n=== TOP 15 OUTLIERS (by composite score) ===");
  console.log(
    "Rank | Ticker | Sector      | Signals | HR8W  | Ret8W  | MaxDD   | AoLag | Score",
  );
  console.log(
    "-----|--------|-------------|---------|-------|--------|---------|-------|------",
  );
  for (const r of tickerResults.slice(0, 15)) {
    console.log(
      `${String(tickerResults.indexOf(r) + 1).padStart(4)} | ` +
        `${r.ticker.padEnd(6)} | ` +
        `${r.sectorName.padEnd(11)} | ` +
        `${String(r.totalSignals).padStart(7)} | ` +
        `${(r.hitRate8W * 100).toFixed(0).padStart(4)}% | ` +
        `${r.avgReturn8W * 100 >= 0 ? "+" : ""}${(r.avgReturn8W * 100).toFixed(1).padStart(5)}% | ` +
        `${(r.avgMaxDD * 100).toFixed(1).padStart(6)}% | ` +
        `${r.avgAoLag.toFixed(1).padStart(5)}W | ` +
        `${r.score.toFixed(3)}`,
    );
  }

  // Sector summary
  console.log("\n\n=== SECTOR SUMMARY ===");
  for (const etf of Object.keys(SECTOR_COMPONENTS).filter(k=>["XLF","XLV","XLB","XLY"].includes(k))) {
    const sectorResults = tickerResults.filter((r) => r.sector === etf);
    if (sectorResults.length === 0) continue;
    const avg = (fn: (r: (typeof sectorResults)[0]) => number) =>
      sectorResults.reduce((s, r) => s + fn(r), 0) / sectorResults.length;
    const totalSigs = sectorResults.reduce((s, r) => s + r.totalSignals, 0);
    console.log(
      `${etf}: ${sectorResults.length} tickers, ${totalSigs} total signals, ` +
        `avgHR=${avg((r) => r.hitRate8W * 100).toFixed(1)}%, ` +
        `avgRet8W=${avg((r) => r.avgReturn8W * 100) >= 0 ? "+" : ""}${avg((r) => r.avgReturn8W * 100).toFixed(2)}%, ` +
        `avgDD=${avg((r) => r.avgMaxDD * 100).toFixed(1)}%`,
    );
  }

  // Macro filter analysis
  const bullSignals = allOutcomes.filter((o) => o.macroFilter === "bull");
  const bearSignals = allOutcomes.filter((o) => o.macroFilter === "bear");
  const bullHR =
    bullSignals.filter((o) => o.ret8W > 0).length / (bullSignals.length || 1);
  const bearHR =
    bearSignals.filter((o) => o.ret8W > 0).length / (bearSignals.length || 1);

  console.log("\n=== MACRO FILTER ANALYSIS ===");
  console.log(
    `Bull market signals (SPY > SMA40): ${bullSignals.length} → Hit Rate ${(bullHR * 100).toFixed(1)}%`,
  );
  console.log(
    `Bear market signals (SPY < SMA40): ${bearSignals.length} → Hit Rate ${(bearHR * 100).toFixed(1)}%`,
  );

  console.log(`\nTotal outcomes: ${allOutcomes.length}`);
  console.log(`Results saved: ${RESULTS_DIR}/`);
  console.log(`  - phase2_outcomes.csv (${allOutcomes.length} rows)`);
  console.log(`  - phase2_scorecard.csv (${tickerResults.length} tickers)`);

  if (missingCache > 0) {
    console.log(
      `\nWARNING: ${missingCache} tickers had no cache. Re-run fetch-phase2.ts.`,
    );
  }
}

main().catch(console.error);
