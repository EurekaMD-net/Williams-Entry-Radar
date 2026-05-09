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
      "WEC", "ED", "ETR", "FE", "PPL", "AEE", "CMS", "NI", "CNP", "LNT",
      // W20 expansion: positions 21-30 by ETF weight
      "EVRG", "PNW", "OGE", "SR", "NWE", "OTTR", "POR", "AVA", "ATO", "AWK"
    ]
  },
  XLP: {
    name: "Consumer Staples",
    tickers: [
      "PG", "COST", "KO", "PEP", "WMT", "PM", "MO", "MDLZ", "CL", "EL",
      "STZ", "KHC", "GIS", "SYY", "HSY", "K", "TSN", "HRL", "MKC", "CLX",
      // W20 expansion: TGT & MNST are top-10 XLP by weight — critical additions
      "TGT", "MNST", "KDP", "KR", "ADM", "CHD", "SJM", "CAG", "CPB", "TAP"
    ]
  },
  XLE: {
    name: "Energy",
    tickers: [
      "XOM", "CVX", "COP", "EOG", "SLB", "MPC", "PSX", "VLO", "OXY",
      "WMB", "KMI", "HAL", "DVN", "HES", "FANG", "BKR", "MRO", "OKE", "APA",
      // W20 expansion: E&P and midstream additions
      "CTRA", "TRGP", "RRC", "AR", "SM", "OVV", "MUR", "CHK", "AM", "PR"
    ]
  },
  XLI: {
    name: "Industrials",
    tickers: [
      "GE", "CAT", "HON", "UNP", "RTX", "LMT", "DE", "UPS", "ETN", "BA",
      "GEV", "WM", "PH", "FDX", "CTAS", "EMR", "NSC", "ITW", "MMM", "TT",
      // W20 expansion: GEV & UBER are top XLI weights not in universe
      "UBER", "VRT", "PWR", "CARR", "OTIS", "XYL", "IR", "HUBB", "AME", "WAB"
    ]
  },
  XLF: {
    name: "Financials",
    tickers: [
      "JPM", "BAC", "WFC", "GS", "MS", "BLK", "AXP", "COF", "USB", "TFC",
      "PNC", "SCHW", "CB", "MET", "PRU", "AIG", "AFL", "ALL", "ICE", "CME",
      // W20 expansion: BRK.B, V, MA are TOP 3 XLF holdings — critical omissions
      "BRK.B", "V", "MA", "C", "SPGI", "MSCI", "MCO", "TROW", "NTRS", "RF"
    ]
  },
  XLV: {
    name: "Healthcare",
    tickers: [
      "JNJ", "UNH", "LLY", "ABBV", "MRK", "BMY", "PFE", "AMGN", "GILD", "CVS",
      "CI", "HUM", "ELV", "MDT", "ABT", "SYK", "BSX", "ZTS", "ISRG", "BDX",
      // W20 expansion: med devices and diagnostics
      "DXCM", "IQV", "IDXX", "MTD", "WAT", "COO", "EW", "HOLX", "HSIC", "DVA"
    ]
  },
  XLB: {
    name: "Materials",
    tickers: [
      "LIN", "APD", "SHW", "ECL", "FCX", "NEM", "NUE", "VMC", "MLM", "DOW",
      "LYB", "EMN", "PPG", "ALB", "IFF", "CF", "MOS", "STLD", "RS", "RPM",
      // W20 expansion: packaging, specialty chemicals
      "FMC", "DD", "BALL", "AVY", "SEE", "SON", "OLN", "HUN", "CC", "AMCR"
    ]
  },
  XLY: {
    name: "Cons.Disc",
    tickers: [
      "AMZN", "TSLA", "HD", "MCD", "NKE", "LOW", "SBUX", "TJX", "BKNG", "GM",
      "F", "ORLY", "AZO", "ROST", "YUM", "DHI", "LEN", "PHM", "DRI", "MAR",
      // W20 expansion: travel/leisure/hospitality
      "HLT", "CCL", "RCL", "NCLH", "H", "WYNN", "MGM", "LVS", "CMG", "EXPE"
    ]
  },
  XLK: {
    name: "Technology",
    tickers: [
      "NVDA", "AAPL", "MSFT", "AVGO", "MU", "AMD", "CSCO", "PLTR", "LRCX", "AMAT",
      "INTC", "ORCL", "TXN", "KLAC", "IBM", "ADI", "APH", "ANET", "CRM", "QCOM",
      // W20 expansion: software and semis positions 21-30
      "NOW", "PANW", "FTNT", "CDNS", "SNPS", "MCHP", "ON", "MPWR", "GLW", "STX"
    ]
  },
  XLC: {
    name: "Comm.Services",
    tickers: [
      "META", "GOOGL", "GOOG", "DIS", "CMCSA", "CHTR", "TTWO", "SATS", "LYV", "OMC",
      "EA", "NFLX", "WBD", "VZ", "T", "TMUS", "TKO", "FOXA", "TTD", "NWSA",
      // W20 expansion: streaming, social, platforms
      "PINS", "SNAP", "SPOT", "RBLX", "DASH", "MTCH", "PARA", "IPG", "ZG", "IAC"
    ]
  },
  XLRE: {
    name: "Real Estate",
    tickers: [
      "WELL", "PLD", "EQIX", "AMT", "DLR", "SPG", "CBRE", "PSA", "O", "VTR",
      "CCI", "IRM", "VICI", "EXR", "AVB", "SBAC", "EQR", "WY", "ESS", "KIM",
      // W20 expansion: diversified REITs and residential
      "ARE", "MAA", "UDR", "CPT", "HST", "REG", "BXP", "FR", "EGP", "NNN"
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
