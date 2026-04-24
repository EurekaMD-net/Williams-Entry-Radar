/**
 * scanner.ts — Weekly scan engine for Williams Entry Radar
 *
 * For each ticker:
 *   1. Load weekly bars from cache / fetch
 *   2. Calculate AO + AC indicators
 *   3. Check last bar for active S1 or S2 signal
 *   4. Return structured alert
 *
 * S1 — Observation: first AC green with AO<0 and AC<0
 * S2 — Attention: AC crosses zero, AO<0 but recovering from bottom
 */

import type { WeeklyBar } from "./fetcher.js";
import { calculateIndicators } from "./indicators.js";
import { detectSignals } from "./signals.js";
import { detectSignalsS2 } from "./signals-s2.js";
import { getMetaForTicker } from "./universe.js";

export type SignalLevel = "S2" | "S1" | "none";

export interface ScanResult {
  ticker: string;
  sector: string;
  tier: 1 | 2;
  signalLevel: SignalLevel;
  signalDate: string | null;
  weeksActive: number;        // how many weeks since signal triggered
  ao: number;
  ac: number;
  acColor: string;
  hrHistorical?: number;      // from Phase 2 backtest
  avgRetHistorical?: number;
  maxDdHistorical?: number;
  aoLagHistorical?: number;   // expected weeks until AO confirms
  // S2-specific
  aoRecovery?: number;
  aoBottomDepth?: number;
}

// Show signals active for up to 20 weeks — matches the discard rule in expand.ts.
// A signal is NEVER silently dropped before 20 weeks; explicit discard is required.
const SIGNAL_LOOKBACK_WEEKS = 20;

export function scanTicker(ticker: string, bars: WeeklyBar[]): ScanResult {
  const meta = getMetaForTicker(ticker);
  const sector = meta?.sector ?? "?";
  const tier = meta?.tier ?? 2;

  const base: Omit<ScanResult, "signalLevel" | "signalDate" | "weeksActive" | "ao" | "ac" | "acColor"> = {
    ticker,
    sector,
    tier,
    hrHistorical: meta?.hrHistorical,
    avgRetHistorical: meta?.avgRetHistorical,
    maxDdHistorical: meta?.maxDdHistorical,
    aoLagHistorical: meta?.aoLagHistorical,
  };

  if (bars.length < 40) {
    return { ...base, signalLevel: "none", signalDate: null, weeksActive: 0, ao: 0, ac: 0, acColor: "?" };
  }

  const indicatorBars = calculateIndicators(bars.map((b) => ({
    date: b.date,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
    midpoint: (b.high + b.low) / 2,
  })));

  if (indicatorBars.length < 2) {
    return { ...base, signalLevel: "none", signalDate: null, weeksActive: 0, ao: 0, ac: 0, acColor: "?" };
  }

  const lastBar = indicatorBars[indicatorBars.length - 1];
  const { ao, ac, acColor } = lastBar;

  // Check S2 (higher priority — show if active in last N weeks)
  const s2signals = detectSignalsS2(ticker, indicatorBars);
  if (s2signals.length > 0) {
    const lastS2 = s2signals[s2signals.length - 1];
    const weeksActive = indicatorBars.length - 1 - lastS2.signalIndex;
    if (weeksActive <= SIGNAL_LOOKBACK_WEEKS) {
      return {
        ...base,
        signalLevel: "S2",
        signalDate: lastS2.date,
        weeksActive,
        ao,
        ac,
        acColor,
        aoRecovery: lastS2.aoRecovery,
        aoBottomDepth: lastS2.aoBottomDepth,
      };
    }
  }

  // Check S1
  const s1signals = detectSignals(ticker, indicatorBars);
  if (s1signals.length > 0) {
    const lastS1 = s1signals[s1signals.length - 1];
    const weeksActive = indicatorBars.length - 1 - lastS1.signalIndex;
    if (weeksActive <= SIGNAL_LOOKBACK_WEEKS) {
      return {
        ...base,
        signalLevel: "S1",
        signalDate: lastS1.date,
        weeksActive,
        ao,
        ac,
        acColor,
      };
    }
  }

  return { ...base, signalLevel: "none", signalDate: null, weeksActive: 0, ao, ac, acColor };
}

export function runScan(tickerBars: Map<string, WeeklyBar[]>): ScanResult[] {
  const results: ScanResult[] = [];

  for (const [ticker, bars] of tickerBars) {
    if (ticker === "SPY") continue; // macro reference, not scanned
    const result = scanTicker(ticker, bars);
    results.push(result);
  }

  // Sort: S2 first, then S1, then none
  // Within same level: Tier 1 first, then by HR historical desc
  results.sort((a, b) => {
    const levelOrder: Record<SignalLevel, number> = { S2: 0, S1: 1, none: 2 };
    if (levelOrder[a.signalLevel] !== levelOrder[b.signalLevel]) {
      return levelOrder[a.signalLevel] - levelOrder[b.signalLevel];
    }
    if (a.tier !== b.tier) return a.tier - b.tier;
    return (b.hrHistorical ?? 0) - (a.hrHistorical ?? 0);
  });

  return results;
}
