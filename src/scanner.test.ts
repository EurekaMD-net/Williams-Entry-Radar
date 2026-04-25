import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IndicatorBar } from "./indicators.js";
import type { WeeklyBar } from "./fetcher.js";

// Mock calculateIndicators so signal-rule tests can drive AO/AC directly
// without engineering 38+ midpoint bars to produce a target SMA(5)-SMA(34).
// priceContext reads raw `bars` and is unaffected by this mock — its tests
// observe the nearLows/ranging/pricePercentile fields on the ScanResult.
vi.mock("./indicators.js", async () => {
  const actual =
    await vi.importActual<typeof import("./indicators.js")>("./indicators.js");
  return { ...actual, calculateIndicators: vi.fn() };
});

import { scanTicker } from "./scanner.js";
import { calculateIndicators } from "./indicators.js";

const mockedCalc = vi.mocked(calculateIndicators);

function indicatorBar(
  ao: number,
  ac: number,
  date = "2026-04-24",
): IndicatorBar {
  return {
    date,
    close: 100,
    midpoint: 100,
    ao,
    ac,
    aoColor: "red",
    acColor: "red",
  };
}

/** Build N weekly bars with caller-supplied closes — uniform OHLC=close. */
function makeBars(count: number, closesFn: (i: number) => number): WeeklyBar[] {
  const bars: WeeklyBar[] = [];
  const start = new Date("2024-01-05").getTime(); // ISO Friday
  for (let i = 0; i < count; i++) {
    const close = closesFn(i);
    const date = new Date(start + i * 7 * 86400000).toISOString().slice(0, 10);
    bars.push({
      date,
      open: close,
      high: close,
      low: close,
      close,
      volume: 1_000_000,
    });
  }
  return bars;
}

beforeEach(() => {
  mockedCalc.mockReset();
});

// ─── priceContext ────────────────────────────────────────────────────────────

describe("scanner — priceContext", () => {
  it("computes pricePercentile from 104-week close range", () => {
    // Closes ramp 1..104 — current close (104) sits at the top → pricePercentile = 100
    mockedCalc.mockReturnValue([indicatorBar(0, 0)]); // 1 indicator bar → "indicators < 2" branch
    const bars = makeBars(104, (i) => i + 1);
    const r = scanTicker("RAMP", bars);
    expect(r.pricePercentile).toBe(100);
    expect(r.nearLows).toBe(false);
  });

  it("flags nearLows when current close sits in bottom 30% of the 104-week range", () => {
    mockedCalc.mockReturnValue([indicatorBar(0, 0)]);
    // 104 bars: 0..102 ramp up to 100, last bar drops back to 10
    // Range = 100 - 1 = 99; current = 10; (10-1)/99 ≈ 9% → nearLows true
    const bars = makeBars(104, (i) => (i === 103 ? 10 : i + 1));
    const r = scanTicker("DIP", bars);
    expect(r.pricePercentile).toBeLessThanOrEqual(30);
    expect(r.nearLows).toBe(true);
  });

  it("flags ranging when 12-week range / avg < 15%", () => {
    mockedCalc.mockReturnValue([indicatorBar(0, 0)]);
    // Last 12 closes oscillate in a tiny band: 100..101 → range 1, avg ~100 → 1% < 15%
    const bars = makeBars(50, (i) => (i % 2 === 0 ? 100 : 101));
    const r = scanTicker("FLAT", bars);
    expect(r.ranging).toBe(true);
  });

  it("does NOT flag ranging when 12-week range / avg >= 15%", () => {
    mockedCalc.mockReturnValue([indicatorBar(0, 0)]);
    // Last 12 closes swing 100..130 → range 30, avg ~115 → ~26% > 15%
    const bars = makeBars(50, (i) => (i % 2 === 0 ? 100 : 130));
    const r = scanTicker("VOL", bars);
    expect(r.ranging).toBe(false);
  });

  it("uses safe defaults when bars.length < RANGE_CHECK_WEEKS (12)", () => {
    mockedCalc.mockReturnValue([]);
    const bars = makeBars(5, (i) => 100 + i);
    const r = scanTicker("SHORT", bars);
    expect(r.nearLows).toBe(false);
    expect(r.ranging).toBe(false);
    expect(r.pricePercentile).toBe(50);
  });
});

// ─── Insufficient-data guards ────────────────────────────────────────────────

describe("scanner — guards", () => {
  it("returns signalLevel='none' + signalQuality='n/a' when bars.length < 40", () => {
    const bars = makeBars(30, () => 100);
    const r = scanTicker("THIN", bars);
    expect(r.signalLevel).toBe("none");
    expect(r.signalQuality).toBe("n/a");
    expect(r.signalDate).toBeNull();
    // calculateIndicators should NOT have been called — short-circuit before
    expect(mockedCalc).not.toHaveBeenCalled();
  });

  it("returns signalLevel='none' when calculateIndicators returns < 2 bars", () => {
    mockedCalc.mockReturnValue([indicatorBar(-1, -0.5)]);
    const bars = makeBars(50, () => 100);
    const r = scanTicker("WARM", bars);
    expect(r.signalLevel).toBe("none");
    expect(r.signalQuality).toBe("n/a");
  });
});

// ─── Signal rules ────────────────────────────────────────────────────────────

describe("scanner — S2 PURE rule", () => {
  it("fires when AC crossed zero this week AND AO is still falling (red)", () => {
    // prev.ac < 0, curr.ac >= 0, ao < 0, ao < prev.ao (still falling)
    mockedCalc.mockReturnValue([
      indicatorBar(-1.0, -0.2, "2026-04-17"),
      indicatorBar(-1.5, 0.1, "2026-04-24"), // ao -1.5 < prev -1.0 → still falling
    ]);
    // Make non-ranging: closes swing 100..130 over last 12 weeks
    const bars = makeBars(50, (i) => (i % 2 === 0 ? 100 : 130));
    const r = scanTicker("PURE", bars);
    expect(r.signalLevel).toBe("S2");
    expect(r.signalQuality).toBe("pure");
    expect(r.signalDate).toBe("2026-04-24");
    expect(r.weeksActive).toBe(0);
  });

  it("does NOT fire S2 PURE when ranging (lateral price action excluded)", () => {
    mockedCalc.mockReturnValue([
      indicatorBar(-1.0, -0.2, "2026-04-17"),
      indicatorBar(-1.5, 0.1, "2026-04-24"),
    ]);
    // Tight 100..101 oscillation → ranging
    const bars = makeBars(50, (i) => (i % 2 === 0 ? 100 : 101));
    const r = scanTicker("PURE_BUT_FLAT", bars);
    expect(r.signalLevel).toBe("none");
  });
});

describe("scanner — S2 DEGRADED rule", () => {
  it("fires when AC crossed zero AND AO is already recovering (green)", () => {
    // prev.ac < 0, curr.ac >= 0, ao < 0, ao >= prev.ao (recovering)
    mockedCalc.mockReturnValue([
      indicatorBar(-1.5, -0.2, "2026-04-17"),
      indicatorBar(-1.0, 0.1, "2026-04-24"), // ao -1.0 > prev -1.5 → recovering
    ]);
    const bars = makeBars(50, (i) => (i % 2 === 0 ? 100 : 130));
    const r = scanTicker("DEGRADED", bars);
    expect(r.signalLevel).toBe("S2D");
    expect(r.signalQuality).toBe("degraded");
    expect(r.signalDate).toBe("2026-04-24");
  });

  it("does NOT fire S2 DEGRADED when ranging", () => {
    mockedCalc.mockReturnValue([
      indicatorBar(-1.5, -0.2, "2026-04-17"),
      indicatorBar(-1.0, 0.1, "2026-04-24"),
    ]);
    const bars = makeBars(50, (i) => (i % 2 === 0 ? 100 : 101));
    const r = scanTicker("DEG_FLAT", bars);
    expect(r.signalLevel).toBe("none");
  });
});

describe("scanner — S1 rule", () => {
  it("fires when AO<0 AND AC<0 AND AC[t] > AC[t-1] (AC turned green this week)", () => {
    mockedCalc.mockReturnValue([
      indicatorBar(-1.0, -0.5, "2026-04-17"),
      indicatorBar(-1.0, -0.3, "2026-04-24"), // ac -0.3 > prev -0.5 → green
    ]);
    const bars = makeBars(50, (i) => (i % 2 === 0 ? 100 : 130));
    const r = scanTicker("S1FIRE", bars);
    expect(r.signalLevel).toBe("S1");
    expect(r.signalQuality).toBe("n/a");
    expect(r.signalDate).toBe("2026-04-24");
  });

  it("does NOT fire S1 when AO is >= 0 (all signals require AO<0)", () => {
    mockedCalc.mockReturnValue([
      indicatorBar(0.5, -0.5, "2026-04-17"),
      indicatorBar(0.5, -0.3, "2026-04-24"),
    ]);
    const bars = makeBars(50, (i) => (i % 2 === 0 ? 100 : 130));
    const r = scanTicker("AOPOS", bars);
    expect(r.signalLevel).toBe("none");
  });

  it("does NOT fire S1 when AC is >= 0 (rule requires AC<0)", () => {
    mockedCalc.mockReturnValue([
      indicatorBar(-1.0, 0.1, "2026-04-17"),
      indicatorBar(-1.0, 0.3, "2026-04-24"), // ac > prev but both >=0
    ]);
    const bars = makeBars(50, (i) => (i % 2 === 0 ? 100 : 130));
    const r = scanTicker("ACPOS", bars);
    expect(r.signalLevel).toBe("none");
  });

  it("does NOT fire S1 when AC[t] <= AC[t-1] (no green this week)", () => {
    mockedCalc.mockReturnValue([
      indicatorBar(-1.0, -0.3, "2026-04-17"),
      indicatorBar(-1.0, -0.5, "2026-04-24"), // ac dropping → red
    ]);
    const bars = makeBars(50, (i) => (i % 2 === 0 ? 100 : 130));
    const r = scanTicker("S1RED", bars);
    expect(r.signalLevel).toBe("none");
  });

  it("does NOT fire S1 when ranging", () => {
    mockedCalc.mockReturnValue([
      indicatorBar(-1.0, -0.5, "2026-04-17"),
      indicatorBar(-1.0, -0.3, "2026-04-24"),
    ]);
    const bars = makeBars(50, (i) => (i % 2 === 0 ? 100 : 101));
    const r = scanTicker("S1FLAT", bars);
    expect(r.signalLevel).toBe("none");
  });
});

describe("scanner — AO>0 exclusion across all signal levels", () => {
  it("does NOT fire S2 PURE when AO is positive", () => {
    mockedCalc.mockReturnValue([
      indicatorBar(0.5, -0.2, "2026-04-17"),
      indicatorBar(0.3, 0.1, "2026-04-24"), // ac crossed, ao falling, but ao>=0
    ]);
    const bars = makeBars(50, (i) => (i % 2 === 0 ? 100 : 130));
    const r = scanTicker("AOPOS_PURE", bars);
    expect(r.signalLevel).toBe("none");
  });

  it("does NOT fire S2 DEGRADED when AO is positive", () => {
    mockedCalc.mockReturnValue([
      indicatorBar(0.3, -0.2, "2026-04-17"),
      indicatorBar(0.5, 0.1, "2026-04-24"), // ac crossed, ao rising, but ao>=0
    ]);
    const bars = makeBars(50, (i) => (i % 2 === 0 ? 100 : 130));
    const r = scanTicker("AOPOS_DEG", bars);
    expect(r.signalLevel).toBe("none");
  });
});
