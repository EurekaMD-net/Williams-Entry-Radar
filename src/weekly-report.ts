/**
 * weekly-report.ts — Weekly radar report generator
 *
 * Outputs:
 *   1. Console table (S2 first, then S1, then summary stats)
 *   2. CSV: results/radar_YYYY-WNN.csv
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

export function getWeekLabel(): string {
  const now = new Date();
  const tmp = new Date(now.getTime());
  tmp.setHours(0, 0, 0, 0);
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
  const week1 = new Date(tmp.getFullYear(), 0, 4);
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

function priceFlags(r: ScanResult): string {
  const flags: string[] = [];
  if (r.nearLows)  flags.push(`*MINIMOS(p${r.pricePercentile}%)`);
  if (r.ranging)   flags.push("!RANGO");
  return flags.length ? "  " + flags.join(" ") : "";
}

export function printReport(results: ScanResult[], runDate: string): void {
  const s2   = results.filter((r) => r.signalLevel === "S2");
  const s1   = results.filter((r) => r.signalLevel === "S1");
  const none = results.filter((r) => r.signalLevel === "none");

  console.log("\n" + "=".repeat(110));
  console.log(`  WILLIAMS ENTRY RADAR — ${runDate}  (${getWeekLabel()})`);
  console.log("=".repeat(110));

  // ── S2 — ATENCIÓN ─────────────────────────────────────────────────
  if (s2.length > 0) {
    console.log("\n  >> NIVEL 2 — ATENCION (S2: AC cruzo el cero esta semana, AO negativo)\n");
    const header = [
      padRight("Ticker", 7),
      padRight("Sector", 6),
      "T",
      padLeft("HR%",  5),
      padLeft("AO",   8),
      padLeft("AC",   8),
      padLeft("Pct",  5),
      padLeft("ExpLag", 7),
      "  Contexto",
    ].join("  ");
    console.log("  " + header);
    console.log("  " + "-".repeat(107));

    for (const r of s2) {
      const row = [
        padRight(r.ticker, 7),
        padRight(r.sector, 6),
        String(r.tier),
        padLeft(fmt(r.hrHistorical, 1, "%"), 5),
        padLeft(fmt(r.ao, 4), 8),
        padLeft(fmt(r.ac, 4), 8),
        padLeft(`${r.pricePercentile}%`, 5),
        padLeft(r.aoLagHistorical ? `${r.aoLagHistorical}W` : "-", 7),
        priceFlags(r),
      ].join("  ");
      console.log("  " + row);
    }
  } else {
    console.log("\n  >> NIVEL 2 — ATENCION (S2): Sin señales esta semana\n");
  }

  // ── S1 — OBSERVACIÓN ──────────────────────────────────────────────
  if (s1.length > 0) {
    console.log("\n  >  NIVEL 1 — OBSERVACION (S1: AC rojo->verde esta semana, AO y AC negativos)\n");
    const header = [
      padRight("Ticker", 7),
      padRight("Sector", 6),
      "T",
      padLeft("HR%",  5),
      padLeft("AO",   8),
      padLeft("AC",   8),
      padLeft("Pct",  5),
      padLeft("ExpLag", 7),
      "  Contexto",
    ].join("  ");
    console.log("  " + header);
    console.log("  " + "-".repeat(107));

    for (const r of s1) {
      const row = [
        padRight(r.ticker, 7),
        padRight(r.sector, 6),
        String(r.tier),
        padLeft(fmt(r.hrHistorical, 1, "%"), 5),
        padLeft(fmt(r.ao, 4), 8),
        padLeft(fmt(r.ac, 4), 8),
        padLeft(`${r.pricePercentile}%`, 5),
        padLeft(r.aoLagHistorical ? `${r.aoLagHistorical}W` : "-", 7),
        priceFlags(r),
      ].join("  ");
      console.log("  " + row);
    }
  } else {
    console.log("\n  >  NIVEL 1 — OBSERVACION (S1): Sin señales esta semana\n");
  }

  // ── RESUMEN ───────────────────────────────────────────────────────
  const s2NearLows = s2.filter((r) => r.nearLows).length;
  const s1NearLows = s1.filter((r) => r.nearLows).length;
  console.log("\n" + "-".repeat(110));
  console.log(`  RESUMEN: ${results.length} tickers  |  S2: ${s2.length} (${s2NearLows} en minimos)  |  S1: ${s1.length} (${s1NearLows} en minimos)  |  Sin senal: ${none.length}`);
  console.log("=".repeat(110) + "\n");
}

export function saveCSV(results: ScanResult[], runDate: string): string {
  ensureResultsDir();
  const week = getWeekLabel();
  const filename = `radar_${week}.csv`;
  const filepath = path.join(RESULTS_DIR, filename);

  const headers = [
    "ticker", "sector", "tier", "signalLevel", "signalDate", "weeksActive",
    "ao", "ac", "acColor", "hrHistorical", "avgRetHistorical",
    "maxDdHistorical", "aoLagHistorical", "nearLows", "ranging", "pricePercentile",
  ];

  const rows = results.map((r) => [
    r.ticker, r.sector, r.tier, r.signalLevel, r.signalDate ?? "",
    r.weeksActive, r.ao.toFixed(4), r.ac.toFixed(4), r.acColor,
    r.hrHistorical ?? "", r.avgRetHistorical ?? "", r.maxDdHistorical ?? "",
    r.aoLagHistorical ?? "", r.nearLows, r.ranging, r.pricePercentile,
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  fs.writeFileSync(filepath, csv, "utf-8");
  return filepath;
}
