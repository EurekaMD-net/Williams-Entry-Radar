/**
 * signals-s2.ts — Williams Entry Radar S2 (Confirmation) signal detection
 *
 * S2 is a HIGHER QUALITY signal than S1. It requires:
 *   1. AC crosses ZERO from negative to positive (AC[t-1] < 0 AND AC[t] >= 0)
 *   2. AO is still negative (momentum not yet recovered)
 *   3. AO is recovering — higher than its recent bottom (within 5 weeks)
 *   4. AO hit its bottom recently (within 16 weeks) — avoids late entries
 *
 * Rationale (from PLUG case study):
 *   The first AC green bar (S1) often appears multiple times during a prolonged decline.
 *   S2 filters to only the signal where AC actually crosses zero — proving the momentum
 *   shift is real, not a momentary pause. Combined with AO still negative but recovering
 *   from its bottom, this captures the "inflection confirmed" moment.
 *
 * Expected behavior vs S1:
 *   - Fewer signals (higher bar to clear)
 *   - Higher hit rate (less noise, no false intermediate greens)
 *   - Lower drawdown (entering after the worst is over)
 *   - Longer AO lag (we're already past the AC confirmation)
 */

import type { IndicatorBar } from "./indicators.js";

export interface SignalS2 {
  date: string;
  ticker: string;
  ao: number;
  ac: number;
  acPrev: number;           // AC at t-1 (was negative)
  aoBottomDepth: number;    // weeks since AO hit its bottom (0 = right now)
  aoRecovery: number;       // AO gain from bottom (positive = recovering)
  signalIndex: number;
}

const AO_BOTTOM_LOOKBACK = 16; // weeks — how far back we look for AO bottom
const AO_RECOVERY_WINDOW = 5;  // weeks — AO must be rising for at least N weeks

export function detectSignalsS2(ticker: string, bars: IndicatorBar[]): SignalS2[] {
  const signals: SignalS2[] = [];

  for (let i = 1; i < bars.length; i++) {
    const curr = bars[i];
    const prev = bars[i - 1];

    // Condition 1: AC crosses zero (negative → non-negative)
    if (prev.ac >= 0) continue;   // previous must be negative
    if (curr.ac < 0) continue;    // current must be >= 0

    // Condition 2: AO still negative
    if (curr.ao >= 0) continue;

    // Condition 3: AO is recovering — must be higher than it was N weeks ago
    const recoveryStart = Math.max(0, i - AO_RECOVERY_WINDOW);
    const aoAtRecoveryStart = bars[recoveryStart].ao;
    if (curr.ao <= aoAtRecoveryStart) continue; // AO not recovering

    // Condition 4: AO hit its bottom within the lookback window
    const bottomStart = Math.max(0, i - AO_BOTTOM_LOOKBACK);
    const windowAos = bars.slice(bottomStart, i + 1).map((b) => b.ao);
    const minAo = Math.min(...windowAos);
    const minAoIdx = windowAos.indexOf(minAo) + bottomStart;
    const weeksSinceBottom = i - minAoIdx;

    // AO bottom must be recent (within lookback), not at the edge of the window
    // This ensures we're not catching a signal where AO bottomed 20 weeks ago
    if (weeksSinceBottom > AO_BOTTOM_LOOKBACK) continue;

    const aoRecovery = curr.ao - minAo; // how much AO has recovered from its bottom

    signals.push({
      date: curr.date,
      ticker,
      ao: curr.ao,
      ac: curr.ac,
      acPrev: prev.ac,
      aoBottomDepth: weeksSinceBottom,
      aoRecovery,
      signalIndex: i,
    });
  }

  return signals;
}
