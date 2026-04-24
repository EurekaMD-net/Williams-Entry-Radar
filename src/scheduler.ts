/**
 * scheduler.ts — Friday 18:00 MX orchestrator for Williams Entry Radar
 *
 * Run order:
 *   1. fetchAll()        — update stale/missing tickers in SQLite cache
 *   2. runScan()         — detect active S1 / S2 signals
 *   3. printReport()     — console output
 *   4. saveCSV()         — persist to results/
 *   5. updateSignalsMd() — append to signals.md in repo
 *   6. [if S2] enrichS2Tickers() — Xpoz Reddit enrichment
 *   7. pushWeeklyResults() — push CSV + signals.md to GitHub
 *   8. sendTelegram()    — executive summary to Fede
 *   9. checkStaleSignals() — log tickers approaching 20w discard threshold
 *
 * Env vars:
 *   AV_API_KEY           — Alpha Vantage
 *   TELEGRAM_BOT_TOKEN   — Telegram bot
 *   TELEGRAM_CHAT_ID     — Telegram chat
 *   GH_TOKEN             — GitHub personal access token
 *   GH_REPO              — GitHub repo (default: EurekaMD-net/Williams-Entry-Radar)
 *   XPOZ_API_KEY         — Xpoz API (optional — enrichment skipped if missing)
 *   TZ                   — should be America/Mexico_City
 *   RADAR_RESULTS_DIR    — override output dir (default: ./results)
 *   RADAR_DB_PATH        — override SQLite path (default: ./data/radar.db)
 *
 * Schedule: Fridays 18:00 MX ("0 18 * * 5" in America/Mexico_City)
 * Can also be triggered manually: npx tsx src/scheduler.ts --run-now
 */

import cron from "node-cron";
import { fetchAll } from "./fetcher.js";
import { runScan } from "./scanner.js";
import { printReport, saveCSV, getWeekLabel } from "./weekly-report.js";
import { enrichS2Tickers, formatXpozForTelegram } from "./xpoz-enrich.js";
import { pushWeeklyResults } from "./git-push.js";
import { buildTelegramMessage, sendTelegram } from "./notify.js";
import { checkStaleSignals } from "./expand.js";
import { seedRegistry } from "./cache.js";
import { getUniverseTickers } from "./universe.js";
import { readCache } from "./cache.js";
import type { WeeklyBar } from "./fetcher.js";
import fs from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// Signals log (signals.md) — persistent markdown log of every weekly run
// ---------------------------------------------------------------------------

const SIGNALS_MD_PATH = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  "signals.md"
);

function appendToSignalsMd(weekLabel: string, summary: string): void {
  // Idempotent: if this week's section already exists, overwrite it instead of appending.
  // Prevents duplicate entries when --run-now is used more than once in the same week.
  if (fs.existsSync(SIGNALS_MD_PATH)) {
    const existing = fs.readFileSync(SIGNALS_MD_PATH, "utf-8");
    const sectionStart = `## ${weekLabel}`;
    if (existing.includes(sectionStart)) {
      // Replace the existing section for this week
      const beforeSection = existing.slice(0, existing.indexOf(sectionStart));
      const afterSectionMatch = existing.slice(existing.indexOf(sectionStart) + sectionStart.length);
      // Find the next section (## ...) or end of file
      const nextSectionIdx = afterSectionMatch.search(/\n## /);
      const afterSection = nextSectionIdx === -1 ? "" : afterSectionMatch.slice(nextSectionIdx);
      const updated = beforeSection + `${sectionStart}\n\n${summary}\n\n---\n\n` + afterSection;
      fs.writeFileSync(SIGNALS_MD_PATH, updated, "utf-8");
      return;
    }
  }
  const header = fs.existsSync(SIGNALS_MD_PATH) ? "" : "# Williams Entry Radar — Señales Semanales\n\n";
  const entry = `## ${weekLabel}\n\n${summary}\n\n---\n\n`;
  fs.appendFileSync(SIGNALS_MD_PATH, header + entry, "utf-8");
}

function buildSignalsSummary(
  results: ReturnType<typeof runScan>,
  xpozLines: string[]
): string {
  const s2 = results.filter((r) => r.signalLevel === "S2");
  const s1 = results.filter((r) => r.signalLevel === "S1");
  const lines: string[] = [];

  lines.push(`**Run:** ${new Date().toISOString()}`);
  lines.push(`**Escaneados:** ${results.length} | **S2:** ${s2.length} | **S1:** ${s1.length}`);
  lines.push("");

  if (s2.length > 0) {
    lines.push("### NIVEL 2 — ATENCIÓN (S2)");
    lines.push("| Ticker | Sector | T | HR% | AO | AC | Wks | Señal |");
    lines.push("|--------|--------|---|-----|-----|-----|-----|-------|");
    for (const r of s2) {
      lines.push(`| ${r.ticker} | ${r.sector} | ${r.tier} | ${r.hrHistorical?.toFixed(1) ?? "—"}% | ${r.ao.toFixed(3)} | ${r.ac.toFixed(3)} | ${r.weeksActive} | ${r.signalDate ?? "?"} |`);
    }
    if (xpozLines.length > 0) {
      lines.push("");
      lines.push("**Reddit (Xpoz):**");
      for (const l of xpozLines) lines.push(`- ${l}`);
    }
    lines.push("");
  }

  if (s1.length > 0) {
    lines.push("### NIVEL 1 — OBSERVACIÓN (S1)");
    lines.push("| Ticker | Sector | T | HR% | Wks | Señal |");
    lines.push("|--------|--------|---|-----|-----|-------|");
    for (const r of s1) {
      lines.push(`| ${r.ticker} | ${r.sector} | ${r.tier} | ${r.hrHistorical?.toFixed(1) ?? "—"}% | ${r.weeksActive} | ${r.signalDate ?? "?"} |`);
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

export async function runWeeklyPipeline(): Promise<void> {
  const startTime = Date.now();
  const runDate = new Date().toISOString().split("T")[0];
  const weekLabel = getWeekLabel();

  console.log("\n" + "═".repeat(80));
  console.log(`  WILLIAMS ENTRY RADAR — PIPELINE SEMANAL — ${weekLabel}`);
  console.log("═".repeat(80));

  // 1. Ensure registry is populated
  seedRegistry();

  // 2. Fetch stale / missing data
  console.log("\n[1/8] Fetching data...");
  const tickers = getUniverseTickers();
  await fetchAll(tickers);

  // 3. Load bars from cache and run scan
  console.log("\n[2/8] Running scan...");
  const tickerBars = new Map<string, WeeklyBar[]>();
  for (const ticker of tickers) {
    const raw = readCache(ticker);
    if (!raw) continue;
    // Parse bars from raw cache (same as migrate-cache.ts)
    const bars: WeeklyBar[] = Object.entries(raw)
      .map(([date, vals]) => ({
        date,
        open: parseFloat(vals["1. open"]),
        high: parseFloat(vals["2. high"]),
        low: parseFloat(vals["3. low"]),
        close: parseFloat(vals["5. adjusted close"]),
        volume: parseInt(vals["6. volume"] ?? vals["5. volume"] ?? "0", 10),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
    tickerBars.set(ticker, bars);
  }

  const results = runScan(tickerBars);
  const s2Results = results.filter((r) => r.signalLevel === "S2");
  const s1Results = results.filter((r) => r.signalLevel === "S1");

  // 4. Console output
  console.log("\n[3/8] Report:");
  printReport(results, runDate);

  // 5. Save CSV
  console.log("[4/8] Saving CSV...");
  const csvPath = saveCSV(results, runDate);
  console.log(`  → ${csvPath}`);

  // 6. Xpoz enrichment (only if S2 active)
  let xpozLines: string[] = [];
  if (s2Results.length > 0) {
    console.log(`\n[5/8] Xpoz enrichment for ${s2Results.length} S2 ticker(s)...`);
    const xpozResults = await enrichS2Tickers(s2Results.map((r) => r.ticker));
    xpozLines = formatXpozForTelegram(xpozResults);
  } else {
    console.log("[5/8] No S2 signals — skipping Xpoz enrichment");
  }

  // 7. Append to signals.md
  console.log("\n[6/8] Updating signals.md...");
  const summary = buildSignalsSummary(results, xpozLines);
  appendToSignalsMd(weekLabel, summary);
  console.log(`  → ${SIGNALS_MD_PATH}`);

  // 8. Push to GitHub
  console.log("\n[7/8] Pushing to GitHub...");
  await pushWeeklyResults(csvPath, weekLabel, SIGNALS_MD_PATH);

  // 9. Send Telegram notification
  console.log("\n[8/8] Sending Telegram notification...");
  const telegramMsg = buildTelegramMessage(results, weekLabel, xpozLines);
  await sendTelegram(telegramMsg);

  // 10. Stale signal check (informational)
  const activeSignals = [...s2Results, ...s1Results].map((r) => ({
    ticker: r.ticker,
    signalLevel: r.signalLevel,
    weeksActive: r.weeksActive,
  }));
  checkStaleSignals(activeSignals);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✓ Pipeline completado en ${elapsed}s`);
  console.log("═".repeat(80) + "\n");
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const RUN_NOW = process.argv.includes("--run-now");

if (RUN_NOW) {
  console.log("[scheduler] --run-now flag detected. Executing immediately...");
  runWeeklyPipeline().catch((err) => {
    console.error("[scheduler] Pipeline failed:", err);
    process.exit(1);
  });
} else {
  // Schedule: Fridays at 18:00 MX time
  // TZ env var should be set to America/Mexico_City in the systemd unit
  const CRON_EXPR = "0 18 * * 5";
  console.log(`[scheduler] Scheduled → Fridays 18:00 MX (cron: "${CRON_EXPR}")`);
  console.log("[scheduler] Waiting for next run. Use --run-now to trigger immediately.");

  cron.schedule(CRON_EXPR, () => {
    console.log("[scheduler] Cron triggered");
    runWeeklyPipeline().catch((err) => {
      console.error("[scheduler] Pipeline failed:", err);
    });
  }, {
    timezone: "America/Mexico_City",
  });
}
