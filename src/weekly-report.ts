/**
 * weekly-report.ts — Weekly radar report generator
 *
 * Outputs:
 *   1. Console table (S2 first, then S1, then summary stats)
 *   2. CSV: results/radar_YYYY-WNN.csv
 *
 * Format: Two sections — "ATENCIÓN" (S2) and "OBSERVACIÓN" (S1)
 */

import fs from "fs";
import path from "path";
import type { ScanResult } from "./scanner.js";

const RESULTS_DIR =
  process.env.RADAR_RESULTS_DIR ??
  new URL("../results", import.meta.url).pathname;

function ensureResultsDir(): void {
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

function getWeekLabel(): string {
  const now = new Date();
  // ISO 8601 week number — Thursday-based (ISO 8601 week belongs to the year of its Thursday)
  const tmp = new Date(now.getTime());
  tmp.setHours(0, 0, 0, 0);
  // Set to nearest Thursday (ISO weeks start on Monday; Thursday determines the year)
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
  const week1 = new Date(tmp.getFullYear(), 0, 4); // Jan 4 is always in week 1
  const weekNum =
    1 +
    Math.round(
      ((tmp.getTime() - week1.getTime()) / 86400000 -
        3 +
        ((week1.getDay() + 6) % 7)) /
        7
    );
  const year = tmp.getFullYear();
  return `${year}-W${String(weekNum).padStart(2, "0")}`;
}

function fmt(n: number | undefined, decimals = 1, suffix = ""): string {
  if (n === undefined || n === null) return "  —  ";
  return `${n.toFixed(decimals)}${suffix}`;
}

function padRight(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}
function padLeft(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : " ".repeat(n - s.length) + s;
}

export function printReport(results: ScanResult[], runDate: string): void {
  const s2 = results.filter((r) => r.signalLevel === "S2");
  const s1 = results.filter((r) => r.signalLevel === "S1");
  const none = results.filter((r) => r.signalLevel === "none");

  console.log("\n" + "═".repeat(100));
  console.log(`  WILLIAMS ENTRY RADAR — ${runDate}  (${getWeekLabel()})`);
  console.log("═".repeat(100));

  // ── S2 — ATENCIÓN ──────────────────────────────────────────────────
  if (s2.length > 0) {
    console.log("\n  ▶▶ NIVEL 2 — ATENCIÓN (S2: AC cruzó el cero, AO negativo recuperándose)\n");
    const header = [
      padRight("Ticker", 7),
      padRight("Sector", 6),
      "T",
      padLeft("HR%", 5),
      padLeft("AO", 8),
      padLeft("AC", 8),
      padLeft("AO-Rec", 7),
      padLeft("Wks", 4),
      padLeft("ExpLag", 7),
      "  Señal",
    ].join("  ");
    console.log("  " + header);
    console.log("  " + "─".repeat(97));

    for (const r of s2) {
      const row = [
        padRight(r.ticker, 7),
        padRight(r.sector, 6),
        String(r.tier),
        padLeft(fmt(r.hrHistorical, 1, "%"), 5),
        padLeft(fmt(r.ao, 4), 8),
        padLeft(fmt(r.ac, 4), 8),
        padLeft(fmt(r.aoRecovery, 4), 7),
        padLeft(String(r.weeksActive), 4),
        padLeft(r.aoLagHistorical ? `${r.aoLagHistorical}W` : "—", 7),
        `  ${r.signalDate ?? ""}`,
      ].join("  ");
      console.log("  " + row);
    }
  } else {
    console.log("\n  ▶▶ NIVEL 2 — ATENCIÓN (S2): Sin señales activas esta semana\n");
  }

  // ── S1 — OBSERVACIÓN ────────────────────────────────────────────────
  if (s1.length > 0) {
    console.log("\n  ▷  NIVEL 1 — OBSERVACIÓN (S1: AC rojo→verde, AO y AC negativos)\n");
    const header = [
      padRight("Ticker", 7),
      padRight("Sector", 6),
      "T",
      padLeft("HR%", 5),
      padLeft("AO", 8),
      padLeft("AC", 8),
      padLeft("AC-clr", 6),
      padLeft("Wks", 4),
      padLeft("ExpLag", 7),
      "  Señal",
    ].join("  ");
    console.log("  " + header);
    console.log("  " + "─".repeat(97));

    for (const r of s1) {
      const row = [
        padRight(r.ticker, 7),
        padRight(r.sector, 6),
        String(r.tier),
        padLeft(fmt(r.hrHistorical, 1, "%"), 5),
        padLeft(fmt(r.ao, 4), 8),
        padLeft(fmt(r.ac, 4), 8),
        padLeft(r.acColor, 6),
        padLeft(String(r.weeksActive), 4),
        padLeft(r.aoLagHistorical ? `${r.aoLagHistorical}W` : "—", 7),
        `  ${r.signalDate ?? ""}`,
      ].join("  ");
      console.log("  " + row);
    }
  } else {
    console.log("\n  ▷  NIVEL 1 — OBSERVACIÓN (S1): Sin señales activas esta semana\n");
  }

  // ── RESUMEN ─────────────────────────────────────────────────────────
  console.log("\n" + "─".repeat(100));
  console.log(`  RESUMEN: ${results.length} tickers escaneados  |  S2 activos: ${s2.length}  |  S1 activos: ${s1.length}  |  Sin señal: ${none.length}`);
  console.log("═".repeat(100) + "\n");
}

export function saveCSV(results: ScanResult[], runDate: string): string {
  ensureResultsDir();
  const week = getWeekLabel();
  const filename = `radar_${week}.csv`;
  const filepath = path.join(RESULTS_DIR, filename);

  const headers = [
    "ticker", "sector", "tier", "signalLevel", "signalDate", "weeksActive",
    "ao", "ac", "acColor", "hrHistorical", "avgRetHistorical",
    "maxDdHistorical", "aoLagHistorical", "aoRecovery", "aoBottomDepth",
  ];

  const rows = results.map((r) => [
    r.ticker, r.sector, r.tier, r.signalLevel, r.signalDate ?? "",
    r.weeksActive, r.ao.toFixed(4), r.ac.toFixed(4), r.acColor,
    r.hrHistorical ?? "", r.avgRetHistorical ?? "", r.maxDdHistorical ?? "",
    r.aoLagHistorical ?? "", r.aoRecovery?.toFixed(4) ?? "", r.aoBottomDepth ?? "",
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  fs.writeFileSync(filepath, csv, "utf-8");
  return filepath;
}
