/**
 * compare-polygon-av.ts — one-off, read-only: does Polygon weekly data
 * reproduce the radar's signal-relevant quantities computed from AV bars?
 *
 * Compares, per ticker, on the last COMPLETE common week:
 *   1. close delta (AV close is split+dividend adjusted; Polygon split-only)
 *   2. midpoint (H+L)/2 delta — the AO input basis
 *   3. AO value + sign computed via the radar's own calculateIndicators()
 *   4. pricePercentile / nearLows / ranging via the scanner's exact math
 *
 * Uses data/radar.db (AV bars the last scan actually consumed) as ground
 * truth. ~5 Polygon calls at 13s spacing.
 */

import { readFileSync } from "node:fs";
import Database from "better-sqlite3";
import { calculateIndicators } from "../src/indicators.js";
import {
  fetchWeeklyFromPolygon,
  POLYGON_DELAY_MS,
} from "../src/fetch-polygon.js";
import type { WeeklyBar } from "../src/fetcher.js";

const TICKERS = ["PRU", "KDP", "DVN", "MSFT", "RXRX"]; // high-div … no-div

function loadPolygonKey(): void {
  if (process.env.POLYGON_API_KEY) return;
  const env = readFileSync("/root/claude/mission-control/.env", "utf8");
  const m = env.match(/^POLYGON_API_KEY=(.+)$/m);
  if (m) process.env.POLYGON_API_KEY = m[1].trim().replace(/^["']|["']$/g, "");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function avBars(db: Database.Database, ticker: string): WeeklyBar[] {
  return db
    .prepare(
      `SELECT date, open, high, low, close, volume FROM weekly_bars
       WHERE ticker = ? ORDER BY date ASC`,
    )
    .all(ticker) as WeeklyBar[];
}

/** Scanner's priceContext math, replicated verbatim (scanner.ts is frozen). */
function priceContext(bars: WeeklyBar[]) {
  const closes104 = bars.slice(-104).map((b) => b.close);
  const min104 = Math.min(...closes104);
  const max104 = Math.max(...closes104);
  const cur = closes104[closes104.length - 1];
  const range = max104 - min104;
  const pricePercentile = range === 0 ? 50 : ((cur - min104) / range) * 100;
  const closes12 = bars.slice(-12).map((b) => b.close);
  const min12 = Math.min(...closes12);
  const max12 = Math.max(...closes12);
  const avg12 = closes12.reduce((s, v) => s + v, 0) / closes12.length;
  return {
    pricePercentile: Math.round(pricePercentile),
    nearLows: pricePercentile <= 30,
    ranging: avg12 > 0 && (max12 - min12) / avg12 < 0.15,
  };
}

function lastAo(bars: WeeklyBar[]): { ao: number; ac: number } | null {
  const ind = calculateIndicators(
    bars.map((b) => ({
      date: b.date,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
      midpoint: (b.high + b.low) / 2,
    })),
  );
  if (ind.length === 0) return null;
  const last = ind[ind.length - 1] as unknown as { ao: number; ac: number };
  return { ao: last.ao, ac: last.ac };
}

function pct(x: number): string {
  return `${(x * 100).toFixed(2)}%`;
}

async function main(): Promise<void> {
  loadPolygonKey();
  const db = new Database("data/radar.db", { readonly: true });

  console.log(
    "ticker  common-thru  Δclose(last)  Δclose(-100w)  Δmid(last)  AOav       AOpoly     AOsign  pctl(av/poly)  nearLows  ranging",
  );
  for (const t of TICKERS) {
    const av = avBars(db, t);
    const poly = await fetchWeeklyFromPolygon(t);
    await sleep(POLYGON_DELAY_MS);

    // Align on common dates, trim both to the last COMPLETE common week.
    const avByDate = new Map(av.map((b) => [b.date, b]));
    const common = poly.filter((b) => avByDate.has(b.date));
    if (common.length < 40) {
      console.log(`${t.padEnd(7)} only ${common.length} common dates — SKIP`);
      continue;
    }
    const lastDate = common[common.length - 1].date;
    const avSeries = av.filter((b) => b.date <= lastDate);
    const polySeries = poly.filter((b) => b.date <= lastDate);

    const pLast = common[common.length - 1];
    const aLast = avByDate.get(lastDate)!;
    const dCloseLast = Math.abs(pLast.close - aLast.close) / aLast.close;
    const early = common[Math.max(0, common.length - 100)];
    const aEarly = avByDate.get(early.date)!;
    const dCloseEarly = Math.abs(early.close - aEarly.close) / aEarly.close;
    const dMidLast =
      Math.abs((pLast.high + pLast.low) / 2 - (aLast.high + aLast.low) / 2) /
      ((aLast.high + aLast.low) / 2);

    const aoAv = lastAo(avSeries);
    const aoPoly = lastAo(polySeries);
    const signMatch =
      aoAv && aoPoly ? Math.sign(aoAv.ao) === Math.sign(aoPoly.ao) : false;

    const ctxAv = priceContext(avSeries);
    const ctxPoly = priceContext(polySeries);

    console.log(
      `${t.padEnd(7)} ${lastDate}   ${pct(dCloseLast).padEnd(13)} ${pct(dCloseEarly).padEnd(14)} ${pct(dMidLast).padEnd(11)} ` +
        `${(aoAv?.ao ?? NaN).toFixed(3).padEnd(10)} ${(aoPoly?.ao ?? NaN).toFixed(3).padEnd(10)} ${signMatch ? "MATCH " : "DIFFER"}  ` +
        `${ctxAv.pricePercentile}/${ctxPoly.pricePercentile}          ${ctxAv.nearLows}/${ctxPoly.nearLows}  ${ctxAv.ranging}/${ctxPoly.ranging}`,
    );
  }
  db.close();
  console.log("\nDone (read-only).");
}

main().catch((err) => {
  console.error("COMPARE FAILED:", err);
  process.exit(1);
});
