import { describe, expect, it } from "vitest";
import { barCoverage, isoWeekMonday, weekLabelMonday } from "./coverage.js";

describe("weekLabelMonday", () => {
  it("resolves ISO week labels to their Monday", () => {
    expect(weekLabelMonday("2026-W37")).toBe("2026-09-07");
    expect(weekLabelMonday("2026-W36")).toBe("2026-08-31");
    expect(weekLabelMonday("2026-W01")).toBe("2025-12-29");
    expect(weekLabelMonday("2025-W01")).toBe("2024-12-30");
  });
  it("rejects malformed labels", () => {
    expect(() => weekLabelMonday("2026-37")).toThrow(/invalid week label/);
  });
});

describe("isoWeekMonday", () => {
  it("maps every weekday of a week to the same Monday", () => {
    for (const d of ["2026-09-07", "2026-09-10", "2026-09-11", "2026-09-13"]) {
      expect(isoWeekMonday(d)).toBe("2026-09-07");
    }
    expect(isoWeekMonday("2026-09-06")).toBe("2026-08-31");
  });
});

describe("barCoverage", () => {
  it("reproduces the 2026-W37 incident: 2 of 4 tickers carry the Friday bar", () => {
    const last = new Map<string, string | null>([
      ["PARA", "2026-09-11"],
      ["ONC", "2026-09-11"],
      ["AAPL", "2026-09-04"],
      ["MLM", "2026-09-04"],
    ]);
    const c = barCoverage(last, "2026-W37");
    expect(c.expectedWeekMonday).toBe("2026-09-07");
    expect(c.covered.sort()).toEqual(["ONC", "PARA"]);
    expect(c.lagging.sort()).toEqual(["AAPL", "MLM"]);
    expect(c.ratio).toBe(0.5);
  });
  it("counts a holiday-shortened week keyed by Thursday as covered", () => {
    const c = barCoverage(new Map([["SPY", "2026-04-02"]]), "2026-W14");
    expect(c.covered).toEqual(["SPY"]);
    expect(c.ratio).toBe(1);
  });
  it("treats missing bars as lagging and an empty universe as ratio 0", () => {
    expect(barCoverage(new Map([["X", null]]), "2026-W37").lagging).toEqual(["X"]);
    expect(barCoverage(new Map(), "2026-W37").ratio).toBe(0);
  });
});

describe("edge cases", () => {
  it("handles a 53-week ISO year", () => {
    expect(weekLabelMonday("2020-W53")).toBe("2020-12-28");
  });
  it("reports the exact ratio at a 90% boundary", () => {
    const last = new Map<string, string | null>();
    for (let i = 0; i < 9; i++) last.set(`C${i}`, "2026-09-11");
    last.set("L", "2026-09-04");
    expect(barCoverage(last, "2026-W37").ratio).toBe(0.9);
  });
});

describe("partial in-progress bars", () => {
  it("counts a bar dated after today (upcoming-Friday label) as lagging", () => {
    const last = new Map([["AAPL", "2026-09-11"]]);
    expect(barCoverage(last, "2026-W37", "2026-09-09").lagging).toEqual(["AAPL"]);
    expect(barCoverage(last, "2026-W37", "2026-09-11").covered).toEqual(["AAPL"]);
  });
});
