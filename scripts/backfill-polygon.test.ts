import { describe, it, expect } from "vitest";
import { planRows, inFridayScanWindow, DEFAULT_BEFORE } from "./backfill-polygon.js";
import type { WeeklyBar } from "../src/fetcher.js";

const bar = (date: string, close: number): WeeklyBar => ({ date, open: close, high: close + 1, low: close - 1, close, volume: 10 });

describe("planRows (backfill planner)", () => {
  it("keeps only bars before the seam, snaps to existing same-week dates, converts to rows", () => {
    const bars = [bar("2024-03-29", 10), bar("2024-07-12", 11), bar("2024-07-19", 12), bar("2024-07-26", 13)];
    // AV keyed the Good Friday week (2024-03-29 closed) by its last trading day, Thursday 2024-03-28
    const existing = new Map([["2024-03-28", "2026-05-09T00:00:00Z"], ["2024-07-12", "2026-07-11T00:00:00Z"], ["2024-07-19", "2026-08-15T00:00:00Z"]]);
    const rows = planRows("T", bars, existing, DEFAULT_BEFORE, "1970-01-01T00:00:00.000Z");
    expect(rows.map((r) => r.date)).toEqual(["2024-03-28", "2024-07-12"]);
    expect(rows[0]).toMatchObject({ ticker: "T", close: 10, open: 10, high: 11, low: 9, volume: 10 });
    expect(rows.every((r) => r.date < DEFAULT_BEFORE)).toBe(true);
    // replaced rows keep their ORIGINAL fetched_at — MAX(fetched_at) (isCacheValid) must not move
    expect(rows.map((r) => r.fetched_at)).toEqual(["2026-05-09T00:00:00Z", "2026-07-11T00:00:00Z"]);
  });

  it("new dates get the ticker's OLDEST fetched_at (never newer than the current MAX)", () => {
    const existing = new Map([["2024-07-19", "2026-08-15T00:00:00Z"], ["2024-07-12", "2026-07-11T00:00:00Z"]]);
    const rows = planRows("T", [bar("2019-01-04", 3)], existing, DEFAULT_BEFORE, "1970-01-01T00:00:00.000Z");
    expect(rows).toHaveLength(1);
    expect(rows[0].fetched_at).toBe("2026-07-11T00:00:00Z");
    // ticker with no rows at all → the epoch fallback, still never a fresh stamp
    expect(planRows("T", [bar("2019-01-04", 3)], new Map(), DEFAULT_BEFORE, "1970-01-01T00:00:00.000Z")[0].fetched_at).toBe("1970-01-01T00:00:00.000Z");
  });

  it("returns nothing when Polygon history starts at/after the seam (free tier)", () => {
    expect(planRows("T", [bar("2024-08-16", 1), bar("2024-08-23", 1)], new Map(), DEFAULT_BEFORE, "x")).toEqual([]);
  });

  it("rejects non-positive OHLC and negative volume (mirrors the positivity CHECK constraints)", () => {
    const bad = { ...bar("2020-01-03", 5), low: 0 };
    expect(() => planRows("T", [bad], new Map(), DEFAULT_BEFORE, "x")).toThrow(/non-positive/);
    const negVol = { ...bar("2020-01-03", 5), volume: -1 };
    expect(() => planRows("T", [negVol], new Map(), DEFAULT_BEFORE, "x")).toThrow(/non-positive/);
  });

  it("throws if the week-snap would land a bar at/after `before` (last line of defence for a non-Friday `before`)", () => {
    // before = Saturday 2024-07-13; the Friday 2024-07-12 bar passes the filter, but the DB keyed that
    // week by 2024-07-13 (same weekKey) → snap forward → must throw rather than write past `before`
    expect(() => planRows("T", [bar("2024-07-12", 5)], new Map([["2024-07-13", "t"]]), "2024-07-13", "x")).toThrow(/not before/);
  });
});

describe("inFridayScanWindow", () => {
  it("flags Friday 15:00–19:59 MX and nothing else", () => {
    // 2026-08-14 is a Friday; MX = UTC-6 in August (no DST since 2022)
    expect(inFridayScanWindow(new Date("2026-08-14T21:00:00Z"))).toBe(true);  // 15:00 MX
    expect(inFridayScanWindow(new Date("2026-08-15T01:59:00Z"))).toBe(true);  // 19:59 MX Fri
    expect(inFridayScanWindow(new Date("2026-08-15T02:00:00Z"))).toBe(false); // 20:00 MX Fri
    expect(inFridayScanWindow(new Date("2026-08-14T20:59:00Z"))).toBe(false); // 14:59 MX Fri
    expect(inFridayScanWindow(new Date("2026-08-13T23:00:00Z"))).toBe(false); // Thu 17:00 MX
  });
});
