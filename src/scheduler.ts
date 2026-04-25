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
 *   XPOZ_API_TOKEN       — local xpoz-pipeline auth (optional — enrichment skipped if missing)
 *   XPOZ_BASE_URL        — local xpoz-pipeline base URL (default http://127.0.0.1:8086)
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
import { DEFAULT_TZ } from "./time.js";
import fs from "fs";
import path from "path";

const SCHEDULE_TZ = DEFAULT_TZ;
const CRON_EXPR = "0 18 * * 5"; // Fridays 18:00 in SCHEDULE_TZ

// ---------------------------------------------------------------------------
// Signals log (signals.md) — persistent markdown log of every weekly run
// ---------------------------------------------------------------------------

const SIGNALS_MD_PATH = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  "signals.md",
);

/**
 * Idempotent append: if a heading for `weekLabel` already exists in the
 * file, replace that section in place; otherwise append.
 *
 * Heading match is EXACT against `^## <label>$` — not a substring match.
 * A prior bug used `.includes("## 2026-W17")` which would also match
 * `## 2026-W170` or any body text containing those characters.
 */
function appendToSignalsMd(weekLabel: string, summary: string): void {
  const heading = `## ${weekLabel}`;
  const entry = `${heading}\n\n${summary}\n\n---\n\n`;

  if (!fs.existsSync(SIGNALS_MD_PATH)) {
    fs.writeFileSync(
      SIGNALS_MD_PATH,
      `# Williams Entry Radar — Señales Semanales\n\n${entry}`,
      "utf-8",
    );
    return;
  }

  const existing = fs.readFileSync(SIGNALS_MD_PATH, "utf-8");
  // Exact-heading line test (anchored to start-of-line, end-of-line).
  // Escape regex metachars in the label defensively.
  const escaped = weekLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headingLineRe = new RegExp(`^## ${escaped}$`, "m");
  const headingLineMatch = headingLineRe.exec(existing);

  if (!headingLineMatch) {
    fs.appendFileSync(SIGNALS_MD_PATH, entry, "utf-8");
    return;
  }

  const sectionStart = headingLineMatch.index;
  const afterHeading = existing.slice(
    sectionStart + headingLineMatch[0].length,
  );
  // Find the next `^## ` heading after this one, if any.
  const nextHeadingRe = /^## /m;
  const nextMatch = nextHeadingRe.exec(afterHeading);
  const before = existing.slice(0, sectionStart);
  const after = nextMatch ? afterHeading.slice(nextMatch.index) : "";
  fs.writeFileSync(SIGNALS_MD_PATH, before + entry + after, "utf-8");
}

function buildSignalsSummary(
  results: ReturnType<typeof runScan>,
  xpozLines: string[],
): string {
  const s2 = results.filter((r) => r.signalLevel === "S2");
  const s1 = results.filter((r) => r.signalLevel === "S1");
  const lines: string[] = [];

  lines.push(`**Run:** ${new Date().toISOString()}`);
  lines.push(
    `**Escaneados:** ${results.length} | **S2:** ${s2.length} | **S1:** ${s1.length}`,
  );
  lines.push("");

  if (s2.length > 0) {
    lines.push("### NIVEL 2 — ATENCIÓN (S2)");
    lines.push("| Ticker | Sector | T | HR% | AO | AC | Wks | Señal |");
    lines.push("|--------|--------|---|-----|-----|-----|-----|-------|");
    for (const r of s2) {
      lines.push(
        `| ${r.ticker} | ${r.sector} | ${r.tier} | ${r.hrHistorical?.toFixed(1) ?? "—"}% | ${r.ao.toFixed(3)} | ${r.ac.toFixed(3)} | ${r.weeksActive} | ${r.signalDate ?? "?"} |`,
      );
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
      lines.push(
        `| ${r.ticker} | ${r.sector} | ${r.tier} | ${r.hrHistorical?.toFixed(1) ?? "—"}% | ${r.weeksActive} | ${r.signalDate ?? "?"} |`,
      );
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Pipeline safety: overlap guard + completion marker
// ---------------------------------------------------------------------------

let pipelineRunning = false;

const LAST_RUN_PATH = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  "data",
  "last-run.json",
);

function readLastRunWeek(): string | null {
  try {
    const raw = fs.readFileSync(LAST_RUN_PATH, "utf-8");
    const parsed = JSON.parse(raw) as { weekLabel?: string };
    return parsed.weekLabel ?? null;
  } catch {
    return null;
  }
}

function writeLastRunWeek(weekLabel: string): void {
  try {
    fs.mkdirSync(path.dirname(LAST_RUN_PATH), { recursive: true });
    fs.writeFileSync(
      LAST_RUN_PATH,
      JSON.stringify({ weekLabel, at: new Date().toISOString() }, null, 2),
      "utf-8",
    );
  } catch (err) {
    console.warn("[scheduler] Failed to write last-run marker:", err);
  }
}

// ---------------------------------------------------------------------------
// Delivery preflight
// ---------------------------------------------------------------------------
//
// Runs at step 0 — before the 5-minute scan. If Telegram or GitHub credentials
// are broken (expired tokens, wrong chat id, revoked access), operators should
// see a loud warning in the journal immediately, not wait 6+ minutes to find
// out at step 8 when the notification silently fails.
//
// Fail-warn, not fail-abort: a broken delivery channel shouldn't suppress the
// CSV + signals.md outputs, which are still valuable for forensic review.

interface PreflightResult {
  channel: "telegram" | "github";
  ok: boolean;
  detail: string;
}

async function preflightTelegram(): Promise<PreflightResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
  const chat = process.env.TELEGRAM_CHAT_ID ?? "";
  if (!token || !chat) {
    return {
      channel: "telegram",
      ok: false,
      detail: "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set",
    };
  }
  try {
    const me = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    if (!me.ok) {
      return {
        channel: "telegram",
        ok: false,
        detail: `getMe ${me.status} — bot token invalid or revoked`,
      };
    }
    // getChat probes that the bot can resolve this chat_id. Note: this is
    // NOT proof that sendMessage will succeed — a bot kicked from some chat
    // types still resolves getChat, and a typo'd chat_id can land on a
    // different chat the bot also belongs to. It catches the common total-
    // misconfig case (wrong digits, bot never added) but not every failure.
    const chatRes = await fetch(
      `https://api.telegram.org/bot${token}/getChat?chat_id=${encodeURIComponent(chat)}`,
    );
    if (!chatRes.ok) {
      const body = await chatRes.text().catch(() => "(no body)");
      return {
        channel: "telegram",
        ok: false,
        detail: `getChat ${chatRes.status} — ${body.slice(0, 120)}`,
      };
    }
    return { channel: "telegram", ok: true, detail: "bot + chat reachable" };
  } catch (err) {
    return {
      channel: "telegram",
      ok: false,
      detail: `network error: ${(err as Error).message}`,
    };
  }
}

async function preflightGitHub(): Promise<PreflightResult> {
  const token = process.env.GH_TOKEN ?? "";
  if (!token) {
    return { channel: "github", ok: false, detail: "GH_TOKEN not set" };
  }
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      return {
        channel: "github",
        ok: false,
        detail: `/user ${res.status} — token expired or revoked`,
      };
    }
    return { channel: "github", ok: true, detail: "token valid" };
  } catch (err) {
    return {
      channel: "github",
      ok: false,
      detail: `network error: ${(err as Error).message}`,
    };
  }
}

async function runDeliveryPreflight(): Promise<void> {
  const [tg, gh] = await Promise.all([preflightTelegram(), preflightGitHub()]);
  for (const r of [tg, gh]) {
    if (r.ok) {
      console.log(`[preflight] ${r.channel}: OK (${r.detail})`);
    } else {
      console.warn(`[preflight] ${r.channel}: BROKEN — ${r.detail}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

export async function runWeeklyPipeline(): Promise<void> {
  // Overlap guard: if a cron fire lands while the previous run is still
  // working, skip rather than race on the CSV / signals.md / GitHub push.
  if (pipelineRunning) {
    console.warn(
      "[scheduler] Previous pipeline still running — skipping this trigger.",
    );
    return;
  }
  pipelineRunning = true;
  try {
    await runWeeklyPipelineInner();
  } finally {
    pipelineRunning = false;
  }
}

async function runWeeklyPipelineInner(): Promise<void> {
  const startTime = Date.now();
  const runDate = new Date().toISOString().split("T")[0];
  const weekLabel = getWeekLabel();

  console.log("\n" + "═".repeat(80));
  console.log(`  WILLIAMS ENTRY RADAR — PIPELINE SEMANAL — ${weekLabel}`);
  console.log("═".repeat(80));

  // 0. Delivery preflight — surface broken Telegram/GitHub creds up front
  //    so operators don't find out 6 min later at step 8. Warn-only: we still
  //    produce CSV + signals.md even if delivery is down.
  console.log("\n[0/8] Delivery preflight...");
  await runDeliveryPreflight();

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

  // 6. Xpoz enrichment (only if S2 active).
  //    WRAPPED: a throw here must NOT cascade past GitHub push (step 7) or
  //    the Telegram notification (step 8). Historical incident 2026-04-24:
  //    the old xpoz-enrich threw on 4xx from the nonexistent api.xpoz.io
  //    REST endpoint, which aborted the entire pipeline and collateral-killed
  //    both downstream delivery channels. The pipeline now produces an empty
  //    xpozLines on failure rather than aborting.
  let xpozLines: string[] = [];
  if (s2Results.length > 0) {
    console.log(
      `\n[5/8] Xpoz enrichment for ${s2Results.length} S2 ticker(s)...`,
    );
    try {
      const xpozResults = await enrichS2Tickers(s2Results.map((r) => r.ticker));
      xpozLines = formatXpozForTelegram(xpozResults);
    } catch (err) {
      console.error(
        "[scheduler] Xpoz enrichment failed — continuing without it:",
        err,
      );
    }
  } else {
    console.log("[5/8] No S2 signals — skipping Xpoz enrichment");
  }

  // 7. Append to signals.md
  console.log("\n[6/8] Updating signals.md...");
  const summary = buildSignalsSummary(results, xpozLines);
  appendToSignalsMd(weekLabel, summary);
  console.log(`  → ${SIGNALS_MD_PATH}`);

  // 8. Push to GitHub — wrapped: a 409 or network blip here must NOT
  //    prevent the Telegram notification from going out. The "defensive"
  //    posture added in commit af622ca previously covered only Xpoz and
  //    Telegram; the GitHub push was still unguarded and could abort the
  //    pipeline before step 9.
  console.log("\n[7/8] Pushing to GitHub...");
  try {
    await pushWeeklyResults(csvPath, weekLabel, SIGNALS_MD_PATH);
  } catch (err) {
    console.error(
      "[scheduler] GitHub push failed — continuing to notify:",
      err,
    );
  }

  // 9. Send Telegram notification
  console.log("\n[8/8] Sending Telegram notification...");
  const telegramMsg = buildTelegramMessage(results, weekLabel, xpozLines);
  await sendTelegram(telegramMsg);

  // Record successful completion so we can detect missed weeks on boot.
  writeLastRunWeek(weekLabel);

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

/**
 * Startup catch-up: if the current week never completed a run and we're
 * already past Fri 18:00 MX, fire the pipeline once. Otherwise the VPS
 * rebooting across the cron window silently drops that week's radar.
 */
function isPastWeeklyDeadline(now: Date = new Date()): boolean {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: SCHEDULE_TZ,
    weekday: "short",
    hour: "numeric",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0";
  // `hour12: false` can yield "24" for midnight — normalize.
  const hour = Math.min(Number(hourStr), 23);
  // Past deadline if Fri >=18 or any Sat/Sun, in SCHEDULE_TZ.
  if (weekday === "Fri" && hour >= 18) return true;
  if (weekday === "Sat" || weekday === "Sun") return true;
  return false;
}

if (RUN_NOW) {
  console.log("[scheduler] --run-now flag detected. Executing immediately...");
  runWeeklyPipeline().catch((err) => {
    console.error("[scheduler] Pipeline failed:", err);
    process.exit(1);
  });
} else {
  console.log(
    `[scheduler] Scheduled → Fridays 18:00 ${SCHEDULE_TZ} (cron: "${CRON_EXPR}")`,
  );
  console.log(
    `[scheduler] Process TZ reported by Intl: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
  );
  console.log(
    `[scheduler] Current week label (${SCHEDULE_TZ}): ${getWeekLabel()}`,
  );
  console.log(
    "[scheduler] Waiting for next run. Use --run-now to trigger immediately.",
  );

  // Startup catch-up: run once if this week missed its window.
  const thisWeek = getWeekLabel();
  const lastRun = readLastRunWeek();
  if (lastRun !== thisWeek && isPastWeeklyDeadline()) {
    console.log(
      `[scheduler] Catch-up: last run was ${lastRun ?? "(never)"}, current week ${thisWeek} past Fri 18:00 — firing now.`,
    );
    runWeeklyPipeline().catch((err) => {
      console.error("[scheduler] Catch-up pipeline failed:", err);
    });
  }

  cron.schedule(
    CRON_EXPR,
    () => {
      console.log("[scheduler] Cron triggered");
      runWeeklyPipeline().catch((err) => {
        console.error("[scheduler] Pipeline failed:", err);
      });
    },
    {
      timezone: SCHEDULE_TZ,
    },
  );
}
