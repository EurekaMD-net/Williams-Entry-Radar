import { describe, it, expect } from "vitest";
import { polygonBarsToSeries, type WeeklyBar } from "./fetcher.js";

function bar(date: string, close = 100): WeeklyBar {
  return {
    date,
    open: close - 1,
    high: close + 2,
    low: close - 3,
    close,
    volume: 1000,
  };
}

describe("polygonBarsToSeries", () => {
  it("maps bars to AVRawSeries fields verbatim", () => {
    const series = polygonBarsToSeries([bar("2026-07-10", 754.95)], []);
    expect(series["2026-07-10"]).toEqual({
      "1. open": "753.95",
      "2. high": "756.95",
      "3. low": "751.95",
      "5. adjusted close": "754.95",
      "6. volume": "1000",
    });
  });

  it("snaps a Friday-keyed bar to an existing Thursday row in the same holiday week", () => {
    // Good Friday week 2025: AV keyed it 2025-04-17 (Thu); polygon labels 2025-04-18 (Fri).
    const series = polygonBarsToSeries(
      [bar("2025-04-18", 93.17)],
      ["2025-04-11", "2025-04-17", "2025-04-25"],
    );
    expect(Object.keys(series)).toEqual(["2025-04-17"]);
    expect(series["2025-04-17"]["5. adjusted close"]).toBe("93.17");
  });

  it("does NOT snap across week boundaries", () => {
    // Existing Friday 2025-04-11 is the PRIOR week — must not capture 2025-04-18.
    const series = polygonBarsToSeries([bar("2025-04-18")], ["2025-04-11"]);
    expect(Object.keys(series)).toEqual(["2025-04-18"]);
  });

  it("keeps polygon dates for weeks with no existing row", () => {
    const series = polygonBarsToSeries(
      [bar("2026-07-10"), bar("2026-07-17")],
      ["2026-07-10"],
    );
    expect(Object.keys(series).sort()).toEqual(["2026-07-10", "2026-07-17"]);
  });

  it("known holiday weeks in the live DB all snap correctly", () => {
    // The three Thursday-keyed weeks inside polygon's 2y window (verified
    // against data/radar.db 2026-07-14).
    const existing = ["2025-04-17", "2025-07-03", "2026-04-02"];
    const polygonDates = ["2025-04-18", "2025-07-04", "2026-04-03"];
    const series = polygonBarsToSeries(
      polygonDates.map((d) => bar(d)),
      existing,
    );
    expect(Object.keys(series).sort()).toEqual(existing.sort());
  });
});
