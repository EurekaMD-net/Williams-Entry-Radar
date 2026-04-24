/**
 * fetcher.ts — Alpha Vantage data fetcher with cache-first strategy
 *
 * CRITICAL: Sequential fetch with 1s delay between requests.
 * AV burst detection fires even with Premium on simultaneous calls.
 * Cache-first: skip fetch if data is < 6 days old.
 */

import { isCacheValid, readCache, writeCache } from "./cache.js";

const AV_API_KEY = process.env.AV_API_KEY ?? "";
if (!AV_API_KEY) throw new Error("AV_API_KEY environment variable is required");
const BASE_URL = "https://www.alphavantage.co/query";
const DELAY_MS = 1100; // 1.1s — safely under 75 req/min, avoids burst detection

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
  const url = `${BASE_URL}?function=TIME_SERIES_WEEKLY_ADJUSTED&symbol=${ticker}&apikey=${AV_API_KEY}&datatype=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${ticker}`);

  const json = await res.json() as Record<string, unknown>;

  // Check for error / rate limit
  if ("Note" in json || "Information" in json) {
    const msg = (json["Note"] ?? json["Information"]) as string;
    throw new Error(`AV API message for ${ticker}: ${msg}`);
  }

  const series = json["Weekly Adjusted Time Series"] as Record<string, Record<string, string>> | undefined;
  if (!series) throw new Error(`No weekly data returned for ${ticker}`);

  // Write raw to cache
  writeCache(ticker, series as Parameters<typeof writeCache>[1]);

  return parseSeries(series);
}

function parseSeries(series: Record<string, Record<string, string>>): WeeklyBar[] {
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

export async function fetchTicker(ticker: string): Promise<WeeklyBar[]> {
  // Cache-first
  if (isCacheValid(ticker)) {
    const cached = readCache(ticker);
    if (cached) return parseSeries(cached.data as Parameters<typeof parseSeries>[0]);
  }

  // Fetch from AV
  const bars = await fetchFromAV(ticker);
  return bars;
}

export async function fetchAll(
  tickers: string[],
  onProgress?: (done: number, total: number, ticker: string, fromCache: boolean) => void
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
      results.set(ticker, []); // empty = skip in scanner
    }
  }

  return results;
}
