/**
 * fetch-stooq.ts — Stooq weekly data fetcher (candidate AV replacement)
 *
 * SCAFFOLD (2026-07-14): NOT wired into the scan pipeline yet. See
 * fetch-polygon.ts header for context; both candidates are evaluated by
 * scripts/test-data-sources.ts.
 *
 * - No API key, no documented quota (be polite: ≥500ms between calls).
 * - CSV endpoint: https://stooq.com/q/d/l/?s=<ticker>.us&i=w
 *   Columns: Date,Open,High,Low,Close,Volume — weekly rows keyed by the
 *   week's last trading day (matches the AV Friday convention).
 * - Data is split-adjusted. Full available history is returned.
 * - Known risks: unofficial service, no SLA, possible gaps on microcaps —
 *   exactly what the harness measures.
 */

import type { WeeklyBar } from "./fetcher.js";

const BASE_URL = "https://stooq.com/q/d/l/";
/** Politeness floor between sequential requests. */
export const STOOQ_DELAY_MS = 500;

export async function fetchWeeklyFromStooq(
  ticker: string,
): Promise<WeeklyBar[]> {
  const symbol = `${ticker.toLowerCase()}.us`;
  const url = `${BASE_URL}?s=${encodeURIComponent(symbol)}&i=w`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Stooq HTTP ${res.status} for ${ticker}`);

  const text = (await res.text()).trim();
  if (!text || /^no data$/i.test(text)) {
    throw new Error(`No weekly data returned for ${ticker} (stooq)`);
  }
  if (/exceeded the daily hits limit/i.test(text)) {
    throw new Error(`Stooq daily hits limit exceeded (ticker ${ticker})`);
  }

  const lines = text.split("\n");
  const header = lines[0]?.trim();
  if (!header?.startsWith("Date,Open,High,Low,Close")) {
    throw new Error(
      `Stooq unexpected response for ${ticker}: ${header?.slice(0, 60)}`,
    );
  }

  const bars: WeeklyBar[] = [];
  for (let i = 1; i < lines.length; i++) {
    const [date, open, high, low, close, volume] = lines[i].split(",");
    if (!date || !close) continue;
    const o = parseFloat(open);
    const h = parseFloat(high);
    const l = parseFloat(low);
    const c = parseFloat(close);
    if (!Number.isFinite(o) || !Number.isFinite(c)) continue; // N/D rows
    bars.push({
      date,
      open: o,
      high: h,
      low: l,
      close: c,
      volume: Number.isFinite(parseFloat(volume)) ? parseInt(volume, 10) : 0,
    });
  }
  if (bars.length === 0) {
    throw new Error(
      `Stooq returned header but no parseable rows for ${ticker}`,
    );
  }
  return bars.sort((a, b) => a.date.localeCompare(b.date));
}
