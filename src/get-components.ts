/**
 * Component Lists — All 11 SPDR Sector ETFs
 * Top 20 tickers by market cap per sector
 * Source: SSGA ETF holdings (as of April 2026)
 */

export const SECTOR_COMPONENTS: Record<string, { tickers: string[]; name: string }> = {
  XLU: {
    name: "Utilities",
    tickers: [
      "NEE", "SO", "DUK", "CEG", "SRE", "AEP", "D", "EXC", "PCG", "XEL",
      "WEC", "ED", "ETR", "FE", "PPL", "AEE", "CMS", "NI", "CNP", "LNT"
    ]
  },
  XLP: {
    name: "Consumer Staples",
    tickers: [
      "PG", "COST", "KO", "PEP", "WMT", "PM", "MO", "MDLZ", "CL", "EL",
      "STZ", "KHC", "GIS", "SYY", "HSY", "K", "TSN", "HRL", "MKC", "CLX"
    ]
  },
  XLE: {
    name: "Energy",
    tickers: [
      "XOM", "CVX", "COP", "EOG", "SLB", "MPC", "PSX", "VLO", "PXD", "OXY",
      "WMB", "KMI", "HAL", "DVN", "HES", "FANG", "BKR", "MRO", "OKE", "APA"
    ]
  },
  XLI: {
    name: "Industrials",
    tickers: [
      "GE", "CAT", "HON", "UNP", "RTX", "LMT", "DE", "UPS", "ETN", "BA",
      "GEV", "WM", "PH", "FDX", "CTAS", "EMR", "NSC", "ITW", "MMM", "TT"
    ]
  },
  XLF: {
    name: "Financials",
    tickers: [
      "JPM", "BAC", "WFC", "GS", "MS", "BLK", "AXP", "COF", "USB", "TFC",
      "PNC", "SCHW", "CB", "MET", "PRU", "AIG", "AFL", "ALL", "ICE", "CME"
    ]
  },
  XLV: {
    name: "Healthcare",
    tickers: [
      "JNJ", "UNH", "LLY", "ABBV", "MRK", "BMY", "PFE", "AMGN", "GILD", "CVS",
      "CI", "HUM", "ELV", "MDT", "ABT", "SYK", "BSX", "ZTS", "ISRG", "BDX"
    ]
  },
  XLB: {
    name: "Materials",
    tickers: [
      "LIN", "APD", "SHW", "ECL", "FCX", "NEM", "NUE", "VMC", "MLM", "DOW",
      "LYB", "EMN", "PPG", "ALB", "IFF", "CF", "MOS", "STLD", "RS", "RPM"
    ]
  },
  XLY: {
    name: "Cons.Disc",
    tickers: [
      "AMZN", "TSLA", "HD", "MCD", "NKE", "LOW", "SBUX", "TJX", "BKNG", "GM",
      "F", "ORLY", "AZO", "ROST", "YUM", "DHI", "LEN", "PHM", "DRI", "MAR"
    ]
  },
  XLK: {
    name: "Technology",
    tickers: [
      "NVDA", "AAPL", "MSFT", "AVGO", "MU", "AMD", "CSCO", "PLTR", "LRCX", "AMAT",
      "INTC", "ORCL", "TXN", "KLAC", "IBM", "ADI", "APH", "ANET", "CRM", "QCOM"
    ]
  },
  XLC: {
    name: "Comm.Services",
    tickers: [
      "META", "GOOGL", "GOOG", "DIS", "CMCSA", "CHTR", "TTWO", "SATS", "LYV", "OMC",
      "EA", "NFLX", "WBD", "VZ", "T", "TMUS", "TKO", "FOXA", "TTD", "NWSA"
    ]
  },
  XLRE: {
    name: "Real Estate",
    tickers: [
      "WELL", "PLD", "EQIX", "AMT", "DLR", "SPG", "CBRE", "PSA", "O", "VTR",
      "CCI", "IRM", "VICI", "EXR", "AVB", "SBAC", "EQR", "WY", "ESS", "KIM"
    ]
  },
};

// SPY as macro filter (S&P 500 proxy)
export const MACRO_TICKER = "SPY";

export function getAllTickers(): string[] {
  const tickers = new Set<string>();
  tickers.add(MACRO_TICKER);
  for (const sector of Object.values(SECTOR_COMPONENTS)) {
    for (const t of sector.tickers) tickers.add(t);
  }
  return [...tickers];
}

export function getTickerSector(ticker: string): string | null {
  for (const [etf, { tickers }] of Object.entries(SECTOR_COMPONENTS)) {
    if (tickers.includes(ticker)) return etf;
  }
  return null;
}
