import { describe, it, expect } from "vitest";
import { calculateIndicators } from "./indicators.js";
import type { WeeklyCandle } from "./data.js";

/**
 * Deterministic fixture: 40 bars with known midpoints.
 * Midpoints: 10, 11, 12, ..., 49 (linearly increasing).
 *
 * Expected, for linear input x_i = 10 + i:
 *   SMA(5)  at i = mean(x_{i-4}..x_i)   = x_{i-2}    = (10+i) - 2    = i + 8
 *   SMA(34) at i = mean(x_{i-33}..x_i)  = x_{i-16.5} = (10+i) - 16.5 = i - 6.5
 *   AO      at i = SMA(5) - SMA(34)     = (i + 8) - (i - 6.5)        = 14.5
 *   SMA(5) of AO = 14.5 (constant once warm)
 *   AC      at i = AO - SMA(5)_of_AO                                 = 0
 *
 * This gives us an exact, hand-computable fixture that catches any
 * off-by-one in the SMA windows or warm-up masks.
 */
function linearFixture(n = 40): WeeklyCandle[] {
  const out: WeeklyCandle[] = [];
  for (let i = 0; i < n; i++) {
    const midpoint = 10 + i; // drives all the math
    const high = midpoint + 0.5;
    const low = midpoint - 0.5;
    out.push({
      date: `2024-01-${String(i + 1).padStart(2, "0")}`,
      open: midpoint,
      high,
      low,
      close: midpoint,
      volume: 1000,
      midpoint,
    });
  }
  return out;
}

describe("calculateIndicators — warm-up mask", () => {
  it("emits no bars before AO is fully warm (needs 34 midpoints)", () => {
    const candles = linearFixture(33);
    expect(calculateIndicators(candles)).toHaveLength(0);
  });

  it("emits no bars before AC is fully warm (needs 34 + 4 = 38 midpoints)", () => {
    const candles = linearFixture(37);
    const bars = calculateIndicators(candles);
    // AO can be computed for i >= 33 (so i=33..36 = 4 bars) but AC needs
    // SMA(5) of AO, i.e. valid AO for 5 bars — which we don't have yet.
    expect(bars).toHaveLength(0);
  });

  it("starts emitting at bar 37 (first bar where both AO and AC are defined)", () => {
    const candles = linearFixture(38);
    const bars = calculateIndicators(candles);
    expect(bars).toHaveLength(1);
    expect(bars[0].date).toBe("2024-01-38");
  });
});

describe("calculateIndicators — formula correctness on a linear fixture", () => {
  it("AO equals SMA(5) - SMA(34) of midpoints = 14.5 for linearly rising input", () => {
    const candles = linearFixture(40);
    const bars = calculateIndicators(candles);
    // All emitted bars are past warm-up; AO is constant 14.5.
    for (const bar of bars) {
      expect(bar.ao).toBeCloseTo(14.5, 6);
    }
  });

  it("AC equals AO - SMA(5) of AO = 0 once past the AC warm-up", () => {
    const candles = linearFixture(40);
    const bars = calculateIndicators(candles);
    for (const bar of bars) {
      expect(bar.ac).toBeCloseTo(0, 6);
    }
  });

  it("uses midpoint = (high + low) / 2, not close — Williams convention", () => {
    // Build a fixture where close disagrees with midpoint. If the
    // implementation ever regresses to `close`-based SMAs, this test
    // catches it.
    const candles: WeeklyCandle[] = [];
    for (let i = 0; i < 40; i++) {
      const midpoint = 10 + i;
      candles.push({
        date: `2024-02-${String(i + 1).padStart(2, "0")}`,
        open: 0,
        high: midpoint + 0.5,
        low: midpoint - 0.5,
        close: 999, // deliberately wrong — the math must ignore it
        volume: 0,
        midpoint,
      });
    }
    const bars = calculateIndicators(candles);
    for (const bar of bars) {
      expect(bar.ao).toBeCloseTo(14.5, 6);
    }
  });
});

describe("calculateIndicators — color convention", () => {
  it("flags AC as green when AC[t] >= AC[t-1], red otherwise", () => {
    // Oscillating midpoint produces an oscillating AO/AC.
    const candles: WeeklyCandle[] = [];
    for (let i = 0; i < 45; i++) {
      const midpoint = 100 + Math.sin(i / 3) * 10;
      candles.push({
        date: `2024-03-${String(i + 1).padStart(2, "0")}`,
        open: midpoint,
        high: midpoint + 0.5,
        low: midpoint - 0.5,
        close: midpoint,
        volume: 0,
        midpoint,
      });
    }
    const bars = calculateIndicators(candles);
    expect(bars.length).toBeGreaterThan(2);
    for (let i = 1; i < bars.length; i++) {
      const rising = bars[i].ac >= bars[i - 1].ac;
      expect(bars[i].acColor).toBe(rising ? "green" : "red");
    }
  });
});
