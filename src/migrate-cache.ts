/**
 * migrate-cache.ts — One-time migration from JSON file cache to SQLite
 *
 * Reads any existing .json files in /tmp/williams-entry-radar/data/cache/
 * and inserts them into the SQLite DB via upsertBars().
 *
 * Safe to run multiple times — INSERT OR REPLACE handles duplicates.
 * Run: npx tsx src/migrate-cache.ts
 */

import fs from "fs";
import path from "path";
import { upsertBars, ensureTicker, getDb } from "./db.js";
import { UNIVERSE } from "./universe.js";
import type { WeeklyBarRow } from "./db.js";

const OLD_CACHE_DIR = "/tmp/williams-entry-radar/data/cache";

// Build lookup map: ticker → meta
const tickerMeta = new Map(UNIVERSE.map((u) => [u.ticker, u]));

async function main(): Promise<void> {
  // 1. Seed the registry with all known tickers
  console.log("Seeding ticker registry...");
  for (const meta of UNIVERSE) {
    ensureTicker(meta.ticker, meta.sector, meta.tier);
  }
  console.log(`  ${UNIVERSE.length} tickers registered`);

  // 2. Migrate JSON files if they exist
  if (!fs.existsSync(OLD_CACHE_DIR)) {
    console.log(`No old cache dir found at ${OLD_CACHE_DIR} — nothing to migrate.`);
  } else {
    const files = fs.readdirSync(OLD_CACHE_DIR).filter((f) => f.endsWith(".json"));
    console.log(`Found ${files.length} JSON cache files to migrate...`);

    let migrated = 0;
    let skipped = 0;
    let totalBars = 0;

    for (const file of files) {
      const ticker = file.replace(".json", "");
      const p = path.join(OLD_CACHE_DIR, file);

      try {
        const raw = JSON.parse(fs.readFileSync(p, "utf-8")) as {
          fetchedAt: string;
          ticker: string;
          data: Record<string, Record<string, string>>;
        };

        if (!raw.data || typeof raw.data !== "object") {
          console.warn(`  Skipping ${ticker}: empty or invalid data`);
          skipped++;
          continue;
        }

        const meta = tickerMeta.get(ticker);
        const fetchedAt = raw.fetchedAt ?? new Date().toISOString();

        const rows: WeeklyBarRow[] = Object.entries(raw.data).map(([date, vals]) => ({
          ticker,
          date,
          open: parseFloat(vals["1. open"] ?? "0"),
          high: parseFloat(vals["2. high"] ?? "0"),
          low: parseFloat(vals["3. low"] ?? "0"),
          close: parseFloat(vals["5. adjusted close"] ?? "0"),
          volume: parseInt(vals["6. volume"] ?? vals["5. volume"] ?? "0", 10),
          fetched_at: fetchedAt,
        })).filter((r) => !isNaN(r.close) && r.close > 0);

        if (rows.length === 0) {
          console.warn(`  Skipping ${ticker}: all rows invalid`);
          skipped++;
          continue;
        }

        // Ensure ticker is in registry
        ensureTicker(ticker, meta?.sector ?? "?", meta?.tier ?? 2);
        upsertBars(rows);
        totalBars += rows.length;
        migrated++;
        console.log(`  ✓ ${ticker}: ${rows.length} bars migrated`);
      } catch (err) {
        console.error(`  ✗ ${ticker}: ${err}`);
        skipped++;
      }
    }

    console.log(`\nMigration complete: ${migrated} tickers, ${totalBars} bars inserted, ${skipped} skipped`);
  }

  // 3. Show final DB state
  const db = getDb();
  const tickerCount = (db.prepare("SELECT COUNT(*) as n FROM ticker_registry").get() as { n: number }).n;
  const barCount = (db.prepare("SELECT COUNT(*) as n FROM weekly_bars").get() as { n: number }).n;
  const tickersWithData = (db.prepare(
    "SELECT COUNT(DISTINCT ticker) as n FROM weekly_bars"
  ).get() as { n: number }).n;

  console.log(`\nDB state:`);
  console.log(`  Registered tickers: ${tickerCount}`);
  console.log(`  Tickers with data:  ${tickersWithData}`);
  console.log(`  Total weekly bars:  ${barCount}`);
}

main().catch(console.error);
