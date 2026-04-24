import { describe, it, expect } from "vitest";
import { detectSignalsS2 } from "./signals-s2.js";
import type { IndicatorBar } from "./indicators.js";

function b(
  date: string,
  ao: number,
  ac: number,
  acColor: "green" | "red" = "green",
): IndicatorBar {
  return {
    date,
    close: 100,
    midpoint: 100,
    ao,
    ac,
    aoColor: "red",
    acColor,
  };
}

describe("detectSignalsS2 — core rule", () => {
  it("fires when AC crosses from negative to non-negative with AO negative and recovering from a recent bottom", () => {
    // Build a 20-bar history so the 16-week bottom lookback has room.
    const bars: IndicatorBar[] = [
      b("w01", -2.0, -0.5), // pre-bottom context
      b("w02", -2.5, -0.6),
      b("w03", -3.0, -0.8),
      b("w04", -3.5, -1.0),
      b("w05", -4.0, -1.2), // AO bottom at w05 = -4.0
      b("w06", -3.8, -1.1),
      b("w07", -3.5, -1.0),
      b("w08", -3.2, -0.8),
      b("w09", -2.9, -0.6),
      b("w10", -2.7, -0.4),
      b("w11", -2.5, -0.3),
      b("w12", -2.3, -0.2),
      b("w13", -2.1, -0.1), // AC still negative
      b("w14", -2.0, 0.05), // SIGNAL: AC crosses zero, AO still negative and above bottom
    ];
    const sigs = detectSignalsS2("TEST", bars);
    expect(sigs).toHaveLength(1);
    expect(sigs[0].date).toBe("w14");
    // AO recovery from bottom: -2.0 - (-4.0) = 2.0
    expect(sigs[0].aoRecovery).toBeCloseTo(2.0, 6);
  });

  it("fires exactly once per AC crossing (never on subsequent bars that stay non-negative)", () => {
    const bars: IndicatorBar[] = [
      b("w01", -2.0, -0.5),
      b("w02", -2.5, -0.6),
      b("w03", -3.0, -0.8),
      b("w04", -3.5, -1.0),
      b("w05", -4.0, -1.2),
      b("w06", -3.8, -1.1),
      b("w07", -3.5, -1.0),
      b("w08", -3.2, -0.5),
      b("w09", -2.9, 0.1), // AC crosses here — this is the single S2
      b("w10", -2.7, 0.2), // still non-negative — must NOT re-fire
      b("w11", -2.5, 0.3), // still non-negative — must NOT re-fire
    ];
    const sigs = detectSignalsS2("TEST", bars);
    expect(sigs).toHaveLength(1);
    expect(sigs[0].date).toBe("w09");
  });

  it("does NOT fire when AO has crossed to positive", () => {
    const bars: IndicatorBar[] = [
      b("w01", -2.0, -0.5),
      b("w02", -2.5, -0.6),
      b("w03", -3.0, -0.8),
      b("w04", -3.5, -1.0),
      b("w05", -4.0, -1.2),
      b("w06", -3.8, -1.1),
      b("w07", -3.5, -1.0),
      b("w08", -3.2, -0.5),
      b("w09", -2.9, -0.1),
      b("w10", 0.1, 0.05), // AO crossed to positive — filter out
    ];
    expect(detectSignalsS2("TEST", bars)).toHaveLength(0);
  });

  it("does NOT fire when AO is NOT recovering (flat or still declining) at the AC cross", () => {
    // AO stays near its bottom with no recovery; AC crosses.
    const bars: IndicatorBar[] = [
      b("w01", -3.9, -0.5),
      b("w02", -3.95, -0.6),
      b("w03", -4.0, -0.8),
      b("w04", -4.0, -1.0),
      b("w05", -4.0, -1.2),
      b("w06", -4.0, -1.1),
      b("w07", -4.0, -1.0),
      b("w08", -4.0, -0.5),
      b("w09", -4.0, -0.1),
      b("w10", -4.0, 0.05), // AC crosses but AO flat, not recovering
    ];
    expect(detectSignalsS2("TEST", bars)).toHaveLength(0);
  });

  it("does NOT fire when the AO bottom sits at the oldest bar of the window (edge guard)", () => {
    // The very first bar is the AO minimum — we can't distinguish
    // "recently bottomed" from "ran out of history".
    const bars: IndicatorBar[] = [
      b("w01", -4.0, -0.5), // bottom AT the window edge
      b("w02", -3.5, -0.6),
      b("w03", -3.0, -0.8),
      b("w04", -2.5, -1.0),
      b("w05", -2.0, -1.2),
      b("w06", -1.8, -1.1),
      b("w07", -1.5, -1.0),
      b("w08", -1.2, -0.5),
      b("w09", -1.0, -0.1),
      b("w10", -0.9, 0.05), // would cross, but bottom-at-edge guard kicks in
    ];
    // Window for w10 with lookback 16 starts at max(0, 10-16) = 0.
    // minAoIdx = 0 = bottomStart → rejected.
    expect(detectSignalsS2("TEST", bars)).toHaveLength(0);
  });
});
