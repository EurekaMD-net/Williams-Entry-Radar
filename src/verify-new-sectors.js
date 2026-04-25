const Database = require('better-sqlite3');
const db = new Database('/root/claude/williams-entry-radar/data/radar.db');

const NEW_SECTORS = {
  XLK: ['NVDA','AAPL','MSFT','AVGO','MU','AMD','CSCO','PLTR','LRCX','AMAT','INTC','ORCL','TXN','KLAC','IBM','ADI','APH','ANET','CRM','QCOM'],
  XLC: ['META','GOOGL','GOOG','DIS','CMCSA','CHTR','TTWO','SATS','LYV','OMC','EA','NFLX','WBD','VZ','T','TMUS','TKO','FOXA','TTD','NWSA'],
  XLRE: ['WELL','PLD','EQIX','AMT','DLR','SPG','CBRE','PSA','O','VTR','CCI','IRM','VICI','EXR','AVB','SBAC','EQR','WY','ESS','KIM'],
};

const allNew = [];
for (const [sector, tickers] of Object.entries(NEW_SECTORS)) {
  allNew.push(...tickers.map(t => ({ ticker: t, sector })));
}

console.log(`\nTotal new tickers to process: ${allNew.length} (${Object.keys(NEW_SECTORS).length} sectors x 20)`);
console.log('\n=== DB INTEGRITY CHECK ===\n');

let inDb = 0, missing = 0;
const missingList = [];

for (const { ticker, sector } of allNew) {
  const row = db.prepare('SELECT COUNT(*) as n, MIN(date) as oldest, MAX(date) as newest FROM weekly_bars WHERE ticker = ?').get(ticker);
  const status = row.n > 0 ? `✓ ${row.n} bars (${row.oldest} → ${row.newest})` : '✗ MISSING';
  if (row.n > 0) inDb++;
  else { missing++; missingList.push({ ticker, sector }); }
  console.log(`${sector} | ${ticker.padEnd(6)} | ${status}`);
}

console.log(`\n=== SUMMARY ===`);
console.log(`In DB:   ${inDb}/60`);
console.log(`Missing: ${missing}/60`);
if (missingList.length > 0) {
  console.log('\nMissing tickers:');
  missingList.forEach(m => console.log(`  ${m.sector}: ${m.ticker}`));
}

db.close();
