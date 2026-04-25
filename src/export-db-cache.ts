
import { mkdirSync, writeFileSync } from "fs";
import { getDb } from "./db.js";

const NEW_TICKERS = ["JPM", "BAC", "WFC", "GS", "MS", "BLK", "AXP", "COF", "USB", "TFC", "PNC", "SCHW", "CB", "MET", "PRU", "AIG", "AFL", "ALL", "ICE", "CME", "JNJ", "UNH", "LLY", "ABBV", "MRK", "BMY", "PFE", "AMGN", "GILD", "CVS", "CI", "HUM", "ELV", "MDT", "ABT", "SYK", "BSX", "ZTS", "ISRG", "BDX", "LIN", "APD", "SHW", "ECL", "FCX", "NEM", "NUE", "VMC", "MLM", "DOW", "LYB", "EMN", "PPG", "ALB", "IFF", "CF", "MOS", "STLD", "RS", "RPM", "AMZN", "TSLA", "HD", "MCD", "NKE", "LOW", "SBUX", "TJX", "BKNG", "GM", "F", "ORLY", "AZO", "ROST", "YUM", "DHI", "LEN", "PHM", "DRI", "MAR"];
const CACHE_DIR = "/tmp/williams-entry-radar/data/cache";

async function main() {
  mkdirSync(CACHE_DIR, { recursive: true });
  const db = getDb();
  let exported = 0, missing = 0;
  for (const ticker of NEW_TICKERS) {
    const rows = db.prepare("SELECT date, open, high, low, close, volume FROM weekly_bars WHERE ticker=? ORDER BY date ASC").all(ticker) as any[];
    if (rows.length === 0) { console.log("MISSING: " + ticker); missing++; continue; }
    const ts: Record<string, Record<string, string>> = {};
    for (const r of rows) {
      ts[r.date] = { "1. open": String(r.open), "2. high": String(r.high), "3. low": String(r.low), "4. close": String(r.close), "5. adjusted close": String(r.close), "6. volume": String(r.volume) };
    }
    writeFileSync(CACHE_DIR + "/" + ticker + ".json", JSON.stringify({"Weekly Adjusted Time Series": ts}));
    console.log("[OK] " + ticker + " " + rows.length + " bars");
    exported++;
  }
  console.log("Exported: " + exported + " | Missing: " + missing);
}
main().catch(console.error);
