/**
 * test-data-sources.ts — one-off evaluation harness for the two candidate
 * AV replacements (fetch-polygon.ts, fetch-stooq.ts). READ-ONLY: touches no
 * cache/DB state, only prints a report.
 *
 * Run: npx tsx scripts/test-data-sources.ts
 *
 * - Stooq: FULL universe coverage sweep (coverage on microcaps is its risk).
 * - Polygon: 15-ticker sample (5/min free tier — mechanics + data check).
 * - Cross-validation: last common Friday close, polygon vs stooq vs the
 *   AV-era cache where present. Both candidates and AV serve split-adjusted
 *   closes, so deltas should be small (dividend-adjustment differences can
 *   produce sub-percent drift on older bars; the latest bar should agree).
 *
 * POLYGON_API_KEY is taken from the environment, else parsed in-process
 * from mission-control's .env (never printed).
 */

import { readFileSync } from "node:fs";
import { getUniverseTickers, SPY_MACRO_REF } from "../src/universe.js";
import {
  fetchWeeklyFromPolygon,
  POLYGON_DELAY_MS,
} from "../src/fetch-polygon.js";
import { fetchWeeklyFromStooq, STOOQ_DELAY_MS } from "../src/fetch-stooq.js";
import { isCacheValid, readCache } from "../src/cache.js";
import type { WeeklyBar } from "../src/fetcher.js";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function loadPolygonKey(): void {
  if (process.env.POLYGON_API_KEY) return;
  try {
    const env = readFileSync("/root/claude/mission-control/.env", "utf8");
    const m = env.match(/^POLYGON_API_KEY=(.+)$/m);
    if (m)
      process.env.POLYGON_API_KEY = m[1].trim().replace(/^["']|["']$/g, "");
  } catch {
    /* fall through — fetch will throw a clear error */
  }
}

interface SourceResult {
  ok: boolean;
  bars?: WeeklyBar[];
  error?: string;
}

function lastBar(bars: WeeklyBar[]): WeeklyBar {
  return bars[bars.length - 1];
}

/** Close for the newest date both series share. */
function commonClose(
  a: WeeklyBar[],
  b: WeeklyBar[],
): { date: string; a: number; b: number } | null {
  const bByDate = new Map(b.map((bar) => [bar.date, bar.close]));
  for (let i = a.length - 1; i >= 0; i--) {
    const hit = bByDate.get(a[i].date);
    if (hit !== undefined) return { date: a[i].date, a: a[i].close, b: hit };
  }
  return null;
}

function pct(x: number): string {
  return `${(x * 100).toFixed(2)}%`;
}

async function main(): Promise<void> {
  loadPolygonKey();
  const universe = [SPY_MACRO_REF.ticker, ...getUniverseTickers()];
  const unique = [...new Set(universe)];
  console.log(`Universe: ${unique.length} tickers\n`);

  // ---------------------------------------------------------------- Stooq
  console.log(
    `=== STOOQ full-universe coverage sweep (${unique.length} tickers, ${STOOQ_DELAY_MS}ms spacing) ===`,
  );
  const stooq = new Map<string, SourceResult>();
  let done = 0;
  for (const t of unique) {
    try {
      const bars = await fetchWeeklyFromStooq(t);
      stooq.set(t, { ok: true, bars });
    } catch (err) {
      stooq.set(t, { ok: false, error: String(err) });
    }
    done++;
    if (done % 50 === 0) console.log(`  …${done}/${unique.length}`);
    await sleep(STOOQ_DELAY_MS);
  }
  const stooqOk = [...stooq.entries()].filter(([, r]) => r.ok);
  const stooqFail = [...stooq.entries()].filter(([, r]) => !r.ok);
  console.log(`Stooq coverage: ${stooqOk.length}/${unique.length}`);
  if (stooqFail.length > 0) {
    console.log(`Stooq FAILURES (${stooqFail.length}):`);
    for (const [t, r] of stooqFail) console.log(`  ✗ ${t}: ${r.error}`);
  }
  // Freshness + history depth distribution
  const lastDates = new Map<string, number>();
  let minBars = Infinity;
  let minBarsTicker = "";
  for (const [t, r] of stooqOk) {
    const lb = lastBar(r.bars!);
    lastDates.set(lb.date, (lastDates.get(lb.date) ?? 0) + 1);
    if (r.bars!.length < minBars) {
      minBars = r.bars!.length;
      minBarsTicker = t;
    }
  }
  console.log(
    `Stooq last-bar dates: ${[...lastDates.entries()]
      .sort()
      .map(([d, n]) => `${d}×${n}`)
      .join(", ")}`,
  );
  console.log(
    `Stooq shallowest history: ${minBarsTicker} (${minBars} weekly bars)\n`,
  );

  // -------------------------------------------------------------- Polygon
  // Sample: SPY + every Nth universe ticker → ~15 total, spread across sectors.
  const step = Math.max(1, Math.floor(unique.length / 14));
  const sample = [
    ...new Set(["SPY", ...unique.filter((_, i) => i % step === 0)]),
  ].slice(0, 15);
  console.log(
    `=== POLYGON sample (${sample.length} tickers, ${POLYGON_DELAY_MS}ms spacing ≈ ${Math.round((sample.length * POLYGON_DELAY_MS) / 60000)} min) ===`,
  );
  console.log(`Sample: ${sample.join(", ")}`);
  const poly = new Map<string, SourceResult>();
  for (const t of sample) {
    try {
      const bars = await fetchWeeklyFromPolygon(t);
      poly.set(t, { ok: true, bars });
      const lb = lastBar(bars);
      console.log(
        `  ✓ ${t}: ${bars.length} bars, last ${lb.date} close ${lb.close}`,
      );
    } catch (err) {
      poly.set(t, { ok: false, error: String(err) });
      console.log(`  ✗ ${t}: ${err}`);
    }
    await sleep(POLYGON_DELAY_MS);
  }
  const polyOk = [...poly.entries()].filter(([, r]) => r.ok);
  console.log(`Polygon coverage: ${polyOk.length}/${sample.length}\n`);

  // ------------------------------------------------------ Cross-validation
  console.log("=== CROSS-VALIDATION (latest common Friday close) ===");
  console.log(
    "ticker  date        polygon    stooq      Δp/s     av-cache   Δp/av",
  );
  let worstPs = 0;
  for (const [t, pr] of polyOk) {
    const sr = stooq.get(t);
    if (!sr?.ok) {
      console.log(`${t.padEnd(7)} (no stooq data)`);
      continue;
    }
    const cmp = commonClose(pr.bars!, sr.bars!);
    if (!cmp) {
      console.log(`${t.padEnd(7)} (no common date)`);
      continue;
    }
    const dPs = Math.abs(cmp.a - cmp.b) / cmp.b;
    worstPs = Math.max(worstPs, dPs);
    // AV-era cache comparison (read-only; cache may be stale — date-matched)
    let avNote = "—";
    let dAv = "";
    try {
      if (isCacheValid(t) || readCache(t)) {
        const raw = readCache(t);
        if (raw) {
          const avBars = Object.entries(raw)
            .map(([date, v]) => ({
              date,
              close: parseFloat(
                (v as Record<string, string>)["5. adjusted close"],
              ),
            }))
            .filter((b) => Number.isFinite(b.close))
            .sort((a, b) => a.date.localeCompare(b.date));
          const match = avBars.find((b) => b.date === cmp.date);
          if (match) {
            avNote = match.close.toFixed(2);
            dAv = pct(Math.abs(cmp.a - match.close) / match.close);
          }
        }
      }
    } catch {
      /* cache read is best-effort */
    }
    console.log(
      `${t.padEnd(7)} ${cmp.date}  ${cmp.a.toFixed(2).padEnd(10)} ${cmp.b.toFixed(2).padEnd(10)} ${pct(dPs).padEnd(8)} ${avNote.padEnd(10)} ${dAv}`,
    );
  }
  console.log(`\nWorst polygon/stooq close delta: ${pct(worstPs)}`);
  console.log("\nDone. No cache/DB state was modified.");
}

main().catch((err) => {
  console.error("HARNESS FAILED:", err);
  process.exit(1);
});
