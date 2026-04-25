import { mkdirSync, writeFileSync } from "fs";
import Database from "better-sqlite3";
import { calculateIndicators } from "/root/claude/williams-entry-radar/src/indicators.js";
import { detectSignals } from "/root/claude/williams-entry-radar/src/signals.js";

const DB_PATH = "/root/claude/williams-entry-radar/data/radar.db";
const RESULTS_DIR = "/tmp/williams-entry-radar/results";
const PHASE3_SECTORS = ["XLK", "XLC", "XLRE"];
const sectorNames: Record<string, string> = { XLK: "Technology", XLC: "Comm.Services", XLRE: "Real Estate" };

interface WeeklyCandle { date: string; open: number; high: number; low: number; close: number; volume: number; }
interface SignalOutcome { ticker: string; date: string; sector: string; ret4W: number; ret8W: number; ret12W: number; maxDD: number; aoLag: number; macroFilter: "bull"|"bear"; clean: boolean; }
interface TickerResult { ticker: string; sector: string; sectorName: string; totalSignals: number; hitRate8W: number; avgReturn4W: number; avgReturn8W: number; avgReturn12W: number; avgMaxDD: number; avgAoLag: number; cleanSignals: number; cleanHitRate: number; score: number; bestReturn8W: number; worstReturn8W: number; }

function loadFromDb(db: any, ticker: string): WeeklyCandle[] {
  return (db.prepare("SELECT date,open,high,low,close,volume FROM weekly_bars WHERE ticker=? ORDER BY date ASC").all(ticker) as any[])
    .map((r: any) => ({ date: r.date, open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume, midpoint: (r.high + r.low) / 2 }));
}
function computeMaxDD(candles: WeeklyCandle[], entryIdx: number, weeks: number): number {
  const end = Math.min(entryIdx + weeks, candles.length - 1);
  const base = candles[entryIdx].close;
  let maxDD = 0;
  for (let i = entryIdx+1; i<=end; i++) { const dd=(candles[i].close-base)/base; if(dd<maxDD) maxDD=dd; }
  return maxDD;
}
function computeReturn(candles: WeeklyCandle[], entryIdx: number, weeks: number): number {
  const target = Math.min(entryIdx + weeks, candles.length-1);
  if (target <= entryIdx) return 0;
  return (candles[target].close - candles[entryIdx].close) / candles[entryIdx].close;
}
function computeAoLag(bars: any[], signalIdx: number): number {
  let lag=0;
  for (let i=signalIdx+1; i<bars.length && i<signalIdx+52; i++) { lag++; if(bars[i].ao>0) return lag; }
  return lag;
}
function buildSpyMap(spyCandles: WeeklyCandle[]): Map<string, boolean> {
  const closes = spyCandles.map(c=>c.close);
  const m = new Map<string,boolean>();
  for (let i=0; i<spyCandles.length; i++) {
    if(i<39){m.set(spyCandles[i].date,false);continue;}
    const sma40=closes.slice(i-39,i+1).reduce((a,b)=>a+b,0)/40;
    m.set(spyCandles[i].date, closes[i]>sma40);
  }
  return m;
}

async function main() {
  mkdirSync(RESULTS_DIR, {recursive:true});
  const db = Database(DB_PATH);
  const spyCandles = loadFromDb(db, "SPY");
  const macroMap = buildSpyMap(spyCandles);
  console.log("SPY macro filter: " + macroMap.size + " weeks");

  const allOutcomes: SignalOutcome[] = [];
  const tickerResults: TickerResult[] = [];

  for (const sector of PHASE3_SECTORS) {
    const tickers = (db.prepare("SELECT ticker FROM ticker_registry WHERE sector=? ORDER BY ticker").all(sector) as any[]).map((r:any)=>r.ticker);
    console.log("\n=== " + sector + " (" + sectorNames[sector] + ") ===");
    for (const ticker of tickers) {
      const candles = loadFromDb(db, ticker);
      if (candles.length < 50) { console.log("  " + ticker + ": insufficient data"); continue; }
      const bars = calculateIndicators(candles);
      const signals = detectSignals(ticker, bars);
      if (!signals.length) { console.log("  " + ticker + ": 0 signals"); continue; }
      const barMap = new Map(bars.map((b:any,i:number)=>[b.date,i]));
      const candleMap = new Map(candles.map((c,i)=>[c.date,i]));
      const outcomes: SignalOutcome[] = [];
      for (const sig of signals) {
        const ci = candleMap.get(sig.date); const bi = barMap.get(sig.date);
        if(ci===undefined||bi===undefined) continue;
        const entry = ci+1;
        if(entry+12>=candles.length) continue;
        const maxDD = computeMaxDD(candles,entry,12);
        outcomes.push({
          ticker, date:sig.date, sector,
          ret4W:computeReturn(candles,entry,4), ret8W:computeReturn(candles,entry,8), ret12W:computeReturn(candles,entry,12),
          maxDD, aoLag:computeAoLag(bars,bi),
          macroFilter:(macroMap.get(sig.date)??false)?"bull":"bear",
          clean:maxDD>-0.15
        });
      }
      if(!outcomes.length) continue;
      const hits8W=outcomes.filter(o=>o.ret8W>0).length;
      const clean=outcomes.filter(o=>o.clean);
      const cleanHits=clean.filter(o=>o.ret8W>0).length;
      const avg=(arr:number[])=>arr.reduce((a,b)=>a+b,0)/arr.length;
      const hr8W=hits8W/outcomes.length;
      const ar8W=avg(outcomes.map(o=>o.ret8W));
      const aDD=avg(outcomes.map(o=>o.maxDD));
      const cHR=clean.length?cleanHits/clean.length:0;
      const score=((hr8W*0.4+cHR*0.3+Math.min(ar8W*5,0.3))*(1+clean.length/outcomes.length))/(1+Math.abs(aDD)*3);
      const r8s=outcomes.map(o=>o.ret8W);
      tickerResults.push({
        ticker, sector, sectorName:sectorNames[sector], totalSignals:outcomes.length,
        hitRate8W:hr8W, avgReturn4W:avg(outcomes.map(o=>o.ret4W)), avgReturn8W:ar8W,
        avgReturn12W:avg(outcomes.map(o=>o.ret12W)), avgMaxDD:aDD, avgAoLag:avg(outcomes.map(o=>o.aoLag)),
        cleanSignals:clean.length, cleanHitRate:cHR, score, bestReturn8W:Math.max(...r8s), worstReturn8W:Math.min(...r8s)
      });
      allOutcomes.push(...outcomes);
      console.log("  " + ticker + ": " + outcomes.length + " signals, HR=" + (hr8W*100).toFixed(0) + "%, ret8W=" + (ar8W>=0?"+":"") + (ar8W*100).toFixed(1) + "%, DD=" + (aDD*100).toFixed(1) + "%, score=" + score.toFixed(3));
    }
  }

  tickerResults.sort((a,b)=>b.score-a.score);

  const scoreCsv=[
    "rank,ticker,sector,signals,hitRate8W,avgRet4W,avgRet8W,avgRet12W,avgMaxDD,avgAoLag,cleanSigs,cleanHitRate,score,bestRet8W,worstRet8W",
    ...tickerResults.map((r,i)=>[
      i+1, r.ticker, r.sector, r.totalSignals,
      (r.hitRate8W*100).toFixed(1), (r.avgReturn4W*100).toFixed(2), (r.avgReturn8W*100).toFixed(2), (r.avgReturn12W*100).toFixed(2),
      (r.avgMaxDD*100).toFixed(2), r.avgAoLag.toFixed(1), r.cleanSignals, (r.cleanHitRate*100).toFixed(1),
      r.score.toFixed(4), (r.bestReturn8W*100).toFixed(2), (r.worstReturn8W*100).toFixed(2)
    ].join(","))
  ].join("\n");
  writeFileSync(RESULTS_DIR + "/phase3_scorecard.csv", scoreCsv);

  const outCsv=[
    "ticker,date,sector,ret4W,ret8W,ret12W,maxDD,aoLag,macroFilter,clean",
    ...allOutcomes.map(o=>[
      o.ticker,o.date,o.sector,
      (o.ret4W*100).toFixed(2),(o.ret8W*100).toFixed(2),(o.ret12W*100).toFixed(2),
      (o.maxDD*100).toFixed(2),o.aoLag,o.macroFilter,o.clean?"1":"0"
    ].join(","))
  ].join("\n");
  writeFileSync(RESULTS_DIR + "/phase3_outcomes.csv", outCsv);

  console.log("\n\n=== TOP 15 ===");
  console.log("Rank | Ticker | Sector        | Sigs | HR8W  | Ret8W  | DD     | Score");
  console.log("-----|--------|---------------|------|-------|--------|--------|------");
  for (const r of tickerResults.slice(0,15)) {
    const i=tickerResults.indexOf(r);
    console.log(String(i+1).padStart(4)+" | "+r.ticker.padEnd(6)+" | "+r.sectorName.padEnd(13)+" | "+String(r.totalSignals).padStart(4)+" | "+(r.hitRate8W*100).toFixed(0).padStart(4)+"% | "+(r.avgReturn8W>=0?"+":"")+(r.avgReturn8W*100).toFixed(1).padStart(5)+"% | "+(r.avgMaxDD*100).toFixed(1).padStart(5)+"% | "+r.score.toFixed(3));
  }

  console.log("\n\n=== SECTOR SUMMARY ===");
  for (const s of PHASE3_SECTORS) {
    const sr=tickerResults.filter(r=>r.sector===s);
    if(!sr.length) continue;
    const a=(fn:(r:typeof sr[0])=>number)=>sr.reduce((x,r)=>x+fn(r),0)/sr.length;
    console.log(s+": "+sr.length+" tickers, "+sr.reduce((x,r)=>x+r.totalSignals,0)+" signals, avgHR="+a(r=>r.hitRate8W*100).toFixed(1)+"%, ret8W="+(a(r=>r.avgReturn8W*100)>=0?"+":"")+a(r=>r.avgReturn8W*100).toFixed(2)+"%, DD="+a(r=>r.avgMaxDD*100).toFixed(1)+"%");
  }

  const bull=allOutcomes.filter(o=>o.macroFilter==="bull");
  const bear=allOutcomes.filter(o=>o.macroFilter==="bear");
  const bullHR=bull.filter(o=>o.ret8W>0).length/(bull.length||1);
  const bearHR=bear.filter(o=>o.ret8W>0).length/(bear.length||1);
  console.log("\nMacro — Bull: "+bull.length+" signals HR="+(bullHR*100).toFixed(1)+"% | Bear: "+bear.length+" signals HR="+(bearHR*100).toFixed(1)+"%");
  console.log("Total: "+allOutcomes.length+" outcomes | Saved: "+RESULTS_DIR+"/phase3_scorecard.csv");
  db.close();
}
main().catch(console.error);
