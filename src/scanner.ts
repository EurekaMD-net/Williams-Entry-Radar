/**
 * scanner.ts — Weekly scan engine for Williams Entry Radar
 *
 * Evaluates ONLY the last bar (current week). No lookback windows for signal validity.
 *
 * S1 — Observation: last bar has AO<0, AC<0, AC[t] > AC[t-1] (AC turned green)
 * S2 — Attention: last bar has AO<0, AC[t-1]<0 AND AC[t]>=0 (AC just crossed zero)
 *
 * Price context (104-week window):
 *   nearLows  — close in bottom 30th percentile of 104-week range → doubly interesting
 *   ranging   — price range over last 12 weeks < 15% of avg price → lateral, low conviction
 */

import type { WeeklyBar } from "./fetcher.js";
import { calculateIndicators } from "./indicators.js";
import { getMetaForTicker } from "./universe.js";

export type SignalLevel = "S2" | "S1" | "none";

export interface ScanResult {
  ticker: string;
  sector: string;
  tier: 1 | 2;
  signalLevel: SignalLevel;
  signalDate: string | null;
  weeksActive: number;        // always 0 — signal is this week only
  ao: number;
  ac: number;
  acColor: string;
  hrHistorical?: number;
  avgRetHistorical?: number;
  maxDdHistorical?: number;
  aoLagHistorical?: number;
  // Price context
  nearLows: boolean;          // close in bottom 30% of 104-week range
  ranging: boolean;           // price lateralizing — low conviction signal
  pricePercentile: number;    // 0-100, where close sits in 104-week range
}

const PRICE_LOOKBACK_WEEKS = 104;
const RANGE_CHECK_WEEKS    = 12;
const NEAR_LOWS_PCT        = 30;    // percentile threshold for "near lows"
const RANGING_THRESHOLD    = 0.15;  // 15% range/avg price = lateral

function priceContext(bars: WeeklyBar[]): { nearLows: boolean; ranging: boolean; pricePercentile: number } {
  // Use up to last 104 weekly bars
  const window104 = bars.slice(-PRICE_LOOKBACK_WEEKS);
  const closes104 = window104.map((b) => b.close);
  const min104 = Math.min(...closes104);
  const max104 = Math.max(...closes104);
  const currentClose = closes104[closes104.length - 1];

  const range104 = max104 - min104;
  const pricePercentile = range104 === 0 ? 50 : ((currentClose - min104) / range104) * 100;
  const nearLows = pricePercentile <= NEAR_LOWS_PCT;

  // Ranging check: last 12 weeks
  const window12 = bars.slice(-RANGE_CHECK_WEEKS);
  const closes12 = window12.map((b) => b.close);
  const min12 = Math.min(...closes12);
  const max12 = Math.max(...closes12);
  const avg12 = closes12.reduce((s, v) => s + v, 0) / closes12.length;
  const ranging = avg12 > 0 && (max12 - min12) / avg12 < RANGING_THRESHOLD;

  return { nearLows, ranging, pricePercentile: Math.round(pricePercentile) };
}

export function scanTicker(ticker: string, bars: WeeklyBar[]): ScanResult {
  const meta = getMetaForTicker(ticker);
  const sector = meta?.sector ?? "?";
  const tier   = meta?.tier ?? 2;

  const base: Omit<ScanResult, "signalLevel" | "signalDate" | "weeksActive" | "ao" | "ac" | "acColor" | "nearLows" | "ranging" | "pricePercentile"> = {
    ticker,
    sector,
    tier,
    hrHistorical:    meta?.hrHistorical,
    avgRetHistorical: meta?.avgRetHistorical,
    maxDdHistorical: meta?.maxDdHistorical,
    aoLagHistorical: meta?.aoLagHistorical,
  };

  const ctx = bars.length >= RANGE_CHECK_WEEKS
    ? priceContext(bars)
    : { nearLows: false, ranging: false, pricePercentile: 50 };

  if (bars.length < 40) {
    return { ...base, signalLevel: "none", signalDate: null, weeksActive: 0, ao: 0, ac: 0, acColor: "?", ...ctx };
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
    return { ...base, signalLevel: "none", signalDate: null, weeksActive: 0, ao: 0, ac: 0, acColor: "?", ...ctx };
  }

  const last = indicatorBars[indicatorBars.length - 1];
  const prev = indicatorBars[indicatorBars.length - 2];
  const { ao, ac, acColor, date } = last;

  // ── S2: AC crossed zero THIS week, AO still negative ──────────────────────
  if (prev.ac < 0 && ac >= 0 && ao < 0) {
    return {
      ...base,
      signalLevel: "S2",
      signalDate: date,
      weeksActive: 0,
      ao, ac, acColor,
      ...ctx,
    };
  }

  // ── S1: AC turned green THIS week (still negative), AO still negative ─────
  if (ao < 0 && ac < 0 && acColor === "green" && prev.acColor === "red") {
    return {
      ...base,
      signalLevel: "S1",
      signalDate: date,
      weeksActive: 0,
      ao, ac, acColor,
      ...ctx,
    };
  }

  return { ...base, signalLevel: "none", signalDate: null, weeksActive: 0, ao, ac, acColor, ...ctx };
}

export function runScan(tickerBars: Map<string, WeeklyBar[]>): ScanResult[] {
  const results: ScanResult[] = [];

  for (const [ticker, bars] of tickerBars) {
    if (ticker === "SPY") continue;
    const result = scanTicker(ticker, bars);
    results.push(result);
  }

  // Sort: S2 first, then S1, then none
  // Within same level: nearLows first, then Tier 1, then HR desc
  results.sort((a, b) => {
    const levelOrder: Record<SignalLevel, number> = { S2: 0, S1: 1, none: 2 };
    if (levelOrder[a.signalLevel] !== levelOrder[b.signalLevel]) {
      return levelOrder[a.signalLevel] - levelOrder[b.signalLevel];
    }
    // nearLows floats up
    if (a.nearLows !== b.nearLows) return a.nearLows ? -1 : 1;
    if (a.tier !== b.tier) return a.tier - b.tier;
    return (b.hrHistorical ?? 0) - (a.hrHistorical ?? 0);
  });

  return results;
}
