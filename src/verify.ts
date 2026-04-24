/**
 * verify.ts — Spot check: fetch XLK, show last 5 bars of AO/AC
 * Use to confirm indicators match TradingView before running full backtest.
 */
import { fetchWeeklyData } from "./data.js";
import { calculateIndicators } from "./indicators.js";
import { detectSignals } from "./signals.js";

const ticker = "XLK";
const candles = await fetchWeeklyData(ticker);
const bars = calculateIndicators(candles);

console.log(`\n${ticker}: ${candles.length} weekly candles, ${bars.length} bars with indicators\n`);
console.log("Last 5 bars:");
console.log("Date         Close    Midpoint    AO          AC        AO-color  AC-color");
console.log("──────────── ──────   ────────    ──────────  ────────  ────────  ────────");

bars.slice(-5).forEach(b => {
  console.log(
    `${b.date}  ${b.close.toFixed(2).padStart(6)}   ${b.midpoint.toFixed(2).padStart(7)}   ` +
    `${b.ao.toFixed(4).padStart(10)}  ${b.ac.toFixed(4).padStart(8)}  ${b.aoColor.padEnd(8)}  ${b.acColor}`
  );
});

const signals = detectSignals(ticker, bars);
console.log(`\nTotal signals detected (2019–now): ${signals.length}`);
console.log("Last 3 signals:");
signals.slice(-3).forEach(s => {
  console.log(`  ${s.date}  AO=${s.ao.toFixed(4)}  AC=${s.ac.toFixed(4)}  bottomDepth=${s.acBottomDepth.toFixed(4)}`);
});
