import { describe, it, expect } from "vitest";
import { detectSignals } from "./signals.js";
import type { IndicatorBar } from "./indicators.js";

function bar(
  date: string,
  ao: number,
  ac: number,
  acColor: "green" | "red",
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

describe("detectSignals — S1 core rule", () => {
  it("fires when AC flips red → green with both AO and AC still negative", () => {
    const bars: IndicatorBar[] = [
      bar("w1", -1.0, -0.5, "red"),
      bar("w2", -1.0, -0.6, "red"),
      bar("w3", -1.0, -0.7, "red"),
      bar("w4", -1.0, -0.8, "red"),
      bar("w5", -1.0, -0.9, "red"),
      bar("w6", -1.0, -1.0, "red"),
      bar("w7", -1.0, -1.1, "red"), // bottom
      bar("w8", -1.0, -1.0, "green"), // SIGNAL
    ];
    const sigs = detectSignals("TEST", bars);
    expect(sigs).toHaveLength(1);
    expect(sigs[0].date).toBe("w8");
    expect(sigs[0].signalIndex).toBe(7);
  });

  it("does NOT fire when AO is >= 0", () => {
    const bars: IndicatorBar[] = [
      bar("w1", 0.5, -0.5, "red"),
      bar("w2", 0.5, -0.4, "green"), // AC flipped but AO is positive
    ];
    expect(detectSignals("TEST", bars)).toHaveLength(0);
  });

  it("does NOT fire when AC is >= 0", () => {
    const bars: IndicatorBar[] = [
      bar("w1", -1.0, -0.1, "red"),
      bar("w2", -1.0, 0.05, "green"), // AC crossed zero, not a negative-territory flip
    ];
    expect(detectSignals("TEST", bars)).toHaveLength(0);
  });

  it("does NOT fire when the previous AC color was green (continuation, not first green)", () => {
    const bars: IndicatorBar[] = [
      bar("w1", -1.0, -0.8, "red"),
      bar("w2", -1.0, -0.7, "green"), // first green
      bar("w3", -1.0, -0.6, "green"), // continuation — must NOT emit a second signal
    ];
    const sigs = detectSignals("TEST", bars);
    expect(sigs).toHaveLength(1);
    expect(sigs[0].date).toBe("w2");
  });

  it("acBottomDepth is 0 when AC is at its 8-week low", () => {
    const bars: IndicatorBar[] = [
      bar("w1", -1.0, -0.5, "red"),
      bar("w2", -1.0, -0.6, "red"),
      bar("w3", -1.0, -0.7, "red"),
      bar("w4", -1.0, -0.8, "red"),
      bar("w5", -1.0, -0.9, "red"),
      bar("w6", -1.0, -1.0, "red"),
      bar("w7", -1.0, -1.1, "red"), // bottom, -1.1
      bar("w8", -1.0, -1.1, "green"), // SIGNAL at the bottom
    ];
    const sigs = detectSignals("TEST", bars);
    expect(sigs).toHaveLength(1);
    expect(sigs[0].acBottomDepth).toBeCloseTo(0, 6);
  });

  it("acBottomDepth > 0 when the signal fires above the recent bottom", () => {
    const bars: IndicatorBar[] = [
      bar("w1", -1.0, -0.5, "red"),
      bar("w2", -1.0, -0.6, "red"),
      bar("w3", -1.0, -0.7, "red"),
      bar("w4", -1.0, -2.0, "red"), // deep bottom
      bar("w5", -1.0, -1.5, "red"),
      bar("w6", -1.0, -1.2, "red"),
      bar("w7", -1.0, -1.0, "red"),
      bar("w8", -1.0, -0.9, "green"), // SIGNAL well above bottom of -2.0
    ];
    const sigs = detectSignals("TEST", bars);
    expect(sigs).toHaveLength(1);
    expect(sigs[0].acBottomDepth).toBeCloseTo(1.1, 6); // -0.9 - (-2.0) = 1.1
  });
});
