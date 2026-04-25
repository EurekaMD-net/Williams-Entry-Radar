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
import { getWeekLabel as getWeekLabelTz } from "./time.js";
import { csvRow } from "./csv.js";

const RESULTS_DIR =
  process.env.RADAR_RESULTS_DIR ??
  new URL("../results", import.meta.url).pathname;

function ensureResultsDir(): void {
  if (!fs.existsSync(RESULTS_DIR))
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

/**
 * ISO-8601 week label in America/Mexico_City. Re-exported from `./time.js`
 * which uses Intl.DateTimeFormat for explicit-TZ computation. Inlining
 * Date.setDate/getDay math here would be local-machine-TZ dependent — works
 * by accident today because the systemd unit sets TZ=America/Mexico_City,
 * but the explicit-TZ choice is the design.
 */
export function getWeekLabel(): string {
  return getWeekLabelTz();
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
  if (r.nearLows) flags.push(`*MINIMOS(p${r.pricePercentile}%)`);
  if (r.ranging) flags.push("!RANGO");
  return flags.length ? "  " + flags.join(" ") : "";
}

export function printReport(results: ScanResult[], runDate: string): void {
  const s2 = results.filter((r) => r.signalLevel === "S2");
  const s2d = results.filter((r) => r.signalLevel === "S2D");
  const s1 = results.filter((r) => r.signalLevel === "S1");
  const none = results.filter((r) => r.signalLevel === "none");

  console.log("\n" + "=".repeat(110));
  console.log(`  WILLIAMS ENTRY RADAR — ${runDate}  (${getWeekLabel()})`);
  console.log("=".repeat(110));

  const signalTableHeader = () => {
    const header = [
      padRight("Ticker", 7),
      padRight("Sector", 6),
      "T",
      padLeft("HR%", 5),
      padLeft("AO", 8),
      padLeft("AC", 8),
      padLeft("Pct", 5),
      padLeft("ExpLag", 7),
      "  Contexto",
    ].join("  ");
    console.log("  " + header);
    console.log("  " + "-".repeat(107));
  };

  const signalRow = (r: ScanResult) => {
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
  };

  // ── S2 PURA — ATENCIÓN ────────────────────────────────────────────
  if (s2.length > 0) {
    console.log(
      "\n  >> S2 PURA — ATENCION (AC cruzo el cero ESTA semana, AO negativo Y rojo)\n",
    );
    signalTableHeader();
    for (const r of s2) signalRow(r);
  } else {
    console.log("\n  >> S2 PURA — ATENCION: Sin señales esta semana");
  }

  // ── S2 DEGRADADA — POTENCIAL ──────────────────────────────────────
  if (s2d.length > 0) {
    console.log(
      "\n  ~~ S2 DEGRADADA — POTENCIAL (AC cruzo el cero, pero AO ya iba verde = movimiento adelantado)\n",
    );
    signalTableHeader();
    for (const r of s2d) signalRow(r);
  } else {
    console.log("  ~~ S2 DEGRADADA: ninguna");
  }

  // ── S1 — OBSERVACIÓN ──────────────────────────────────────────────
  if (s1.length > 0) {
    console.log(
      "\n  >  S1 — OBSERVACION (AC verde ESTA semana, AO y AC negativos)\n",
    );
    signalTableHeader();
    for (const r of s1) signalRow(r);
  } else {
    console.log("\n  >  S1 — OBSERVACION: Sin señales esta semana");
  }

  // ── RESUMEN ───────────────────────────────────────────────────────
  const s2NearLows = s2.filter((r) => r.nearLows).length;
  const s2dNearLows = s2d.filter((r) => r.nearLows).length;
  const s1NearLows = s1.filter((r) => r.nearLows).length;
  console.log("\n" + "-".repeat(110));
  console.log(
    `  RESUMEN: ${results.length} tickers  |  S2: ${s2.length} (${s2NearLows} en minimos)  |  S2D: ${s2d.length} (${s2dNearLows} en minimos)  |  S1: ${s1.length} (${s1NearLows} en minimos)  |  Sin senal: ${none.length}`,
  );
  console.log("=".repeat(110) + "\n");
}

export function saveCSV(results: ScanResult[], runDate: string): string {
  ensureResultsDir();
  const week = getWeekLabel();
  const filename = `radar_${week}.csv`;
  const filepath = path.join(RESULTS_DIR, filename);

  const headers = [
    "ticker",
    "sector",
    "tier",
    "signalLevel",
    "signalQuality",
    "signalDate",
    "weeksActive",
    "ao",
    "ac",
    "acColor",
    "hrHistorical",
    "avgRetHistorical",
    "maxDdHistorical",
    "aoLagHistorical",
    "nearLows",
    "ranging",
    "pricePercentile",
  ];

  const rows = results.map((r) => [
    r.ticker,
    r.sector,
    r.tier,
    r.signalLevel,
    r.signalQuality,
    r.signalDate ?? "",
    r.weeksActive,
    r.ao.toFixed(4),
    r.ac.toFixed(4),
    r.acColor,
    r.hrHistorical ?? "",
    r.avgRetHistorical ?? "",
    r.maxDdHistorical ?? "",
    r.aoLagHistorical ?? "",
    r.nearLows,
    r.ranging,
    r.pricePercentile,
  ]);

  // csvRow handles comma/quote/newline escaping per RFC 4180. Today every
  // ScanResult field is comma-safe (numbers, tickers, sector codes, ISO
  // dates, booleans), but routing through the helper means a future free-
  // text column (e.g. signal notes, news headlines) won't silently corrupt
  // the CSV.
  const csv = [csvRow(headers), ...rows.map(csvRow)].join("\n");
  fs.writeFileSync(filepath, csv, "utf-8");
  return filepath;
}
