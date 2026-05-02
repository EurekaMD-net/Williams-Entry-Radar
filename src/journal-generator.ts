/**
 * journal-generator.ts — Automated weekly Journal markdown generator
 *
 * Produces the complete Journal page for thewilliamsradar-journal repo.
 * ALL numeric data (prices, Δ%) is sourced EXCLUSIVELY from radar.db — never
 * from hardcoded values, prior session context, or AV live calls.
 *
 * Integration:
 *   - Called at step 10 of scheduler.ts (after signals.md push)
 *   - Output: <journal-repo>/pages/w{NN}-{YYYY}.md
 *   - The CMS (very-light-cms) publishes the file as-is via vlcms-ctl
 *
 * Data contract:
 *   Scorecard prices (entryRef, currClose) come from:
 *     SELECT close FROM weekly_bars WHERE ticker = ? AND date = ?
 *   "date" is the LAST trading day of each week in the DB (always a Thursday
 *   per AV weekly series). Never Friday. Never assumed.
 *
 * Env vars:
 *   JOURNAL_REPO_PATH  — absolute path to thewilliamsradar-journal repo
 *                        (default: /root/claude/thewilliamsradar-journal)
 *   RADAR_DB_PATH      — override SQLite path (default: ./data/radar.db)
 */

import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { ScanResult } from "./scanner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DB_PATH =
  process.env.RADAR_DB_PATH ??
  path.join(__dirname, "../data/radar.db");

const JOURNAL_REPO_PATH =
  process.env.JOURNAL_REPO_PATH ??
  "/root/claude/thewilliamsradar-journal";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScorecardEntry {
  ticker: string;
  signal: string;
  entryRef: number;       // prev-week Thursday close (source of truth: radar.db)
  currClose: number;      // curr-week Thursday close (source of truth: radar.db)
  deltaPct: number;
  result: "✓" | "✗" | "—";
  notes: string;
}

export interface JournalData {
  weekLabel: string;
  weekNum: number;
  year: number;
  prevWeekLabel: string;
  prevWeekNum: number;
  runDate: string;        // last trading day in DB (the Thursday AV closes on)
  prevBarDate: string;    // prev-week Thursday
  totalScanned: number;
  scorecard: ScorecardEntry[];
  catAThisWeek: ScanResult[];
  s2Pure: ScanResult[];
  s2Degraded: ScanResult[];
  s1: ScanResult[];
  preRadar: ScanResult[];
  spyDelta: number | null;
}

// ---------------------------------------------------------------------------
// DB helpers — all reads from radar.db, no exceptions
// ---------------------------------------------------------------------------

function getLastBarDate(db: Database.Database, ticker: string): string | null {
  const row = db
    .prepare("SELECT MAX(date) as d FROM weekly_bars WHERE ticker = ?")
    .get(ticker) as { d: string | null };
  return row?.d ?? null;
}

function getPrevBarDate(db: Database.Database, ticker: string): string | null {
  const rows = db
    .prepare(
      "SELECT date FROM weekly_bars WHERE ticker = ? ORDER BY date DESC LIMIT 2"
    )
    .all(ticker) as { date: string }[];
  return rows.length >= 2 ? rows[1].date : null;
}

function getClose(
  db: Database.Database,
  ticker: string,
  date: string
): number | null {
  const row = db
    .prepare("SELECT close FROM weekly_bars WHERE ticker = ? AND date = ?")
    .get(ticker, date) as { close: number } | undefined;
  return row?.close ?? null;
}

// ---------------------------------------------------------------------------
// Scorecard builder — reads prev-week Journal to find Category A candidates
// ---------------------------------------------------------------------------

function readPrevCandidates(
  prevWeekLabel: string
): { ticker: string; signal: string }[] {
  const [yr, wPart] = prevWeekLabel.split("-W");
  const wNum = parseInt(wPart, 10);
  const slug = `w${wNum}-${yr}`;
  const mdPath = path.join(JOURNAL_REPO_PATH, "pages", `${slug}.md`);

  if (!fs.existsSync(mdPath)) {
    console.warn(`[journal-gen] Previous week file not found: ${mdPath}`);
    return [];
  }

  const content = fs.readFileSync(mdPath, "utf-8");

  // Match the Category A table — find the section and extract rows
  const catAMatch = content.match(
    /## W\d+ Candidates[^\n]*Category A[\s\S]*?\n((?:\|[^\n]+\n)+)/
  );
  if (!catAMatch) {
    console.warn(`[journal-gen] Could not find Category A table in ${mdPath}`);
    return [];
  }

  const rows: { ticker: string; signal: string }[] = [];
  for (const line of catAMatch[1].split("\n")) {
    if (!line.startsWith("|") || line.includes("---") || line.includes("Ticker")) continue;
    const cols = line.split("|").map((c) => c.trim()).filter(Boolean);
    if (cols.length >= 2) {
      const ticker = cols[0].replace(/[^A-Z]/g, "");
      const signal = cols[1].replace(/[^A-Z0-9]/g, "");
      if (ticker.length >= 2 && signal.length >= 2) {
        rows.push({ ticker, signal });
      }
    }
  }

  return rows;
}

function scorecardResult(
  ticker: string,
  prevSignal: string,
  currentResults: ScanResult[]
): { result: ScorecardEntry["result"]; notes: string } {
  const current = currentResults.find((r) => r.ticker === ticker);

  if (!current || current.signalLevel === "none") {
    return { result: "✗", notes: "Signal lost. AC flipped positive." };
  }

  const curr = current.signalLevel;

  if (prevSignal === "S1" && (curr === "S2" || curr === "S2D")) {
    return { result: "✓", notes: `Escalated to ${curr}. p${current.pricePercentile}%.` };
  }

  const nearStr = current.nearLows ? " At structural lows." : "";
  return { result: "—", notes: `Still ${curr}, p${current.pricePercentile}%.${nearStr} Holding.` };
}

// ---------------------------------------------------------------------------
// Main data builder
// ---------------------------------------------------------------------------

export function buildJournalData(
  weekLabel: string,
  results: ScanResult[],
  totalScanned: number
): JournalData {
  const db = new Database(DB_PATH, { readonly: true });

  try {
    const [yr, wPart] = weekLabel.split("-W");
    const weekNum = parseInt(wPart, 10);
    const year = parseInt(yr, 10);
    const prevWeekNum = weekNum > 1 ? weekNum - 1 : 52;
    const prevYear = weekNum > 1 ? year : year - 1;
    const prevWeekLabel = `${prevYear}-W${String(prevWeekNum).padStart(2, "0")}`;

    // Source of truth for dates: the DB itself.
    // Use the global MAX(date) across all tickers — SPY is sometimes stale
    // because its TTL was still valid from the prior week's fetch, so
    // getLastBarDate(SPY) can lag behind the rest of the universe.
    const globalMaxRow = db
      .prepare("SELECT MAX(date) as d FROM weekly_bars")
      .get() as { d: string | null };
    const runDate = globalMaxRow?.d ?? new Date().toISOString().slice(0, 10);

    // Previous trading week: the second-most-recent distinct date in the DB.
    // Also global — not per-ticker — for the same reason.
    const distinctDates = db
      .prepare("SELECT DISTINCT date FROM weekly_bars ORDER BY date DESC LIMIT 2")
      .all() as { date: string }[];
    const prevBarDate = distinctDates.length >= 2 ? distinctDates[1].date : "";

    // SPY delta from DB
    let spyDelta: number | null = null;
    if (prevBarDate) {
      const spyPrev = getClose(db, "SPY", prevBarDate);
      const spyCurr = getClose(db, "SPY", runDate);
      if (spyPrev && spyCurr) {
        spyDelta = ((spyCurr - spyPrev) / spyPrev) * 100;
      }
    }

    // Build scorecard from prev-week candidates
    const prevCandidates = readPrevCandidates(prevWeekLabel);
    const scorecard: ScorecardEntry[] = [];

    for (const { ticker, signal } of prevCandidates) {
      const tickerPrevDate = getPrevBarDate(db, ticker) ?? prevBarDate;
      const tickerCurrDate = getLastBarDate(db, ticker) ?? runDate;

      if (!tickerPrevDate || !tickerCurrDate) {
        console.warn(`[journal-gen] No bar dates for ${ticker} — skipping`);
        continue;
      }

      const entryRef = getClose(db, ticker, tickerPrevDate);
      const currClose = getClose(db, ticker, tickerCurrDate);

      if (entryRef === null || currClose === null) {
        console.warn(
          `[journal-gen] Missing closes for ${ticker} (prev=${tickerPrevDate}, curr=${tickerCurrDate}) — skipping`
        );
        continue;
      }

      const deltaPct = ((currClose - entryRef) / entryRef) * 100;
      const { result, notes } = scorecardResult(ticker, signal, results);

      scorecard.push({ ticker, signal, entryRef, currClose, deltaPct, result, notes });
    }

    const s2Pure = results.filter((r) => r.signalLevel === "S2");
    const s2Degraded = results.filter((r) => r.signalLevel === "S2D");
    const s1 = results.filter((r) => r.signalLevel === "S1");

    const catAThisWeek = [...s2Pure, ...s2Degraded, ...s1].sort(
      (a, b) => a.pricePercentile - b.pricePercentile
    );

    const preRadar = results.filter(
      (r) => r.signalLevel === "none" && r.pricePercentile <= 15
    );

    db.close();

    return {
      weekLabel, weekNum, year, prevWeekLabel, prevWeekNum,
      runDate, prevBarDate, totalScanned,
      scorecard, catAThisWeek, s2Pure, s2Degraded, s1, preRadar, spyDelta,
    };
  } catch (err) {
    db.close();
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Markdown renderer
// ---------------------------------------------------------------------------

function fmtPct(n: number, sign = true): string {
  const s = n.toFixed(1) + "%";
  return sign && n >= 0 ? "+" + s : s;
}

function fmtPrice(n: number): string {
  return "$" + n.toFixed(2);
}

function renderScorecard(data: JournalData): string {
  const { prevWeekNum, prevBarDate, weekNum, runDate, scorecard, spyDelta } = data;
  const lines: string[] = [];

  lines.push(`## W${prevWeekNum} Scorecard`);
  lines.push("");
  lines.push("> 🔴 MODEL OUTPUT — Published candidates from last week. No edits. No omissions.");
  lines.push("");
  lines.push(
    `Performance of all Category A candidates named in W${prevWeekNum}. ` +
    `Prices measured from the Thursday close of W${prevWeekNum} (${prevBarDate}) ` +
    `to the Thursday close of W${weekNum} (${runDate}). ` +
    `Alpha Vantage weekly bars — last bar of the trading week.`
  );
  lines.push("");

  if (scorecard.length === 0) {
    lines.push("*No Category A candidates were named in the previous week.*");
  } else {
    lines.push(`| Ticker | Signal (W${prevWeekNum}) | Entry Reference | W${weekNum} Close | Δ% | Result | Notes |`);
    lines.push("|--------|---------|-----------------|---------|-----|--------|-------|");
    for (const e of scorecard) {
      lines.push(
        `| ${e.ticker} | ${e.signal} | ${fmtPrice(e.entryRef)} | ${fmtPrice(e.currClose)} | ${fmtPct(e.deltaPct)} | ${e.result} | ${e.notes} |`
      );
    }
    lines.push("");

    const escalated = scorecard.filter((e) => e.result === "✓").length;
    const lost = scorecard.filter((e) => e.result === "✗").length;
    const holding = scorecard.filter((e) => e.result === "—").length;
    const positives = scorecard.filter((e) => e.deltaPct > 0).length;
    const avgDelta = scorecard.reduce((s, e) => s + e.deltaPct, 0) / scorecard.length;
    const spyStr = spyDelta !== null ? `SPY W${prevWeekNum}→W${weekNum}: ${fmtPct(spyDelta)}` : "SPY: —";

    lines.push(
      `*Result key: ✓ escalation · ✗ signal lost · — holding/no position. ` +
      `Entry Reference = Thursday close of W${prevWeekNum} (${prevBarDate}). ` +
      `W${weekNum} Close = Thursday ${runDate}. Source: radar.db weekly_bars.*`
    );
    lines.push("");
    lines.push(
      `**Scorecard summary:** ${escalated} escalated · ${lost} lost signal · ${holding} holding · ` +
      `${positives} of ${scorecard.length} positive · Avg Δ: ${fmtPct(avgDelta)} · ${spyStr}`
    );
  }

  return lines.join("\n");
}

function renderCatA(data: JournalData): string {
  const { weekNum, catAThisWeek } = data;
  const lines: string[] = [];

  lines.push(`## W${weekNum} Candidates — Category A`);
  lines.push("");
  lines.push("> 🔴 MODEL OUTPUT — Algorithm-generated. Not editorial picks.");
  lines.push("");
  lines.push(
    `The ${catAThisWeek.length} tickers the model flagged as priority for W${weekNum + 1} monitoring. ` +
    `Ordered by price percentile (lower = more depressed relative to 52-week range).`
  );
  lines.push("");

  if (catAThisWeek.length === 0) {
    lines.push("*No active signals this week.*");
  } else {
    lines.push("| Ticker | Signal | Percentile | Sector | Note |");
    lines.push("|--------|--------|------------|--------|------|");
    for (const r of catAThisWeek) {
      const flags: string[] = [];
      if (r.nearLows) flags.push("near lows");
      if (r.ranging) flags.push("ranging");
      lines.push(
        `| ${r.ticker} | ${r.signalLevel} | p${r.pricePercentile}% | ${r.sector} | ${flags.join(", ")} |`
      );
    }
  }

  lines.push("");
  lines.push(`Decision week: W${weekNum + 1}.`);

  return lines.join("\n");
}

function renderSignals(data: JournalData): string {
  const { weekNum, s2Pure, s2Degraded, runDate } = data;
  const lines: string[] = [];

  lines.push(`## S2 Signals — Week ${weekNum}`);
  lines.push("");
  lines.push("> 🔴 MODEL OUTPUT");
  lines.push("");

  lines.push("### Pure S2 — Full Confirmation");
  lines.push("");
  if (s2Pure.length === 0) {
    lines.push("None this week.");
  } else {
    lines.push("| Ticker | Sector | Percentile | Confirmation date | Entry consideration |");
    lines.push("|--------|--------|------------|------------------|---------------------|");
    for (const r of s2Pure) {
      lines.push(
        `| ${r.ticker} | ${r.sector} | p${r.pricePercentile}% | ${r.signalDate ?? runDate} | Review with broader context |`
      );
    }
  }

  lines.push("");
  lines.push(`### S2 Degraded — ${s2Degraded.length} Ticker${s2Degraded.length !== 1 ? "s" : ""}`);
  lines.push("");
  if (s2Degraded.length === 0) {
    lines.push("None this week.");
  } else {
    lines.push("| Ticker | Sector | Percentile | Status note |");
    lines.push("|--------|--------|------------|-------------|");
    for (const r of s2Degraded) {
      lines.push(
        `| ${r.ticker} | ${r.sector} | p${r.pricePercentile}% | AC crossed; AO already recovering |`
      );
    }
  }

  return lines.join("\n");
}

function renderPreRadar(data: JournalData): string {
  const { preRadar, weekNum } = data;
  const lines: string[] = [];

  lines.push("## Pre-Radar — Approaching the Signal");
  lines.push("");
  lines.push("> 🔴 MODEL OUTPUT");
  lines.push("");
  lines.push(
    `${preRadar.length} tickers at structural lows (≤p15) with no active signal yet. ` +
    `Names to watch heading into W${weekNum + 1}.`
  );
  lines.push("");

  if (preRadar.length === 0) {
    lines.push("*None this week.*");
  } else {
    lines.push("| Ticker | Percentile | Sector |");
    lines.push("|--------|------------|--------|");
    for (const r of preRadar) {
      lines.push(`| ${r.ticker} | p${r.pricePercentile}% | ${r.sector} |`);
    }
  }

  return lines.join("\n");
}

function renderUniverse(data: JournalData): string {
  const { totalScanned, s1, s2Pure, s2Degraded } = data;
  const nearLowsCount = [...s2Pure, ...s2Degraded, ...s1].filter((r) => r.nearLows).length;

  return [
    "## The Universe",
    "",
    `**${totalScanned} tickers · 13 sectors**`,
    "Sectors covered: XLU, XLI, XLP, XLE, XLF, XLV, XLB, XLY, XLK, XLC, XLRE, IBB, XBI",
    "Market reference: SPY",
    "",
    "**Active signals by type:**",
    "",
    `- S1 active: ${s1.length}`,
    `- S2 degraded: ${s2Degraded.length}`,
    `- S2 pure: ${s2Pure.length}`,
    `- Tickers at structural lows (≤p15): ${nearLowsCount}`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Full page renderer
// ---------------------------------------------------------------------------

export function renderJournalPage(data: JournalData): string {
  const { weekNum, year, s2Pure, s2Degraded, s1, runDate, totalScanned, prevWeekNum } = data;
  const totalSignals = s2Pure.length + s2Degraded.length + s1.length;
  const sectorSet = new Set([...s2Pure, ...s2Degraded, ...s1].map((r) => r.sector));

  // Edition number = weekNum - 16 (Journal started at W17 = Edition 1)
  const editionNum = weekNum - 16;

  const frontmatter = [
    "---",
    `title: "Williams AO/AC Signals W${weekNum} ${year} — ${totalSignals} Signals Across ${sectorSet.size} Sectors"`,
    `slug: "w${weekNum}-${year}"`,
    `description: "W${weekNum} ${year}: ${totalSignals} AO/AC signals across ${totalScanned} tickers. Source: radar.db. Auto-generated."`,
    "draft: false",
    "---",
    "",
  ].join("\n");

  const header = [
    `**Edition ${editionNum} · ${runDate}**`,
    "",
    "---",
    "",
  ].join("\n");

  const portfolioSection = [
    "## Portfolio Tracker",
    "",
    "> 🟢 LIVE POSITIONS — Actual entries with real or paper capital. Updated every week.",
    "",
    "| Ticker | Entry W# | Entry Px | Current Px | Δ% | Status | Stop / Target |",
    "|--------|----------|----------|------------|-----|--------|---------------|",
    "| —      | —        | —        | —          | —   | No open positions | — |",
    "",
    "*Mode: Paper*",
  ].join("\n");

  const numberSection = [
    "## The Number of the Week",
    "",
    "> 🔴 MODEL OUTPUT",
    "",
    `**${totalSignals} active signals across ${totalScanned} tickers analyzed — ${((totalSignals / totalScanned) * 100).toFixed(1)}% of the universe.**`,
    "",
    "_[Editorial commentary to be added by analyst]_",
  ].join("\n");

  const followUpRows = data.scorecard.map((e) => {
    const current = [...s2Pure, ...s2Degraded, ...s1].find((r) => r.ticker === e.ticker);
    const currStatus = current ? current.signalLevel : "Dropped";
    return `| ${e.ticker} | ${e.signal} | ${currStatus} | ${e.notes} |`;
  });

  const followUpSection = [
    `## Follow-Up — W${prevWeekNum} Key Names`,
    "",
    "> 🔴 MODEL OUTPUT",
    "",
    `| Ticker | W${prevWeekNum} Status | W${weekNum} Status | What changed |`,
    `|--------|---------|---------|--------------|`,
    ...followUpRows,
  ].join("\n");

  const tickerSection = [
    "## The Ticker of the Week — Deep Dive",
    "",
    "> 🟡 ANALYST COMMENTARY — Editorial interpretation. Not model output.",
    "",
    "_[To be completed by analyst]_",
  ].join("\n");

  const managerSection = [
    `## Manager Note — W${weekNum}`,
    "",
    "> 🟡 ANALYST COMMENTARY — Portfolio manager's macro read. Not model output.",
    "",
    "_[To be completed by analyst]_",
    "",
    `*Published: ${runDate}*`,
  ].join("\n");

  return [
    frontmatter,
    header,
    renderScorecard(data),
    "",
    "---",
    "",
    portfolioSection,
    "",
    "---",
    "",
    numberSection,
    "",
    "---",
    "",
    followUpSection,
    "",
    "---",
    "",
    renderCatA(data),
    "",
    "---",
    "",
    renderSignals(data),
    "",
    "---",
    "",
    renderPreRadar(data),
    "",
    "---",
    "",
    renderUniverse(data),
    "",
    "---",
    "",
    tickerSection,
    "",
    "---",
    "",
    managerSection,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Public API — called by scheduler.ts
// ---------------------------------------------------------------------------

/**
 * Generate and write the Journal page for the given week.
 * Returns the output file path.
 * Safe to call multiple times — overwrites in-place.
 */
export function generateJournalPage(
  weekLabel: string,
  results: ScanResult[],
  totalScanned: number
): string {
  const data = buildJournalData(weekLabel, results, totalScanned);
  const markdown = renderJournalPage(data);

  const [yr, wPart] = weekLabel.split("-W");
  const wNum = parseInt(wPart, 10);
  const slug = `w${wNum}-${yr}`;
  const outPath = path.join(JOURNAL_REPO_PATH, "pages", `${slug}.md`);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, markdown, "utf-8");

  console.log(`[journal-gen] Written: ${outPath}`);
  console.log(
    `[journal-gen] Scorecard: ${data.scorecard.length} entries | ` +
    `Signals: S2=${data.s2Pure.length} S2D=${data.s2Degraded.length} S1=${data.s1.length}`
  );

  return outPath;
}
