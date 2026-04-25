/**
 * fetch-new-sectors.ts - Seeds registry and fetches XLF/XLV/XLB/XLY historical data
 */
import { seedRegistry } from "./cache.js";
import { fetchTicker } from "./fetcher.js";
import { UNIVERSE } from "./universe.js";

const NEW_SECTORS = ["XLF", "XLV", "XLB", "XLY"];
const newTickers = UNIVERSE.filter(m => NEW_SECTORS.includes(m.sector));

console.log("Seeding registry...");
seedRegistry();
console.log("Fetching " + String(newTickers.length) + " new tickers...");

let ok = 0, err = 0;
for (const meta of newTickers) {
  try {
    const bars = await fetchTicker(meta.ticker);
    console.log("[OK] " + meta.ticker + " (" + meta.sector + "): " + String(bars.length) + " bars");
    ok++;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[ERR] " + meta.ticker + ": " + msg);
    err++;
  }
  await new Promise(r => setTimeout(r, 1100));
}
console.log("Done: " + String(ok) + " OK, " + String(err) + " errors");
