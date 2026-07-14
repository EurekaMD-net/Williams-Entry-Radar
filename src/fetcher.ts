/**
 * fetcher.ts — weekly data fetcher with cache-first strategy
 *
 * Since 2026-07-14 (AV key downgraded to FREE tier: 25 req/day): POLYGON is
 * the primary source (free tier: 5 req/min, no daily cap, ~2y history —
 * covers the scanner's 104-week window); Alpha Vantage is a scarce fallback
 * only. Sequential fetch, 13s between Polygon requests.
 * Cache-first: skip fetch if data is < 6 days old.
 *
 * Basis note: Polygon bars are split-adjusted (AV's adjusted close was
 * split+dividend adjusted) — validated 2026-07-14 via
 * scripts/compare-polygon-av.ts: AO/AC identical; pricePercentile/ranging
 * shift on dividend payers (accepted, one-time recalibration).
 */

import {
  isCacheValid,
  readCache,
  writeCache,
  recordFetchError,
  type AVRawSeries,
} from "./cache.js";
import { fetchWeeklyFromPolygon, POLYGON_DELAY_MS } from "./fetch-polygon.js";

const BASE_URL = "https://www.alphavantage.co/query";
const DELAY_MS = POLYGON_DELAY_MS; // 13s — Polygon free tier is 5 req/min

/**
 * Check AV_API_KEY lazily (at call time, not at import time). Throwing at
 * import breaks test harnesses that only need to exercise cache paths
 * without hitting the network.
 */
function getApiKey(): string {
  const key = process.env.AV_API_KEY ?? "";
  if (!key) throw new Error("AV_API_KEY environment variable is required");
  return key;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface WeeklyBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

async function fetchFromAV(ticker: string): Promise<WeeklyBar[]> {
  const url = `${BASE_URL}?function=TIME_SERIES_WEEKLY_ADJUSTED&symbol=${ticker}&apikey=${getApiKey()}&datatype=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${ticker}`);

  const json = (await res.json()) as Record<string, unknown>;

  // Check for error / rate limit
  if ("Note" in json || "Information" in json) {
    const msg = (json["Note"] ?? json["Information"]) as string;
    throw new Error(`AV API message for ${ticker}: ${msg}`);
  }

  const series = json["Weekly Adjusted Time Series"] as
    Record<string, Record<string, string>> | undefined;
  if (!series) throw new Error(`No weekly data returned for ${ticker}`);

  // Write raw to cache
  writeCache(ticker, series as import("./cache.js").AVRawSeries);

  return parseSeries(series);
}

function parseSeries(
  series: Record<string, Record<string, string>>,
): WeeklyBar[] {
  return Object.entries(series)
    .map(([date, vals]) => ({
      date,
      open: parseFloat(vals["1. open"]),
      high: parseFloat(vals["2. high"]),
      low: parseFloat(vals["3. low"]),
      close: parseFloat(vals["5. adjusted close"]),
      volume: parseInt(vals["6. volume"] ?? vals["5. volume"] ?? "0", 10),
    }))
    .sort((a, b) => a.date.localeCompare(b.date)); // ascending
}

/** Monday of the week containing a YYYY-MM-DD date — the week's identity key. */
function weekKey(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/**
 * Convert Polygon weekly bars to the AVRawSeries cache format, snapping each
 * bar's date to an existing same-week row date when one exists. The AV era
 * keyed holiday-shortened weeks by their LAST TRADING DAY (e.g. Thursday
 * 2025-04-17 for the Good Friday week) while fetch-polygon labels every week
 * by its Friday — without snapping, the upsert would create a DUPLICATE row
 * for those weeks and pollute the AO/SMA windows. Exported for tests.
 */
export function polygonBarsToSeries(
  bars: WeeklyBar[],
  existingDates: string[],
): AVRawSeries {
  const existingByWeek = new Map<string, string>();
  for (const date of existingDates) existingByWeek.set(weekKey(date), date);
  const series: AVRawSeries = {};
  for (const b of bars) {
    const date = existingByWeek.get(weekKey(b.date)) ?? b.date;
    series[date] = {
      "1. open": String(b.open),
      "2. high": String(b.high),
      "3. low": String(b.low),
      "5. adjusted close": String(b.close),
      "6. volume": String(b.volume),
    };
  }
  return series;
}

async function fetchFromPolygon(ticker: string): Promise<WeeklyBar[]> {
  const bars = await fetchWeeklyFromPolygon(ticker);
  const existing = readCache(ticker);
  const series = polygonBarsToSeries(
    bars,
    existing ? Object.keys(existing) : [],
  );
  writeCache(ticker, series);
  return parseSeries(series);
}

export async function fetchTicker(ticker: string): Promise<WeeklyBar[]> {
  // Cache-first — readCache now returns AVRawSeries directly
  if (isCacheValid(ticker)) {
    const cached = readCache(ticker);
    if (cached) return parseSeries(cached as Parameters<typeof parseSeries>[0]);
  }

  // Polygon primary; AV (free tier, 25 req/day) as scarce fallback.
  try {
    return await fetchFromPolygon(ticker);
  } catch (err) {
    console.error(
      `  ⚠ ${ticker}: polygon failed (${err}) — trying AV fallback`,
    );
    return await fetchFromAV(ticker);
  }
}

export async function fetchAll(
  tickers: string[],
  onProgress?: (
    done: number,
    total: number,
    ticker: string,
    fromCache: boolean,
  ) => void,
): Promise<Map<string, WeeklyBar[]>> {
  const results = new Map<string, WeeklyBar[]>();

  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i];
    const fromCache = isCacheValid(ticker);

    try {
      if (!fromCache) {
        // Only delay if we need to hit the API
        if (i > 0) await sleep(DELAY_MS);
      }
      const bars = await fetchTicker(ticker);
      results.set(ticker, bars);
      onProgress?.(i + 1, tickers.length, ticker, fromCache);
    } catch (err) {
      console.error(`  ✗ ${ticker}: ${err}`);
      recordFetchError(ticker);
      results.set(ticker, []); // empty = skip in scanner
    }
  }

  return results;
}
