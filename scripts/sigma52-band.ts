/**
 * σ52 band — a per-signal 4-week 80% price band from a 52-week realised σ.
 *
 * One-shot, READ-ONLY, prints markdown to stdout. NOT wired into the scheduler
 * (nothing under src/ is touched; no files written; no Journal/Telegram).
 * Born from the TimesFM Fase 1 re-test (results/tfm-backtest/2026-08-16-sigma52):
 * this band matches TimesFM's band accuracy at zero model cost.
 *
 *   npx tsx scripts/sigma52-band.ts --week 2026-W33 [--db data/radar.db]
 *                                    [--sigma-weeks 52] [--horizon 4] [--csv results/radar_<week>.csv]
 *
 * Bars are taken as of the ISO week's Friday (`--week` → last bar dated ≤ that Friday),
 * so re-running an old week reproduces that week's band, not today's.
 * Exit 0 = printed; 3 = signals CSV missing; 2 = bad args; 1 = DB unreadable/other error.
 * Not a signal, not a filter: the band is a calibrated random-walk envelope
 * (coverage ≈ 81% on 2,821 backtested signal-weeks, measured on the split-basis
 * backtest copy — production radar.db still carries the AV↔Polygon basis seam
 * of 2024-07-19, outside any 53-bar window since mid-2025) — it says how far a
 * name usually moves in 4 weeks, nothing about direction.
 */
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");
export const Z80 = 1.2816;
const LEVEL_ORDER: Record<string, number> = { S2: 0, S2D: 1, S1: 2 };

export interface BandRow {
  ticker: string;
  level: string;
  asOf: string;
  close: number;
  sigmaW: number; // weekly σ of log returns
  lo: number; // price = close·exp(−Z80·σ·√h)
  hi: number;
}

/** σ over the last `sigmaWeeks` weekly log returns (ddof=1); null if too few bars. */
export function sigmaBand(closes: number[], sigmaWeeks: number, horizon: number, minReturns = 40): { sigmaW: number; lo: number; hi: number } | null {
  const c = closes.filter((x) => Number.isFinite(x) && x > 0).slice(-(sigmaWeeks + 1));
  if (c.length < 2) return null;
  const rets: number[] = [];
  for (let i = 1; i < c.length; i++) rets.push(Math.log(c[i] / c[i - 1]));
  if (rets.length < minReturns) return null;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const varS = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
  const sigmaW = Math.sqrt(varS);
  const band = Z80 * sigmaW * Math.sqrt(horizon);
  const last = c[c.length - 1];
  return { sigmaW, lo: last * Math.exp(-band), hi: last * Math.exp(band) };
}

/** S2 → S2D → S1, then ticker. Unknown levels sort last. */
export function sortRows<T extends { level: string; ticker: string }>(rows: T[]): T[] {
  const rank = (l: string) => (Object.hasOwn(LEVEL_ORDER, l) ? LEVEL_ORDER[l] : 9);
  return [...rows].sort((a, b) => rank(a.level) - rank(b.level) || a.ticker.localeCompare(b.ticker));
}

/** ISO week (YYYY-Www) → its Friday as YYYY-MM-DD (ISO week 1 contains Jan 4). */
export function isoWeekFriday(week: string): string {
  const m = /^(\d{4})-W(\d{2})$/.exec(week);
  if (!m) throw new Error(`bad ISO week: ${week}`);
  const year = Number(m[1]);
  const w = Number(m[2]);
  if (w < 1 || w > 53) throw new Error(`bad ISO week: ${week}`);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dow = jan4.getUTCDay() || 7; // Mon=1 … Sun=7
  const monday = new Date(jan4.getTime() - (dow - 1) * 86400000 + (w - 1) * 7 * 86400000);
  const friday = new Date(monday.getTime() + 4 * 86400000);
  return friday.toISOString().slice(0, 10);
}

/** Parse the radar_<week>.csv → [{ticker, level}] for S1/S2D/S2 rows only. */
export function parseSignals(csv: string): { ticker: string; level: string }[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].split(",");
  const iT = header.indexOf("ticker");
  const iL = header.indexOf("signalLevel");
  if (iT < 0 || iL < 0) throw new Error("csv missing ticker/signalLevel columns");
  return lines
    .slice(1)
    .map((l) => l.split(","))
    .filter((f) => Object.hasOwn(LEVEL_ORDER, f[iL]))
    .map((f) => ({ ticker: f[iT], level: f[iL] }));
}

export function renderMarkdown(week: string, sigmaWeeks: number, horizon: number, rows: BandRow[], missing: string[]): string {
  const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
  const out = [
    `# σ${sigmaWeeks} band — ${week} · h=${horizon}w · 80% band = close × exp(∓${Z80}·σ${sigmaWeeks}·√${horizon})`,
    "",
    "Annotation only — a calibrated random-walk envelope (≈81% coverage in backtest). Not a signal, not a filter, says nothing about direction.",
    "",
    `| level | ticker | as of | close | σ${sigmaWeeks} (weekly) | band | low | high |`,
    "|---|---|---|---:|---:|---|---:|---:|",
  ];
  for (const r of sortRows(rows)) {
    out.push(`| ${r.level} | ${r.ticker} | ${r.asOf} | ${r.close.toFixed(2)} | ${pct(r.sigmaW)} | −${pct(1 - r.lo / r.close)} / +${pct(r.hi / r.close - 1)} | ${r.lo.toFixed(2)} | ${r.hi.toFixed(2)} |`);
  }
  if (missing.length) out.push("", `Not computed (fewer than 40 weekly returns in the DB as of the week's Friday): ${missing.join(", ")}`);
  return out.join("\n") + "\n";
}

function arg(name: string, dflt?: string): string | undefined {
  const i = process.argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i < 0) return dflt;
  const a = process.argv[i];
  return a.includes("=") ? a.slice(a.indexOf("=") + 1) : process.argv[i + 1];
}

function main(): number {
  const week = arg("week");
  if (!week || !/^\d{4}-W\d{2}$/.test(week)) {
    console.error("usage: sigma52-band.ts --week YYYY-Www [--db data/radar.db] [--sigma-weeks 52] [--horizon 4] [--csv <path>]");
    return 2;
  }
  const sigmaWeeks = Number(arg("sigma-weeks", "52"));
  const horizon = Number(arg("horizon", "4"));
  if (!Number.isInteger(sigmaWeeks) || sigmaWeeks <= 0 || !Number.isInteger(horizon) || horizon <= 0) {
    console.error("--sigma-weeks and --horizon must be positive integers");
    return 2;
  }
  const asOfMax = isoWeekFriday(week);
  const csvPath = path.resolve(REPO, arg("csv", `results/radar_${week}.csv`)!);
  const dbPath = path.resolve(REPO, arg("db", "data/radar.db")!);
  if (!fs.existsSync(csvPath)) {
    console.error(`signals CSV not found: ${csvPath}`);
    return 3;
  }
  const signals = parseSignals(fs.readFileSync(csvPath, "utf8"));
  const db = new Database(dbPath, { readonly: true });
  const rows: BandRow[] = [];
  const missing: string[] = [];
  try {
    const q = db.prepare("SELECT date, close FROM weekly_bars WHERE ticker = ? AND date <= ? ORDER BY date");
    for (const s of signals) {
      const bars = q.all(s.ticker, asOfMax) as { date: string; close: number }[];
      const b = sigmaBand(bars.map((x) => x.close), sigmaWeeks, horizon);
      if (!b || bars.length === 0) {
        missing.push(s.ticker);
        continue;
      }
      const last = bars[bars.length - 1];
      rows.push({ ticker: s.ticker, level: s.level, asOf: last.date, close: last.close, ...b });
    }
  } finally {
    db.close();
  }
  process.stdout.write(renderMarkdown(week, sigmaWeeks, horizon, rows, missing));
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
