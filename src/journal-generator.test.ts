import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import type { ScanResult } from "./scanner.js";
import { getUniverseTickers } from "./universe.js";

/**
 * End-to-end over buildJournalData + renderJournalPage against a throwaway
 * radar.db and a throwaway journal repo holding the prior-week (W38) page.
 * DB_PATH / JOURNAL_REPO_PATH are read at module load, so the env is set
 * before the dynamic import.
 */

const dir = mkdtempSync(path.join(tmpdir(), "wer-journal-test-"));
let gen: typeof import("./journal-generator.js");

const PREV = "2026-09-18";
const CURR = "2026-09-25";

function row(
  ticker: string,
  over: Partial<ScanResult> = {},
): ScanResult {
  return {
    ticker,
    sector: "XLU",
    tier: 2,
    signalLevel: "none",
    signalQuality: "n/a",
    signalDate: null,
    weeksActive: 0,
    ao: -1,
    ac: -0.5,
    acColor: "green",
    nearLows: false,
    ranging: false,
    pricePercentile: 50,
    ...over,
  };
}

beforeAll(async () => {
  const dbPath = path.join(dir, "radar.db");
  const db = new Database(dbPath);
  db.exec(
    "CREATE TABLE weekly_bars (ticker TEXT NOT NULL, date TEXT NOT NULL, close REAL NOT NULL, PRIMARY KEY (ticker, date))",
  );
  const ins = db.prepare("INSERT INTO weekly_bars VALUES (?, ?, ?)");
  const bars: [string, number, number][] = [
    ["TTD", 13.92, 12.6], // prior S2D, AC stays positive, Δ -9.5%
    ["NFLX", 100, 102], // prior S2D, AC stays positive, Δ +2.0%
    ["UPS", 100, 103], // prior S1, AC flips positive
    ["DUK", 100, 101], // prior S1, price out of range
    ["WEC", 100, 98], // prior S1, conditions no longer met
    ["ED", 100, 99.5], // prior S1, absent from this week's scan
    ["SPY", 500, 505],
  ];
  for (const [t, p, c] of bars) {
    ins.run(t, PREV, p);
    ins.run(t, CURR, c);
  }
  db.close();

  mkdirSync(path.join(dir, "pages"));
  writeFileSync(
    path.join(dir, "pages", "w38-2026.md"),
    [
      "## W38 Candidates — Category A",
      "",
      "> 🔴 MODEL OUTPUT",
      "",
      "| Ticker | Signal | Percentile | Sector | Note |",
      "|--------|--------|------------|--------|------|",
      "| TTD | S2D | p1% | XLC | near lows |",
      "| NFLX | S2D | p5% | XLC | near lows |",
      "| UPS | S1 | p20% | XLI | |",
      "| DUK | S1 | p25% | XLU | |",
      "| WEC | S1 | p25% | XLU | |",
      "| ED | S1 | p25% | XLU | |",
      "",
    ].join("\n"),
  );

  // Single-row Category A pages for the year-end rollover tests.
  for (const wk of [52, 53]) {
    writeFileSync(
      path.join(dir, "pages", `w${wk}-2026.md`),
      [
        `## W${wk} Candidates — Category A`,
        "",
        "| Ticker | Signal | Percentile | Sector | Note |",
        "|--------|--------|------------|--------|------|",
        "| TTD | S2D | p1% | XLC | near lows |",
        "",
      ].join("\n"),
    );
  }

  process.env.RADAR_DB_PATH = dbPath;
  process.env.JOURNAL_REPO_PATH = dir;
  gen = await import("./journal-generator.js");
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function page(results: ScanResult[]): string {
  return gen.renderJournalPage(
    gen.buildJournalData("2026-W39", results, results.length),
  );
}

const W39 = [
  row("TTD", { sector: "XLC", ac: 0.9719, pricePercentile: 0 }),
  row("NFLX", { sector: "XLC", ac: 0.3, pricePercentile: 40 }),
  row("UPS", { sector: "XLI", ac: 0.2, pricePercentile: 20 }),
  row("DUK", { pricePercentile: 80 }),
  row("WEC", { pricePercentile: 50 }),
  row("SO", { pricePercentile: 9 }),
  row("PG", { sector: "XLP", pricePercentile: 12 }),
  row("PCG", { pricePercentile: 0 }),
  row("OTIS", { sector: "XLI", pricePercentile: 0 }),
];

describe("journal-generator — prior S2/S2D whose confirmation week passed (F1)", () => {
  it("scorecard note says the confirmation week passed, not that AC flipped", () => {
    const md = page(W39);
    expect(md).toContain(
      "| TTD | S2D | $13.92 | $12.60 | -9.5% | ✗ | S2D confirmation week passed. AC stays positive (+0.97). |",
    );
    expect(md).not.toMatch(/TTD[^\n]*AC flipped positive/);
    // A prior S1 whose AC went positive keeps the flip wording.
    expect(md).toContain("| UPS | S1 | $100.00 | $103.00 | +3.0% | ✗ | Signal lost. AC flipped positive. |");
  });

  it("exit analysis gives the correct reason and a price-based verdict", () => {
    const md = page(W39);
    expect(md).toContain(
      "| **TTD** | -9.5% | AC stayed positive after the zero-cross | 🔴 Breakdown — deterioration, not resolution |",
    );
    expect(md).toContain(
      "| **NFLX** | +2.0% | AC stayed positive after the zero-cross | ⚠️ Range — move without conviction |",
    );
    expect(md).toContain("| **UPS** | +3.0% | AC crossed positive |");
    expect(md).toContain(
      "Notable: **TTD** (-9.5%) left the list because its S2D confirmation week passed, and price kept falling after the zero-cross.",
    );
  });
});

describe("journal-generator — exit analysis follow-ups (R1, R2)", () => {
  it("Notable line points at the next week", () => {
    const md = page(W39);
    expect(md).toMatch(
      /Notable: \*\*TTD\*\*[^\n]*Worth monitoring in W40 as a continuation of negative momentum\./,
    );
  });

  it("each exit reason matches its scorecard note", () => {
    const md = page(W39);
    expect(md).toContain("| DUK | S1 | $100.00 | $101.00 | +1.0% | ✗ | Signal lost. Price out of range (p80%). |");
    expect(md).toContain("| **DUK** | +1.0% | Price left the entry range | ⚠️ Range — move without conviction |");
    expect(md).toContain("| WEC | S1 | $100.00 | $98.00 | -2.0% | ✗ | Signal lost. Conditions no longer met. |");
    expect(md).toContain("| **WEC** | -2.0% | Conditions no longer met | ❌ False technical signal — AC tick, price fell |");
    expect(md).toContain("| ED | S1 | $100.00 | $99.50 | -0.5% | ✗ | Signal lost. Ticker not in scan universe this week. |");
    expect(md).toContain("| **ED** | -0.5% | Not in this week's scan |");
    expect(md).toContain("| **UPS** | +3.0% | AC crossed positive |");
  });
});

describe("journal-generator — Category A intro (F2)", () => {
  it("describes the percentile window as 104 weeks, not 52", () => {
    const md = page(W39);
    expect(md).toContain("relative to the 104-week (2-year) range");
    expect(md).not.toContain("52-week");
  });
});

describe("journal-generator — universe label (F3)", () => {
  const universe = getUniverseTickers();

  it("prints universe size and scanned count, listing the unscanned tickers", () => {
    const missing = universe[3];
    const results = universe.filter((t) => t !== missing).map((t) => row(t));
    const md = page(results);
    expect(md).toContain(
      `**${universe.length} tickers in universe · ${universe.length - 1} scanned · 13 sectors**\nNot scanned this week: ${missing}\n`,
    );
  });

  it("omits the unscanned line when every universe ticker was scanned", () => {
    const md = page(universe.map((t) => row(t)));
    expect(md).toContain(
      `**${universe.length} tickers in universe · ${universe.length} scanned · 13 sectors**\nSectors covered:`,
    );
    expect(md).not.toContain("Not scanned this week");
  });
});

describe("journal-generator — Pre-Radar order (F4)", () => {
  it("sorts by percentile ascending, ties by ticker", () => {
    const md = page(W39);
    const section = md.split("## Pre-Radar")[1].split("## The Universe")[0];
    const tickers = [...section.matchAll(/^\| ([A-Z.]+) \| p\d+% \|/gm)].map(
      (m) => m[1],
    );
    expect(tickers).toEqual(["OTIS", "PCG", "TTD", "SO", "PG"]);
  });
});

describe("journal-generator — ISO-week rollover (N3)", () => {
  it("2026-W53 page points at 2027-W01 as the next week", () => {
    const md = gen.renderJournalPage(
      gen.buildJournalData("2026-W53", W39, W39.length),
    );
    expect(md).toContain("Decision week: W1.");
    expect(md).toContain("priority for W1 monitoring");
    expect(md).toContain("heading into W1.");
    expect(md).toContain("Worth monitoring in W1 as");
    expect(md).not.toContain("W54");
  });

  it("2027-W01 scores the 2026-W53 page", () => {
    const data = gen.buildJournalData("2027-W01", W39, W39.length);
    expect(data.prevWeekLabel).toBe("2026-W53");
    expect(data.prevWeekNum).toBe(53);
    expect(data.scorecard.map((e) => e.ticker)).toEqual(["TTD"]);
  });

  it("2026-W01 looks back to 2025-W52 (2025 has 52 ISO weeks)", () => {
    const data = gen.buildJournalData("2026-W01", W39, W39.length);
    expect(data.prevWeekLabel).toBe("2025-W52");
    expect(data.nextWeekNum).toBe(2);
  });

  it("mid-year weeks step by one", () => {
    const data = gen.buildJournalData("2026-W39", W39, W39.length);
    expect(data.prevWeekLabel).toBe("2026-W38");
    expect(data.nextWeekNum).toBe(40);
    expect(gen.shiftWeekLabel("2026-W53", 1)).toBe("2027-W01");
    expect(gen.shiftWeekLabel("2027-W01", -1)).toBe("2026-W53");
  });
});
