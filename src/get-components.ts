/**
 * Phase 2 — Component Lists
 * Top 20 tickers by market cap for 4 sectors: XLU, XLP, XLE, XLI
 * Source: iShares/SPDR ETF holdings (hardcoded as of April 2026)
 * These are the major constituents by weight — proxy for market cap rank
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
  }
};

// Also include SPY as macro filter (S&P 500 proxy)
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
