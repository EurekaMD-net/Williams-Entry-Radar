import { getDb, upsertBars, ensureTicker } from "/root/claude/williams-entry-radar/src/db.js";
import type { WeeklyBarRow } from "/root/claude/williams-entry-radar/src/db.js";

const AV_API_KEY = process.env.AV_API_KEY ?? "";
if (!AV_API_KEY) { console.error("[ERR] AV_API_KEY not set"); process.exit(1); }

const IBB_TICKERS = ["AMGN","GILD","VRTX","REGN","ALNY","ARGX","INSM","BIIB","NTRA","UTHR","RVMD","ONC","MRNA","INCY","ILMN","ROIV","GMAB","NBIX","IONS","BBIO"];
const XBI_TICKERS = ["APLS","TVTX","RVMD","TGTX","ARWR","SMMT","TWST","ERAS","ALKS","MDGL","APGE","BEAM","PRAX","CRSP","EXEL","SRRK","NUVL","KYMR","PTGX","PCVX"];

const SECTOR_MAP: Record<string, string> = {
  ...Object.fromEntries(IBB_TICKERS.map(t => [t, "IBB"])),
  ...Object.fromEntries(XBI_TICKERS.map(t => [t, "XBI"])),
};
const ALL_TICKERS = [...new Set([...IBB_TICKERS, ...XBI_TICKERS])];

interface AVResp { "Weekly Adjusted Time Series"?: Record<string, {"1. open":string;"2. high":string;"3. low":string;"5. adjusted close":string;"6. volume":string}>; Information?:string; Note?:string; }

async function fetchAV(ticker: string): Promise<WeeklyBarRow[]> {
  const url = "https://www.alphavantage.co/query?function=TIME_SERIES_WEEKLY_ADJUSTED&symbol=" + ticker + "&apikey=" + AV_API_KEY;
  const res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + String(res.status));
  const json = await res.json() as AVResp;
  if (json.Information) throw new Error("Rate limit");
  if (json.Note) throw new Error("AV note");
  const series = json["Weekly Adjusted Time Series"];
  if (!series) throw new Error("No data");
  const now = new Date().toISOString();
  return Object.entries(series).map(([date, v]) => ({
    ticker, date,
    open: parseFloat(v["1. open"]), high: parseFloat(v["2. high"]),
    low: parseFloat(v["3. low"]), close: parseFloat(v["5. adjusted close"]),
    volume: parseInt(v["6. volume"], 10), fetched_at: now,
  }));
}

console.log("[biotech] " + String(ALL_TICKERS.length) + " unique tickers (IBB:20 + XBI:20 - 1 overlap RVMD)");
const db = getDb();
let ok = 0, skip = 0, err = 0;

for (const ticker of ALL_TICKERS) {
  const row = db.prepare("SELECT COUNT(*) as n, MAX(fetched_at) as last FROM weekly_bars WHERE ticker = ?").get(ticker) as {n:number;last:string|null};
  const ageDays = row.last ? (Date.now() - new Date(row.last).getTime()) / 86400000 : Infinity;
  if (row.n > 0 && ageDays < 6) {
    console.log("[SKIP] " + ticker + " — " + String(row.n) + " bars (fresh)");
    ensureTicker(ticker, SECTOR_MAP[ticker] ?? "BIOTECH", 2);
    skip++; continue;
  }
  try {
    const bars = await fetchAV(ticker);
    upsertBars(bars);
    ensureTicker(ticker, SECTOR_MAP[ticker] ?? "BIOTECH", 2);
    console.log("[OK]   " + ticker + " (" + (SECTOR_MAP[ticker] ?? "?") + ") — " + String(bars.length) + " bars");
    ok++;
  } catch(e) { console.error("[ERR]  " + ticker + ": " + String(e)); err++; }
  await new Promise(r => setTimeout(r, 1100));
}

const stats = db.prepare("SELECT COUNT(DISTINCT ticker) as t, COUNT(*) as b FROM weekly_bars").get() as {t:number;b:number};
console.log("\n[Done] OK:" + String(ok) + " Skip:" + String(skip) + " Err:" + String(err) + " | DB: " + String(stats.t) + " tickers / " + String(stats.b) + " bars");
