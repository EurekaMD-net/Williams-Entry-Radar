/**
 * signals.ts — Williams Entry Radar signal detection
 *
 * SIGNAL CONDITION (all must be true):
 *   1. AO < 0        (momentum still bearish)
 *   2. AC < 0        (acceleration still bearish)
 *   3. AC color = green  (first green bar — AC stopped deteriorating)
 *   4. Previous AC color = red  (confirms this is the first green, not continuation)
 *   5. AC is near its local bottom (within lookback window — avoids late entries)
 */

import type { IndicatorBar } from "./indicators.js";

export interface Signal {
  date: string;
  ticker: string;
  ao: number;
  ac: number;
  acBottomDepth: number;    // how far AC is from its 8-week minimum (0 = at the bottom)
  signalIndex: number;      // index in the bars array
}

const BOTTOM_LOOKBACK = 8; // weeks

export function detectSignals(ticker: string, bars: IndicatorBar[]): Signal[] {
  const signals: Signal[] = [];

  for (let i = 1; i < bars.length; i++) {
    const curr = bars[i];
    const prev = bars[i - 1];

    // Core conditions
    if (curr.ao >= 0) continue;      // AO must be negative
    if (curr.ac >= 0) continue;      // AC must be negative
    if (curr.acColor !== "green") continue;  // AC turning green
    if (prev.acColor !== "red") continue;    // previous was red (first green)

    // Local bottom check: AC should be near its minimum in the lookback window
    const start = Math.max(0, i - BOTTOM_LOOKBACK);
    const windowAcs = bars.slice(start, i + 1).map((b) => b.ac);
    const minAc = Math.min(...windowAcs);
    const acBottomDepth = curr.ac - minAc; // 0 = at the bottom, higher = farther from bottom

    signals.push({
      date: curr.date,
      ticker,
      ao: curr.ao,
      ac: curr.ac,
      acBottomDepth,
      signalIndex: i,
    });
  }

  return signals;
}
