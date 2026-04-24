/**
 * cache.ts — Persistent cache for Williams Entry Radar
 *
 * Cache lives in /tmp/williams-entry-radar/data/cache/
 * TTL: 6 days (fresh weekly data on each run)
 * Format: {ticker}.json with { fetchedAt: ISO string, data: WeeklyBar[] }
 */

import fs from "fs";
import path from "path";

export interface CachedData {
  fetchedAt: string;
  ticker: string;
  data: Record<string, { open: string; high: string; low: string; close: string; volume: string; "adjusted close": string }>;
}

const CACHE_DIR = path.join("/tmp/williams-entry-radar/data/cache");
const TTL_DAYS = 6;

function ensureCacheDir(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function cachePathFor(ticker: string): string {
  return path.join(CACHE_DIR, `${ticker}.json`);
}

export function isCacheValid(ticker: string): boolean {
  const p = cachePathFor(ticker);
  if (!fs.existsSync(p)) return false;

  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf-8")) as CachedData;
    const fetchedAt = new Date(raw.fetchedAt);
    const ageMs = Date.now() - fetchedAt.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    return ageDays < TTL_DAYS;
  } catch {
    return false;
  }
}

export function readCache(ticker: string): CachedData | null {
  const p = cachePathFor(ticker);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as CachedData;
  } catch {
    return null;
  }
}

export function writeCache(ticker: string, data: CachedData["data"]): void {
  ensureCacheDir();
  const payload: CachedData = {
    fetchedAt: new Date().toISOString(),
    ticker,
    data,
  };
  fs.writeFileSync(cachePathFor(ticker), JSON.stringify(payload), "utf-8");
}

export function getCacheStats(): { total: number; valid: number; stale: number } {
  ensureCacheDir();
  const files = fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith(".json"));
  const valid = files.filter((f) => isCacheValid(f.replace(".json", ""))).length;
  return { total: files.length, valid, stale: files.length - valid };
}
