import { describe, it, expect } from "vitest";
import { buildTelegramMessage, escapeMd } from "./notify.js";
import type { ScanResult } from "./scanner.js";

function mkResult(
  ticker: string,
  signalLevel: ScanResult["signalLevel"],
  signalQuality: ScanResult["signalQuality"] = "n/a",
  overrides: Partial<ScanResult> = {},
): ScanResult {
  return {
    ticker,
    sector: "XLU",
    tier: 1,
    signalLevel,
    signalQuality,
    signalDate: "2026-04-24",
    weeksActive: 0,
    ao: -1.0,
    ac: -0.3,
    acColor: "green",
    hrHistorical: 75,
    avgRetHistorical: 0.05,
    maxDdHistorical: -0.04,
    aoLagHistorical: 3,
    nearLows: false,
    ranging: false,
    pricePercentile: 35,
    ...overrides,
  };
}

describe("escapeMd", () => {
  it("escapes underscores and asterisks but leaves other chars alone", () => {
    expect(escapeMd("foo_bar*baz")).toBe("foo\\_bar\\*baz");
    expect(escapeMd("plain text 123")).toBe("plain text 123");
  });
});

describe("buildTelegramMessage", () => {
  it("renders S2 PURA, S2 DEGRADADA, and S1 sections separately", () => {
    const results = [
      mkResult("ED", "S2", "pure"),
      mkResult("BA", "S2D", "degraded"),
      mkResult("PG", "S1", "n/a"),
    ];
    const msg = buildTelegramMessage(results, "2026-W17");

    expect(msg).toContain("Williams Entry Radar — 2026-W17");
    expect(msg).toContain("S2 PURA — ATENCIÓN");
    expect(msg).toContain("`ED`");
    expect(msg).toContain("S2 DEGRADADA — POTENCIAL");
    expect(msg).toContain("`BA`");
    expect(msg).toContain("NIVEL 1 — OBSERVACIÓN (S1)");
    expect(msg).toContain("`PG`");
  });

  it("includes S2D count in the header summary line", () => {
    const results = [
      mkResult("A", "S2", "pure"),
      mkResult("B", "S2D", "degraded"),
      mkResult("C", "S2D", "degraded"),
      mkResult("D", "S1"),
    ];
    const msg = buildTelegramMessage(results, "2026-W17");
    expect(msg).toContain("S2: 1 | S2D: 2 | S1: 1");
  });

  it("renders empty-state messages when a section has zero results", () => {
    const msg = buildTelegramMessage([], "2026-W17");
    expect(msg).toContain("S2 PURA — ATENCIÓN:* Sin señales esta semana");
    expect(msg).toContain("S2 DEGRADADA:* ninguna");
    expect(msg).toContain("S1):* Sin señales activas");
  });

  it("attaches xpoz lines under the S2 PURA section header when supplied", () => {
    const results = [mkResult("ED", "S2", "pure")];
    const xpozLines = ['🔥 `ED` HIGH (25 posts) — "Earnings beat"'];
    const msg = buildTelegramMessage(results, "2026-W17", xpozLines);
    expect(msg).toContain("Confluencia Reddit (Xpoz)");
    expect(msg).toContain('🔥 `ED` HIGH (25 posts) — "Earnings beat"');
  });

  it("does NOT show the Xpoz block when xpozLines is empty", () => {
    const results = [mkResult("ED", "S2", "pure")];
    const msg = buildTelegramMessage(results, "2026-W17", []);
    expect(msg).not.toContain("Confluencia Reddit (Xpoz)");
  });

  it("caps S1 list at 10 entries with a 'top 10 de N' label", () => {
    const results = Array.from({ length: 15 }, (_, i) =>
      mkResult(`T${i}`, "S1"),
    );
    const msg = buildTelegramMessage(results, "2026-W17");
    expect(msg).toContain("(top 10 de 15)");
    // Spot-check: T0..T9 present, T10..T14 absent
    expect(msg).toContain("`T0`");
    expect(msg).toContain("`T9`");
    expect(msg).not.toContain("`T10`");
    expect(msg).not.toContain("`T14`");
  });
});
