import { mkdirSync, writeFileSync } from "fs";
import Database from "better-sqlite3";
import { calculateIndicators } from "/root/claude/williams-entry-radar/src/indicators.js";
import { detectSignals } from "/root/claude/williams-entry-radar/src/signals.js";

const DB_PATH = "/root/claude/williams-entry-radar/data/radar.db";
const RESULTS_DIR = "/root/claude/williams-entry-radar/results";
const BIOTECH_SECTORS = ["IBB", "XBI"];
const sectorNames: Record<string, string> = { IBB: "Biotech (cap-wtd)", XBI: "Biotech (equal-wtd)" };

interface WeeklyCandle { date: string; open: number; high: number; low: number; close: number; volume: number; midpoint: number; }
interface TickerResult { ticker: string; sector: string; sectorName: string; totalSignals: number; hitRate8W: number; avgReturn8W: number; avgMaxDD: number; cleanHitRate: number; score: number; }

function loadFromDb(db: any, ticker: string): WeeklyCandle[] {
  return (db.prepare("SELECT date,open,high,low,close,volume FROM weekly_bars WHERE ticker=? ORDER BY date ASC").all(ticker) as any[])
    .map((r: any) => ({ date: r.date, open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume, midpoint: (r.high + r.low) / 2 }));
}
function computeReturn(c: WeeklyCandle[], idx: number, w: number): number {
  const t = Math.min(idx + w, c.length-1); if(t<=idx) return 0;
  return (c[t].close - c[idx].close) / c[idx].close;
}
function computeMaxDD(c: WeeklyCandle[], idx: number, w: number): number {
  const end = Math.min(idx+w, c.length-1); const base=c[idx].close; let dd=0;
  for(let i=idx+1;i<=end;i++){const d=(c[i].close-base)/base;if(d<dd)dd=d;} return dd;
}
function buildSpyMap(spy: WeeklyCandle[]): Map<string, boolean> {
  const m = new Map<string,boolean>();
  for(let i=0;i<spy.length;i++){
    if(i<39){m.set(spy[i].date,false);continue;}
    const sma40=spy.slice(i-39,i+1).reduce((s,c)=>s+c.close,0)/40;
    m.set(spy[i].date, spy[i].close>=sma40);
  } return m;
}

const db = new Database(DB_PATH);
const spyMap = buildSpyMap(loadFromDb(db, "SPY"));
const tickers = db.prepare("SELECT DISTINCT ticker,sector FROM ticker_registry WHERE sector IN ('IBB','XBI') ORDER BY sector,ticker").all() as {ticker:string;sector:string}[];
console.log("[backtest-biotech] " + String(tickers.length) + " tickers");

const allOutcomes: any[] = [];
const results: TickerResult[] = [];

for (const {ticker, sector} of tickers) {
  const candles = loadFromDb(db, ticker);
  if(candles.length < 50){ console.log("[SKIP] "+ticker+" only "+String(candles.length)+" bars"); continue; }
  const withInd = calculateIndicators(candles);
  const signals = detectSignals(ticker, withInd);
  if(signals.length===0){ console.log("[NONE] "+ticker); continue; }
  const outcomes: any[] = [];
  for(const sig of signals){
    const idx=candles.findIndex(c=>c.date===sig.date);
    if(idx<0||idx+8>=candles.length) continue;
    const ret8W=computeReturn(candles,idx,8);
    const maxDD=computeMaxDD(candles,idx,8);
    const isBull=spyMap.get(sig.date)??false;
    outcomes.push({ticker,date:sig.date,sector,ret8W,maxDD,clean:isBull});
  }
  if(outcomes.length===0) continue;
  allOutcomes.push(...outcomes);
  const hr=outcomes.filter(o=>o.ret8W>0).length/outcomes.length;
  const avgRet=outcomes.reduce((s,o)=>s+o.ret8W,0)/outcomes.length;
  const avgDD=outcomes.reduce((s,o)=>s+o.maxDD,0)/outcomes.length;
  const cleanOuts=outcomes.filter(o=>o.clean);
  const cleanHR=cleanOuts.length>0?cleanOuts.filter(o=>o.ret8W>0).length/cleanOuts.length:0;
  const cleanRatio=cleanOuts.length/Math.max(outcomes.length,1);
  const score=(hr*0.4+cleanHR*0.3+Math.min(avgRet*5,0.3))*(1+cleanRatio)/(1+Math.abs(avgDD)*3);
  results.push({ticker,sector,sectorName:sectorNames[sector]??"",totalSignals:outcomes.length,hitRate8W:hr,avgReturn8W:avgRet,avgMaxDD:avgDD,cleanHitRate:cleanHR,score});
  console.log("[OK] "+ticker+" "+sector+" sigs:"+String(outcomes.length)+" HR:"+(hr*100).toFixed(0)+"% ret:"+(avgRet*100).toFixed(1)+"% dd:"+(avgDD*100).toFixed(1)+"%");
}

results.sort((a,b)=>b.score-a.score);
mkdirSync(RESULTS_DIR,{recursive:true});
const ts=new Date().toISOString().slice(0,10).replace(/-/g,"");
const csvPath=RESULTS_DIR+"/backtest_biotech_"+ts+".csv";
const header="Ticker,Sector,Signals,HR8W,AvgRet8W,AvgMaxDD,CleanHR,Score";
const rows=results.map(r=>[r.ticker,r.sector,r.totalSignals,(r.hitRate8W*100).toFixed(1)+"%",(r.avgReturn8W*100).toFixed(1)+"%",(r.avgMaxDD*100).toFixed(1)+"%",(r.cleanHitRate*100).toFixed(1)+"%",r.score.toFixed(3)].join(","));
writeFileSync(csvPath,header+"\n"+rows.join("\n")+"\n");

console.log("\n=== SECTOR SUMMARY ===");
for(const sec of BIOTECH_SECTORS){
  const sr=results.filter(r=>r.sector===sec);
  if(sr.length===0) continue;
  const avgHR=sr.reduce((s,r)=>s+r.hitRate8W,0)/sr.length;
  const avgRet=sr.reduce((s,r)=>s+r.avgReturn8W,0)/sr.length;
  const avgDD=sr.reduce((s,r)=>s+r.avgMaxDD,0)/sr.length;
  console.log(sec+": "+String(sr.length)+" tickers | HR:"+(avgHR*100).toFixed(1)+"% Ret:"+(avgRet*100).toFixed(1)+"% DD:"+(avgDD*100).toFixed(1)+"%");
}

console.log("\n=== TOP 15 BY SCORE ===");
results.slice(0,15).forEach((r,i)=>{
  console.log(String(i+1).padStart(4)+" | "+r.ticker.padEnd(6)+" | "+r.sector.padEnd(5)+" | "+String(r.totalSignals).padStart(4)+" | "+(r.hitRate8W*100).toFixed(0)+"% | "+(r.avgReturn8W*100).toFixed(1)+"% | "+(r.avgMaxDD*100).toFixed(1)+"% | "+r.score.toFixed(3));
});
console.log("\nTotal outcomes: "+String(allOutcomes.length)+" | CSV: "+csvPath);
