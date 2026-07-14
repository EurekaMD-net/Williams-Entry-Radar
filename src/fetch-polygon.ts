/**
 * fetch-polygon.ts — Polygon.io weekly data fetcher (candidate AV replacement)
 *
 * SCAFFOLD (2026-07-14): NOT wired into the scan pipeline yet. The AV key
 * dropped to the free tier (25 req/day) which cannot serve the ~388-ticker
 * weekly scan; this and fetch-stooq.ts are the two candidate replacements
 * under evaluation via scripts/test-data-sources.ts.
 *
 * - Free tier: 5 req/min, no daily cap, ~2 years of history (~104 weekly
 *   bars — enough for AO(5,34) and the ranging filter; deep history for
 *   backtests stays in the DB/cache from the AV era).
 * - Bars are split-adjusted (adjusted=true).
 * - Polygon keys weekly bars by the week's FIRST trading day; AV keys by the
 *   Friday. Dates are shifted to the Friday of the same week so downstream
 *   consumers see the AV convention.
 * - Key: POLYGON_API_KEY env (same key mission-control uses). Base URL
 *   override: POLYGON_BASE_URL (default https://api.massive.com/v2).
 */

import type { WeeklyBar } from "./fetcher.js";

const DEFAULT_BASE_URL = "https://api.massive.com/v2";
/** 5 req/min free tier → 12s floor; 13s leaves headroom. */
export const POLYGON_DELAY_MS = 13_000;

function getApiKey(): string {
  const key = process.env.POLYGON_API_KEY ?? "";
  if (!key) throw new Error("POLYGON_API_KEY environment variable is required");
  return key;
}

function getBaseUrl(): string {
  return process.env.POLYGON_BASE_URL ?? DEFAULT_BASE_URL;
}

interface PolygonAgg {
  t: number; // window start, ms epoch
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

interface PolygonAggsResponse {
  status?: string;
  results?: PolygonAgg[];
  error?: string;
  message?: string;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Shift a weekly bar's window-start to that week's Friday, AV-style.
 * Polygon weekly windows observed to start on SUNDAY (t = Sun before the
 * trading week); Mon-keyed windows are handled too. Sat is a no-op edge.
 * NOTE: the in-progress week is labeled with its UPCOMING Friday (a future
 * date on mid-week runs). At the Friday-evening scan this is the actual
 * Friday, matching the AV convention. AV instead keys a partial week by its
 * last trading day — only mid-week ad-hoc runs see the difference.
 */
function toFridayDate(msEpoch: number): string {
  const d = new Date(msEpoch);
  const day = d.getUTCDay(); // Sun=0, Mon=1 … Fri=5, Sat=6
  const shift = day === 0 ? 5 : day >= 1 && day <= 5 ? 5 - day : 0;
  d.setUTCDate(d.getUTCDate() + shift);
  return formatDate(d);
}

export async function fetchWeeklyFromPolygon(
  ticker: string,
  lookbackYears = 2,
): Promise<WeeklyBar[]> {
  const now = new Date();
  const from = new Date(now);
  from.setUTCFullYear(from.getUTCFullYear() - lookbackYears);
  const url =
    `${getBaseUrl()}/aggs/ticker/${encodeURIComponent(ticker)}/range/1/week/` +
    `${formatDate(from)}/${formatDate(now)}?adjusted=true&sort=asc&limit=500` +
    `&apiKey=${encodeURIComponent(getApiKey())}`;

  const res = await fetch(url);
  if (res.status === 429) {
    throw new Error(`Polygon rate limited (429) for ${ticker}`);
  }
  if (!res.ok) throw new Error(`Polygon HTTP ${res.status} for ${ticker}`);

  const json = (await res.json()) as PolygonAggsResponse;
  if (json.status === "ERROR" || json.error) {
    throw new Error(
      `Polygon error for ${ticker}: ${json.error ?? json.message ?? "unknown"}`,
    );
  }
  const results = json.results ?? [];
  if (results.length === 0) {
    throw new Error(`No weekly data returned for ${ticker} (polygon)`);
  }

  return results
    .map((r) => ({
      date: toFridayDate(r.t),
      open: r.o,
      high: r.h,
      low: r.l,
      close: r.c,
      volume: Math.round(r.v),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
