/**
 * compare-s1-s2.ts — Comparison report: S1 vs S2 signal quality
 *
 * Reads phase2_scorecard.csv (S1) and s2_scorecard.csv (S2) and
 * produces a side-by-side comparison per ticker and per sector.
 */

import { readFileSync, existsSync } from "fs";

const RESULTS_DIR = "/tmp/williams-entry-radar/results";

interface ScorecardRow {
  ticker: string;
  sector: string;
  sectorName: string;
  totalSignals: number;
  hitRate8W: number;
  avgReturn8W: number;
  avgMaxDD: number;
  avgAoLag: number;
  score: number;
}

// S1 scorecard uses different column names + pct values (e.g. 72.7 not 0.727)
// S2 scorecard uses decimal values (e.g. 0.727)
function parseCsvS1(path: string): ScorecardRow[] {
  if (!existsSync(path)) { console.error(`File not found: ${path}`); return []; }
  const lines = readFileSync(path, "utf-8").trim().split("\n");
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const vals = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = vals[i] ?? "0"));
    // S1 columns: rank,ticker,sector,signals,hitRate8W,avgRet4W,avgRet8W,avgRet12W,avgMaxDD,avgAoLag,...
    // Values are in percentage (72.7 = 72.7%), convert to decimals
    return {
      ticker: row["ticker"],
      sector: row["sector"],
      sectorName: row["sector"], // S1 has no sectorName column
      totalSignals: parseInt(row["signals"]),
      hitRate8W: parseFloat(row["hitRate8W"]) / 100,
      avgReturn8W: parseFloat(row["avgRet8W"]) / 100,
      avgMaxDD: parseFloat(row["avgMaxDD"]) / 100,
      avgAoLag: parseFloat(row["avgAoLag"]),
      score: parseFloat(row["score"]),
    };
  });
}

function parseCsvS2(path: string): ScorecardRow[] {
  if (!existsSync(path)) { console.error(`File not found: ${path}`); return []; }
  const lines = readFileSync(path, "utf-8").trim().split("\n");
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const vals = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = vals[i] ?? "0"));
    // S2 columns: ticker,sector,sectorName,totalSignals,hitRate8W,... (decimal values)
    return {
      ticker: row["ticker"],
      sector: row["sector"],
      sectorName: row["sectorName"],
      totalSignals: parseInt(row["totalSignals"]),
      hitRate8W: parseFloat(row["hitRate8W"]),
      avgReturn8W: parseFloat(row["avgReturn8W"]),
      avgMaxDD: parseFloat(row["avgMaxDD"]),
      avgAoLag: parseFloat(row["avgAoLag"]),
      score: parseFloat(row["score"]),
    };
  });
}

function pct(n: number): string {
  return (n * 100).toFixed(1) + "%";
}

function diff(a: number, b: number, invert = false): string {
  const d = b - a;
  const sign = d > 0 ? "+" : "";
  const better = invert ? d < 0 : d > 0;
  return `${sign}${(d * 100).toFixed(1)}% ${better ? "▲" : "▼"}`;
}

async function main() {
  const s1 = parseCsvS1(`${RESULTS_DIR}/phase2_scorecard.csv`);
  const s2 = parseCsvS2(`${RESULTS_DIR}/s2_scorecard.csv`);

  if (s1.length === 0 || s2.length === 0) {
    console.error("One or both scorecard files missing. Run backtests first.");
    process.exit(1);
  }

  const s1Map = new Map(s1.map((r) => [r.ticker, r]));
  const s2Map = new Map(s2.map((r) => [r.ticker, r]));

  // All tickers that appear in both
  const common = s1.filter((r) => s2Map.has(r.ticker));
  const s2Only = s2.filter((r) => !s1Map.has(r.ticker));
  const s1Only = s1.filter((r) => !s2Map.has(r.ticker));

  console.log("\n=== S1 vs S2: SIGNAL COUNT IMPACT ===");
  const totalS1 = s1.reduce((s, r) => s + r.totalSignals, 0);
  const totalS2 = s2.reduce((s, r) => s + r.totalSignals, 0);
  const reduction = (1 - totalS2 / totalS1) * 100;
  console.log(`S1 total signals: ${totalS1}`);
  console.log(`S2 total signals: ${totalS2}`);
  console.log(`Signal reduction: -${reduction.toFixed(1)}% (expected: S2 is more selective)`);
  console.log(`Tickers with S2 signals: ${s2.length} (S1 had: ${s1.length})`);

  console.log("\n=== S1 vs S2: OVERALL QUALITY COMPARISON ===");
  const s1HR = common.reduce((s, r) => s + r.hitRate8W * r.totalSignals, 0) /
    common.reduce((s, r) => s + r.totalSignals, 0);
  const s2HR = common
    .map((r) => s2Map.get(r.ticker)!)
    .reduce((s, r) => s + r.hitRate8W * r.totalSignals, 0) /
    common.map((r) => s2Map.get(r.ticker)!).reduce((s, r) => s + r.totalSignals, 0);

  const s1Ret = common.reduce((s, r) => s + r.avgReturn8W * r.totalSignals, 0) /
    common.reduce((s, r) => s + r.totalSignals, 0);
  const s2Ret = common
    .map((r) => s2Map.get(r.ticker)!)
    .reduce((s, r) => s + r.avgReturn8W * r.totalSignals, 0) /
    common.map((r) => s2Map.get(r.ticker)!).reduce((s, r) => s + r.totalSignals, 0);

  const s1DD = common.reduce((s, r) => s + r.avgMaxDD * r.totalSignals, 0) /
    common.reduce((s, r) => s + r.totalSignals, 0);
  const s2DD = common
    .map((r) => s2Map.get(r.ticker)!)
    .reduce((s, r) => s + r.avgMaxDD * r.totalSignals, 0) /
    common.map((r) => s2Map.get(r.ticker)!).reduce((s, r) => s + r.totalSignals, 0);

  const s1Lag = common.reduce((s, r) => s + r.avgAoLag * r.totalSignals, 0) /
    common.reduce((s, r) => s + r.totalSignals, 0);
  const s2Lag = common
    .map((r) => s2Map.get(r.ticker)!)
    .reduce((s, r) => s + r.avgAoLag * r.totalSignals, 0) /
    common.map((r) => s2Map.get(r.ticker)!).reduce((s, r) => s + r.totalSignals, 0);

  console.log(`Hit Rate 8W:    S1=${pct(s1HR)} → S2=${pct(s2HR)} (${diff(s1HR, s2HR)})`);
  console.log(`Avg Return 8W:  S1=${pct(s1Ret)} → S2=${pct(s2Ret)} (${diff(s1Ret, s2Ret)})`);
  console.log(`Avg Max DD:     S1=${pct(s1DD)} → S2=${pct(s2DD)} (${diff(s1DD, s2DD, true)})`);
  console.log(`Avg AO Lag:     S1=${s1Lag.toFixed(1)}W → S2=${s2Lag.toFixed(1)}W`);

  // Per-sector comparison
  const sectors = [...new Set(s1.map((r) => r.sector))];
  console.log("\n=== PER-SECTOR COMPARISON ===");
  console.log("Sector   | S1 Signals | S2 Signals | S1 HR   | S2 HR   | Δ HR    | S1 DD   | S2 DD   | Δ DD");
  console.log("---------+------------+------------+---------+---------+---------+---------+---------+--------");

  for (const sector of sectors) {
    const sec1 = s1.filter((r) => r.sector === sector);
    const sec2 = s2.filter((r) => r.sector === sector);
    if (sec1.length === 0) continue;

    const n1 = sec1.reduce((s, r) => s + r.totalSignals, 0);
    const n2 = sec2.reduce((s, r) => s + r.totalSignals, 0);
    const hr1 = sec1.reduce((s, r) => s + r.hitRate8W * r.totalSignals, 0) / Math.max(n1, 1);
    const hr2 = sec2.length > 0
      ? sec2.reduce((s, r) => s + r.hitRate8W * r.totalSignals, 0) / Math.max(n2, 1)
      : 0;
    const dd1 = sec1.reduce((s, r) => s + r.avgMaxDD * r.totalSignals, 0) / Math.max(n1, 1);
    const dd2 = sec2.length > 0
      ? sec2.reduce((s, r) => s + r.avgMaxDD * r.totalSignals, 0) / Math.max(n2, 1)
      : 0;

    const hrDelta = hr2 - hr1;
    const ddDelta = dd2 - dd1;
    console.log(
      `${sector.padEnd(8)} | ${String(n1).padStart(10)} | ${String(n2).padStart(10)} | ${pct(hr1).padStart(7)} | ${pct(hr2).padStart(7)} | ${(hrDelta >= 0 ? "+" : "") + pct(hrDelta).padStart(6)} | ${pct(dd1).padStart(7)} | ${pct(dd2).padStart(7)} | ${(ddDelta >= 0 ? "+" : "") + pct(ddDelta).padStart(6)}`
    );
  }

  // Top 15 comparison (tickers in both)
  console.log("\n=== TOP 15: S2 WINNERS (tickers where S2 > S1) ===");
  const deltas = common
    .map((r1) => {
      const r2 = s2Map.get(r1.ticker)!;
      return {
        ticker: r1.ticker,
        sector: r1.sector,
        s1Signals: r1.totalSignals,
        s2Signals: r2.totalSignals,
        s1HR: r1.hitRate8W,
        s2HR: r2.hitRate8W,
        deltaHR: r2.hitRate8W - r1.hitRate8W,
        s1DD: r1.avgMaxDD,
        s2DD: r2.avgMaxDD,
        deltaDD: r2.avgMaxDD - r1.avgMaxDD, // positive = less drawdown (better)
        s1Ret: r1.avgReturn8W,
        s2Ret: r2.avgReturn8W,
        deltaRet: r2.avgReturn8W - r1.avgReturn8W,
        netImprovement: (r2.hitRate8W - r1.hitRate8W) + (r2.avgMaxDD - r1.avgMaxDD) * 2,
      };
    })
    .sort((a, b) => b.netImprovement - a.netImprovement);

  deltas.slice(0, 15).forEach((d, i) => {
    console.log(
      `${i + 1}. ${d.ticker} (${d.sector}) | S1: ${d.s1Signals}sig/${pct(d.s1HR)} HR/${pct(d.s1DD)} DD → S2: ${d.s2Signals}sig/${pct(d.s2HR)} HR/${pct(d.s2DD)} DD`
    );
  });

  console.log("\n=== TICKERS WHERE S2 SIGNALS VANISH (S1 had signals, S2 has none) ===");
  s1Only.slice(0, 10).forEach((r) => {
    console.log(`  ${r.ticker} (${r.sector}): had ${r.totalSignals} S1 signals — S2 bar is too high`);
  });

  console.log("\n=== VERDICT ===");
  const hrImproved = s2HR > s1HR;
  const ddImproved = s2DD > s1DD; // less negative = better
  const retImproved = s2Ret > s1Ret;

  console.log(`Hit Rate improved: ${hrImproved ? "YES ▲" : "NO ▼"} (${pct(s1HR)} → ${pct(s2HR)})`);
  console.log(`Drawdown improved: ${ddImproved ? "YES ▲" : "NO ▼"} (${pct(s1DD)} → ${pct(s2DD)})`);
  console.log(`Return improved:   ${retImproved ? "YES ▲" : "NO ▼"} (${pct(s1Ret)} → ${pct(s2Ret)})`);

  const tradeoff = !hrImproved || !ddImproved
    ? "MIXED — S2 is more selective but quality gain is partial"
    : "CLEAR WIN — S2 delivers higher quality at the cost of fewer signals";
  console.log(`\nConclusion: ${tradeoff}`);
}

main().catch(console.error);
