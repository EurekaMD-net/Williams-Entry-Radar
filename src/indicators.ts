/**
 * indicators.ts — Bill Williams AO and AC oscillator calculations
 *
 * AO = SMA(midpoint, 5) − SMA(midpoint, 34)
 * AC = AO − SMA(AO, 5)
 * Color: green if value[t] > value[t-1], red otherwise
 */

import type { WeeklyCandle } from "./data.js";

export type BarColor = "green" | "red";

export interface IndicatorBar {
  date: string;
  close: number;
  midpoint: number;
  ao: number;
  ac: number;
  aoColor: BarColor;
  acColor: BarColor;
}

function sma(values: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      const slice = values.slice(i - period + 1, i + 1);
      result.push(slice.reduce((a, b) => a + b, 0) / period);
    }
  }
  return result;
}

export function calculateIndicators(candles: WeeklyCandle[]): IndicatorBar[] {
  const midpoints = candles.map((c) => c.midpoint);

  const sma5 = sma(midpoints, 5);
  const sma34 = sma(midpoints, 34);

  // AO: needs 34 bars minimum
  const aoRaw: number[] = sma5.map((s5, i) => {
    if (isNaN(s5) || isNaN(sma34[i])) return NaN;
    return s5 - sma34[i];
  });

  // AC: needs AO SMA(5), so 34 + 4 = 38 bars minimum
  const aoForSma = aoRaw.map((v) => (isNaN(v) ? NaN : v));
  const smaAo5 = sma(aoForSma, 5);
  const acRaw: number[] = aoRaw.map((ao, i) => {
    if (isNaN(ao) || isNaN(smaAo5[i])) return NaN;
    return ao - smaAo5[i];
  });

  const result: IndicatorBar[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (isNaN(aoRaw[i]) || isNaN(acRaw[i])) continue;

    // Color = comparison to previous valid bar
    const prevIdx = result.length - 1;
    const prevAo = prevIdx >= 0 ? result[prevIdx].ao : aoRaw[i];
    const prevAc = prevIdx >= 0 ? result[prevIdx].ac : acRaw[i];

    result.push({
      date: candles[i].date,
      close: candles[i].close,
      midpoint: candles[i].midpoint,
      ao: aoRaw[i],
      ac: acRaw[i],
      aoColor: aoRaw[i] >= prevAo ? "green" : "red",
      acColor: acRaw[i] >= prevAc ? "green" : "red",
    });
  }

  return result;
}
