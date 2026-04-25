/**
 * scanner.ts — Weekly scan engine for Williams Entry Radar
 *
 * Evaluates ONLY the last bar (current week). No lookback windows for signal validity.
 *
 * S1 — Observation: last bar has AO<0, AC<0, AC[t] > AC[t-1] (AC turned green)
 * S2 PURE — Attention: AO<0 AND AO[t]<AO[t-1] (AO still red/falling) AND AC crossed zero this week
 * S2 DEGRADED — AO<0 AND AO[t]>=AO[t-1] (AO already green/recovering) AND AC crossed zero this week
 *              The move started before AC confirmed — potential upside but not a clean entry.
 *
 * Price context (104-week window):
 *   nearLows  — close in bottom 30th percentile of 104-week range → doubly interesting
 *   ranging   — price range over last 12 weeks < 15% of avg price → lateral, low conviction
 */

import type { WeeklyBar } from "./fetcher.js";
import { calculateIndicators } from "./indicators.js";
import { getMetaForTicker } from "./universe.js";

export type SignalLevel = "S2" | "S2D" | "S1" | "none";
export type SignalQuality = "pure" | "degraded" | "n/a";

export interface ScanResult {
  ticker: string;
  sector: string;
  tier: 1 | 2;
  signalLevel: SignalLevel;
  signalQuality: SignalQuality; // "pure" = all conditions clean, "degraded" = AO already recovering
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

  const base: Omit<ScanResult, "signalLevel" | "signalQuality" | "signalDate" | "weeksActive" | "ao" | "ac" | "acColor" | "nearLows" | "ranging" | "pricePercentile"> = {
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
    return { ...base, signalLevel: "none", signalQuality: "n/a", signalDate: null, weeksActive: 0, ao: 0, ac: 0, acColor: "?", ...ctx };
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
    return { ...base, signalLevel: "none", signalQuality: "n/a", signalDate: null, weeksActive: 0, ao: 0, ac: 0, acColor: "?", ...ctx };
  }

  const last = indicatorBars[indicatorBars.length - 1];
  const prev = indicatorBars[indicatorBars.length - 2];
  const { ao, ac, acColor, date } = last;

  // ── S2 PURE: AC crossed zero THIS week, AO negative AND still falling (rojo) ─
  // AO[t] < AO[t-1] means AO is still red — momentum hasn't started recovering yet.
  // This is the cleanest entry: both oscillators agree the move hasn't begun.
  // Ranging tickers excluded — lateral price action makes the cross noise, not signal.
  if (prev.ac < 0 && ac >= 0 && ao < 0 && ao < prev.ao && !ctx.ranging) {
    return {
      ...base,
      signalLevel: "S2",
      signalQuality: "pure",
      signalDate: date,
      weeksActive: 0,
      ao, ac, acColor,
      ...ctx,
    };
  }

  // ── S2 DEGRADED: AC crossed zero THIS week, AO negative but already green ──
  // AO[t] >= AO[t-1] means AO is already recovering — the move started before AC confirmed.
  // Still worth watching (potential upside remains), but not a clean entry signal.
  // Example: BA in W17 2026 — AO had multiple green bars before AC crossed.
  // Ranging tickers excluded.
  if (prev.ac < 0 && ac >= 0 && ao < 0 && ao >= prev.ao && !ctx.ranging) {
    return {
      ...base,
      signalLevel: "S2D",
      signalQuality: "degraded",
      signalDate: date,
      weeksActive: 0,
      ao, ac, acColor,
      ...ctx,
    };
  }

  // ── S1: AC is green THIS week (AC[t] > AC[t-1]), both AO and AC negative ──
  // "Green" = AC rising vs prior week — regardless of how many weeks it has been green.
  // This captures the full duration of the S1 observation window, not just the first flip.
  // Ranging tickers excluded — oscillator moves within a band are not momentum.
  if (ao < 0 && ac < 0 && ac > prev.ac && !ctx.ranging) {
    return {
      ...base,
      signalLevel: "S1",
      signalQuality: "n/a",
      signalDate: date,
      weeksActive: 0,
      ao, ac, acColor,
      ...ctx,
    };
  }

  return { ...base, signalLevel: "none", signalQuality: "n/a", signalDate: null, weeksActive: 0, ao, ac, acColor, ...ctx };
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
    const levelOrder: Record<SignalLevel, number> = { S2: 0, S2D: 1, S1: 2, none: 3 };
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
