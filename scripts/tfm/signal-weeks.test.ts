import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { buildSignalWeeks, stratifiedCap, populationTable, MIN_BARS_FOR_SCAN, type SignalWeek } from "./signal-weeks.js";
import { scanTicker } from "../../src/scanner.js";
import type { WeeklyBar } from "../../src/fetcher.js";

const DB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "radar.db");
const haveDb = fs.existsSync(DB);

function realBars(ticker: string): WeeklyBar[] {
  const db = new Database(DB, { readonly: true });
  const rows = db.prepare("SELECT date, open, high, low, close, volume FROM weekly_bars WHERE ticker=? ORDER BY date ASC").all(ticker) as WeeklyBar[];
  db.close();
  return rows;
}

function realBarsOrSynthetic(): WeeklyBar[] {
  if (haveDb) return realBars("BSX");
  return Array.from({ length: 200 }, (_, i) => ({ date: `2020-01-${String((i % 28) + 1).padStart(2, "0")}`, open: 1, high: 1, low: 1, close: 1, volume: 1 }));
}

function synthRows(n: number, years: string[]): SignalWeek[] {
  return Array.from({ length: n }, (_, i) => ({
    ticker: `T${i}`,
    as_of: `${years[i % years.length]}-0${1 + (i % 9)}-0${1 + (i % 7)}`,
    level: "S1" as const,
    quality: "n/a",
    close: 1,
    close_h4: 1,
    ranging: false,
    nearLows: false,
  }));
}

describe("buildSignalWeeks (frozen scanner, as-of windows)", () => {
  it.skipIf(!haveDb)("rows are as-of: appending future bars never changes earlier rows", () => {
    const bars = realBars("BSX");
    expect(bars.length).toBeGreaterThan(MIN_BARS_FOR_SCAN + 60);
    const since = bars[bars.length - 160].date;
    const rows = buildSignalWeeks("BSX", bars, since);
    expect(rows.length).toBeGreaterThan(0); // the per-row assertions below must actually run
    // append 20 synthetic bars (a crash) — must not touch rows whose h4 close was already known
    const last = bars[bars.length - 1];
    const extra: WeeklyBar[] = Array.from({ length: 20 }, (_, k) => ({ ...last, date: `2099-01-${String(k + 1).padStart(2, "0")}`, close: last.close * 0.5 }));
    const rows2 = buildSignalWeeks("BSX", [...bars, ...extra], since);
    const cutoff = bars[bars.length - 1 - 4].date;
    expect(rows2.filter((r) => r.as_of <= cutoff)).toEqual(rows.filter((r) => r.as_of <= cutoff));
    for (const r of rows) {
      const i = bars.findIndex((b) => b.date === r.as_of);
      expect(i).toBeGreaterThanOrEqual(103); // literal: priceContext needs 104 bars
      expect(r.as_of >= since).toBe(true);
      expect(r.close).toBe(bars[i].close);
      expect(bars[i + 4]).toBeDefined();
      expect(Number.isFinite(r.close_h4)).toBe(true);
      expect(r.close_h4).toBe(bars[i + 4].close);
      expect(["S1", "S2D", "S2"]).toContain(r.level);
      // oracle: the row is exactly what an as-of scan at that date says (catches slice off-by-one)
      expect(scanTicker("BSX", bars.slice(0, i + 1)).signalLevel).toBe(r.level);
    }
    // the last emitted row leaves room for its realised close: as_of <= bars[len-1-4]
    expect(rows[rows.length - 1].as_of <= cutoff).toBe(true);
    expect(MIN_BARS_FOR_SCAN).toBe(104);
  });

  it("emits nothing when every bar predates `since` (no pre-since rows)", () => {
    const bars = realBarsOrSynthetic();
    expect(buildSignalWeeks("BSX", bars, "2999-01-01")).toEqual([]);
  });

  it("returns nothing when there are not enough bars", () => {
    const bars: WeeklyBar[] = Array.from({ length: 50 }, (_, i) => ({ date: `2020-01-${String(i + 1).padStart(2, "0")}`, open: 1, high: 1, low: 1, close: 1, volume: 1 }));
    expect(buildSignalWeeks("X", bars, "2019-01-01")).toEqual([]);
  });
});

describe("stratifiedCap", () => {
  it("is a no-op under the cap and deterministic above it", () => {
    const rows = synthRows(300, ["2019", "2020", "2025"]);
    expect(stratifiedCap(rows, 300)).toBe(rows);
    const a = stratifiedCap(rows, 90);
    const b = stratifiedCap(rows, 90);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(88);
    expect(a.length).toBeLessThanOrEqual(93);
    // proportional per year (100 each → ~30 each)
    for (const y of ["2019", "2020", "2025"]) {
      const n = a.filter((r) => r.as_of.startsWith(y)).length;
      expect(n).toBeGreaterThanOrEqual(28);
      expect(n).toBeLessThanOrEqual(32);
    }
    // sampled rows are real rows, order preserved within a year, and it is a SAMPLE (not the head)
    const ids = new Set(rows.map((r) => r.ticker));
    expect(a.every((r) => ids.has(r.ticker))).toBe(true);
    const idx2019 = a.filter((r) => r.as_of.startsWith("2019")).map((r) => rows.indexOf(r));
    expect(idx2019).toEqual([...idx2019].sort((x, y) => x - y));
    expect(Math.max(...idx2019)).toBeGreaterThan(idx2019.length * 3); // head-take would stay < ~len*3
  });
});

describe("populationTable", () => {
  it("reports per-year totals and the post-2025 count", () => {
    const t = populationTable(synthRows(30, ["2024", "2025", "2026"]));
    expect(t).toContain("2024");
    expect(t).toContain("post-2025-01-01: 20");
  });
});
