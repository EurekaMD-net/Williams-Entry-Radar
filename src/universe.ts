/**
 * universe.ts — Ticker universe for Williams Entry Radar
 *
 * Tier 1: Top 15 outliers from Phase 2 backtest (HR ≥ 73%, DD < 5%)
 * Tier 2: Remaining 79 tickers from Phase 2 backtest
 * Tier 2 (new sectors): XLF, XLV, XLB, XLY — 20 tickers each, added 2026-04-25
 *
 * Expansion strategy: weekly additions starting from rank 21 per sector,
 * ordered by sector quality (XLU first → XLI → XLP → XLE → XLF → XLV → XLB → XLY).
 */

export interface TickerMeta {
  ticker: string;
  sector: string;
  tier: 1 | 2;
  hrHistorical?: number;   // Phase 2 S1 hit rate (8W)
  avgRetHistorical?: number;
  maxDdHistorical?: number;
  aoLagHistorical?: number;
}

// Tier 1 — Best outliers from Phase 2 (HR ≥ 73%, signals ≥ 20)
const TIER1: TickerMeta[] = [
  { ticker: "SO",   sector: "XLU", tier: 1, hrHistorical: 85.0, avgRetHistorical: 6.60, maxDdHistorical: -1.7, aoLagHistorical: 11.8 },
  { ticker: "WEC",  sector: "XLU", tier: 1, hrHistorical: 80.4, avgRetHistorical: 4.13, maxDdHistorical: -3.0, aoLagHistorical: 12.4 },
  { ticker: "SRE",  sector: "XLU", tier: 1, hrHistorical: 79.5, avgRetHistorical: 4.89, maxDdHistorical: -3.0, aoLagHistorical: 15.6 },
  { ticker: "DUK",  sector: "XLU", tier: 1, hrHistorical: 79.2, avgRetHistorical: 3.42, maxDdHistorical: -4.9, aoLagHistorical: 18.4 },
  { ticker: "AEE",  sector: "XLU", tier: 1, hrHistorical: 78.0, avgRetHistorical: 4.12, maxDdHistorical: -3.1, aoLagHistorical: 14.7 },
  { ticker: "NEE",  sector: "XLU", tier: 1, hrHistorical: 77.1, avgRetHistorical: 3.82, maxDdHistorical: -4.2, aoLagHistorical: 14.6 },
  { ticker: "ED",   sector: "XLU", tier: 1, hrHistorical: 76.4, avgRetHistorical: 4.00, maxDdHistorical: -2.4, aoLagHistorical: 10.8 },
  { ticker: "DE",   sector: "XLI", tier: 1, hrHistorical: 74.5, avgRetHistorical: 6.09, maxDdHistorical: -4.3, aoLagHistorical: 11.7 },
  { ticker: "COST", sector: "XLP", tier: 1, hrHistorical: 74.4, avgRetHistorical: 4.39, maxDdHistorical: -4.2, aoLagHistorical: 11.6 },
  { ticker: "ETR",  sector: "XLU", tier: 1, hrHistorical: 74.4, avgRetHistorical: 3.61, maxDdHistorical: -3.5, aoLagHistorical: 13.2 },
  { ticker: "HON",  sector: "XLI", tier: 1, hrHistorical: 75.0, avgRetHistorical: 4.80, maxDdHistorical: -4.5, aoLagHistorical: 12.1 },
  { ticker: "LMT",  sector: "XLI", tier: 1, hrHistorical: 66.7, avgRetHistorical: 5.20, maxDdHistorical: -3.8, aoLagHistorical: 10.5 },
  { ticker: "PG",   sector: "XLP", tier: 1, hrHistorical: 65.4, avgRetHistorical: 3.10, maxDdHistorical: -3.2, aoLagHistorical: 13.8 },
  { ticker: "MO",   sector: "XLP", tier: 1, hrHistorical: 69.4, avgRetHistorical: 2.80, maxDdHistorical: -4.1, aoLagHistorical: 11.2 },
];

/**
 * SPY is a macro reference only — NOT included in the operational scan.
 * Use it for regime context (bull/bear filter) but never generate S1/S2 alerts for it.
 */
export const SPY_MACRO_REF: TickerMeta = { ticker: "SPY", sector: "SPY", tier: 1, hrHistorical: undefined };

// Tier 2 — Remaining Phase 2 universe
const TIER2_XLU: TickerMeta[] = [
  { ticker: "AES",  sector: "XLU", tier: 2 },
  { ticker: "ATO",  sector: "XLU", tier: 2 },
  { ticker: "AWK",  sector: "XLU", tier: 2 },
  { ticker: "CNP",  sector: "XLU", tier: 2 },
  { ticker: "D",    sector: "XLU", tier: 2 },
  { ticker: "EIX",  sector: "XLU", tier: 2 },
  { ticker: "ES",   sector: "XLU", tier: 2 },
  { ticker: "EXC",  sector: "XLU", tier: 2 },
  { ticker: "FE",   sector: "XLU", tier: 2 },
  { ticker: "LNT",  sector: "XLU", tier: 2 },
  { ticker: "NI",   sector: "XLU", tier: 2 },
  { ticker: "NRG",  sector: "XLU", tier: 2 },
  { ticker: "PCG",  sector: "XLU", tier: 2 },
  { ticker: "PPL",  sector: "XLU", tier: 2 },
  { ticker: "XEL",  sector: "XLU", tier: 2 },
];

const TIER2_XLI: TickerMeta[] = [
  { ticker: "AME",  sector: "XLI", tier: 2 },
  { ticker: "BA",   sector: "XLI", tier: 2 },
  { ticker: "CAT",  sector: "XLI", tier: 2 },
  { ticker: "CTAS", sector: "XLI", tier: 2 },
  { ticker: "EMR",  sector: "XLI", tier: 2 },
  { ticker: "ETN",  sector: "XLI", tier: 2 },
  { ticker: "FDX",  sector: "XLI", tier: 2 },
  { ticker: "GE",   sector: "XLI", tier: 2 },
  { ticker: "GWW",  sector: "XLI", tier: 2 },
  { ticker: "ITW",  sector: "XLI", tier: 2 },
  { ticker: "MMM",  sector: "XLI", tier: 2 },
  { ticker: "NOC",  sector: "XLI", tier: 2 },
  { ticker: "PH",   sector: "XLI", tier: 2 },
  { ticker: "RTX",  sector: "XLI", tier: 2 },
  { ticker: "UNP",  sector: "XLI", tier: 2 },
  { ticker: "UPS",  sector: "XLI", tier: 2 },
  { ticker: "WAB",  sector: "XLI", tier: 2 },
];

const TIER2_XLP: TickerMeta[] = [
  { ticker: "CL",   sector: "XLP", tier: 2 },
  { ticker: "CLX",  sector: "XLP", tier: 2 },
  { ticker: "GIS",  sector: "XLP", tier: 2 },
  { ticker: "HRL",  sector: "XLP", tier: 2 },
  { ticker: "HSY",  sector: "XLP", tier: 2 },
  { ticker: "K",    sector: "XLP", tier: 2 },
  { ticker: "KHC",  sector: "XLP", tier: 2 },
  { ticker: "KMB",  sector: "XLP", tier: 2 },
  { ticker: "KO",   sector: "XLP", tier: 2 },
  { ticker: "MDLZ", sector: "XLP", tier: 2 },
  { ticker: "PEP",  sector: "XLP", tier: 2 },
  { ticker: "PM",   sector: "XLP", tier: 2 },
  { ticker: "SYY",  sector: "XLP", tier: 2 },
  { ticker: "TSN",  sector: "XLP", tier: 2 },
  { ticker: "WMT",  sector: "XLP", tier: 2 },
];

const TIER2_XLE: TickerMeta[] = [
  { ticker: "APA",  sector: "XLE", tier: 2 },
  { ticker: "BKR",  sector: "XLE", tier: 2 },
  { ticker: "COP",  sector: "XLE", tier: 2 },
  { ticker: "CVX",  sector: "XLE", tier: 2 },
  { ticker: "FANG", sector: "XLE", tier: 2 },
  { ticker: "HAL",  sector: "XLE", tier: 2 },
  { ticker: "HES",  sector: "XLE", tier: 2 },
  { ticker: "MPC",  sector: "XLE", tier: 2 },
  { ticker: "MRO",  sector: "XLE", tier: 2 },
  { ticker: "OKE",  sector: "XLE", tier: 2 },
  { ticker: "OXY",  sector: "XLE", tier: 2 },
  { ticker: "PSX",  sector: "XLE", tier: 2 },
  { ticker: "SLB",  sector: "XLE", tier: 2 },
  { ticker: "VLO",  sector: "XLE", tier: 2 },
  { ticker: "WMB",  sector: "XLE", tier: 2 },
  { ticker: "XOM",  sector: "XLE", tier: 2 },
];

// --- NEW SECTORS (added 2026-04-25) ---

const TIER2_XLF: TickerMeta[] = [
  { ticker: "JPM",  sector: "XLF", tier: 2 },
  { ticker: "BAC",  sector: "XLF", tier: 2 },
  { ticker: "WFC",  sector: "XLF", tier: 2 },
  { ticker: "GS",   sector: "XLF", tier: 2 },
  { ticker: "MS",   sector: "XLF", tier: 2 },
  { ticker: "BLK",  sector: "XLF", tier: 2 },
  { ticker: "AXP",  sector: "XLF", tier: 2 },
  { ticker: "COF",  sector: "XLF", tier: 2 },
  { ticker: "USB",  sector: "XLF", tier: 2 },
  { ticker: "TFC",  sector: "XLF", tier: 2 },
  { ticker: "PNC",  sector: "XLF", tier: 2 },
  { ticker: "SCHW", sector: "XLF", tier: 2 },
  { ticker: "CB",   sector: "XLF", tier: 2 },
  { ticker: "MET",  sector: "XLF", tier: 2 },
  { ticker: "PRU",  sector: "XLF", tier: 2 },
  { ticker: "AIG",  sector: "XLF", tier: 2 },
  { ticker: "AFL",  sector: "XLF", tier: 2 },
  { ticker: "ALL",  sector: "XLF", tier: 2 },
  { ticker: "ICE",  sector: "XLF", tier: 2 },
  { ticker: "CME",  sector: "XLF", tier: 2 },
];

const TIER2_XLV: TickerMeta[] = [
  { ticker: "JNJ",  sector: "XLV", tier: 2 },
  { ticker: "UNH",  sector: "XLV", tier: 2 },
  { ticker: "LLY",  sector: "XLV", tier: 2 },
  { ticker: "ABBV", sector: "XLV", tier: 2 },
  { ticker: "MRK",  sector: "XLV", tier: 2 },
  { ticker: "BMY",  sector: "XLV", tier: 2 },
  { ticker: "PFE",  sector: "XLV", tier: 2 },
  { ticker: "AMGN", sector: "XLV", tier: 2 },
  { ticker: "GILD", sector: "XLV", tier: 2 },
  { ticker: "CVS",  sector: "XLV", tier: 2 },
  { ticker: "CI",   sector: "XLV", tier: 2 },
  { ticker: "HUM",  sector: "XLV", tier: 2 },
  { ticker: "ELV",  sector: "XLV", tier: 2 },
  { ticker: "MDT",  sector: "XLV", tier: 2 },
  { ticker: "ABT",  sector: "XLV", tier: 2 },
  { ticker: "SYK",  sector: "XLV", tier: 2 },
  { ticker: "BSX",  sector: "XLV", tier: 2 },
  { ticker: "ZTS",  sector: "XLV", tier: 2 },
  { ticker: "ISRG", sector: "XLV", tier: 2 },
  { ticker: "BDX",  sector: "XLV", tier: 2 },
];

const TIER2_XLB: TickerMeta[] = [
  { ticker: "LIN",  sector: "XLB", tier: 2 },
  { ticker: "APD",  sector: "XLB", tier: 2 },
  { ticker: "SHW",  sector: "XLB", tier: 2 },
  { ticker: "ECL",  sector: "XLB", tier: 2 },
  { ticker: "FCX",  sector: "XLB", tier: 2 },
  { ticker: "NEM",  sector: "XLB", tier: 2 },
  { ticker: "NUE",  sector: "XLB", tier: 2 },
  { ticker: "VMC",  sector: "XLB", tier: 2 },
  { ticker: "MLM",  sector: "XLB", tier: 2 },
  { ticker: "DOW",  sector: "XLB", tier: 2 },
  { ticker: "LYB",  sector: "XLB", tier: 2 },
  { ticker: "EMN",  sector: "XLB", tier: 2 },
  { ticker: "PPG",  sector: "XLB", tier: 2 },
  { ticker: "ALB",  sector: "XLB", tier: 2 },
  { ticker: "IFF",  sector: "XLB", tier: 2 },
  { ticker: "CF",   sector: "XLB", tier: 2 },
  { ticker: "MOS",  sector: "XLB", tier: 2 },
  { ticker: "STLD", sector: "XLB", tier: 2 },
  { ticker: "RS",   sector: "XLB", tier: 2 },
  { ticker: "RPM",  sector: "XLB", tier: 2 },
];

const TIER2_XLY: TickerMeta[] = [
  { ticker: "AMZN", sector: "XLY", tier: 2 },
  { ticker: "TSLA", sector: "XLY", tier: 2 },
  { ticker: "HD",   sector: "XLY", tier: 2 },
  { ticker: "MCD",  sector: "XLY", tier: 2 },
  { ticker: "NKE",  sector: "XLY", tier: 2 },
  { ticker: "LOW",  sector: "XLY", tier: 2 },
  { ticker: "SBUX", sector: "XLY", tier: 2 },
  { ticker: "TJX",  sector: "XLY", tier: 2 },
  { ticker: "BKNG", sector: "XLY", tier: 2 },
  { ticker: "GM",   sector: "XLY", tier: 2 },
  { ticker: "F",    sector: "XLY", tier: 2 },
  { ticker: "ORLY", sector: "XLY", tier: 2 },
  { ticker: "AZO",  sector: "XLY", tier: 2 },
  { ticker: "ROST", sector: "XLY", tier: 2 },
  { ticker: "YUM",  sector: "XLY", tier: 2 },
  { ticker: "DHI",  sector: "XLY", tier: 2 },
  { ticker: "LEN",  sector: "XLY", tier: 2 },
  { ticker: "PHM",  sector: "XLY", tier: 2 },
  { ticker: "DRI",  sector: "XLY", tier: 2 },
  { ticker: "MAR",  sector: "XLY", tier: 2 },
];

// --- NEW SECTORS batch 2 (added 2026-04-25) ---
const TIER2_XLK: TickerMeta[] = [
  { ticker: "NVDA",  sector: "XLK", tier: 2 },
  { ticker: "AAPL",  sector: "XLK", tier: 2 },
  { ticker: "MSFT",  sector: "XLK", tier: 2 },
  { ticker: "AVGO",  sector: "XLK", tier: 2 },
  { ticker: "MU",    sector: "XLK", tier: 2 },
  { ticker: "AMD",   sector: "XLK", tier: 2 },
  { ticker: "CSCO",  sector: "XLK", tier: 2 },
  { ticker: "PLTR",  sector: "XLK", tier: 2 },
  { ticker: "LRCX",  sector: "XLK", tier: 2 },
  { ticker: "AMAT",  sector: "XLK", tier: 2 },
  { ticker: "INTC",  sector: "XLK", tier: 2 },
  { ticker: "ORCL",  sector: "XLK", tier: 2 },
  { ticker: "TXN",   sector: "XLK", tier: 2 },
  { ticker: "KLAC",  sector: "XLK", tier: 2 },
  { ticker: "IBM",   sector: "XLK", tier: 2 },
  { ticker: "ADI",   sector: "XLK", tier: 2 },
  { ticker: "APH",   sector: "XLK", tier: 2 },
  { ticker: "ANET",  sector: "XLK", tier: 2 },
  { ticker: "CRM",   sector: "XLK", tier: 2 },
  { ticker: "QCOM",  sector: "XLK", tier: 2 },
];

const TIER2_XLC: TickerMeta[] = [
  { ticker: "META",  sector: "XLC", tier: 2 },
  { ticker: "GOOGL", sector: "XLC", tier: 2 },
  { ticker: "GOOG",  sector: "XLC", tier: 2 },
  { ticker: "DIS",   sector: "XLC", tier: 2 },
  { ticker: "CMCSA", sector: "XLC", tier: 2 },
  { ticker: "CHTR",  sector: "XLC", tier: 2 },
  { ticker: "TTWO",  sector: "XLC", tier: 2 },
  { ticker: "SATS",  sector: "XLC", tier: 2 },
  { ticker: "LYV",   sector: "XLC", tier: 2 },
  { ticker: "OMC",   sector: "XLC", tier: 2 },
  { ticker: "EA",    sector: "XLC", tier: 2 },
  { ticker: "NFLX",  sector: "XLC", tier: 2 },
  { ticker: "WBD",   sector: "XLC", tier: 2 },
  { ticker: "VZ",    sector: "XLC", tier: 2 },
  { ticker: "T",     sector: "XLC", tier: 2 },
  { ticker: "TMUS",  sector: "XLC", tier: 2 },
  { ticker: "TKO",   sector: "XLC", tier: 2 },
  { ticker: "FOXA",  sector: "XLC", tier: 2 },
  { ticker: "TTD",   sector: "XLC", tier: 2 },
  { ticker: "NWSA",  sector: "XLC", tier: 2 },
];

const TIER2_XLRE: TickerMeta[] = [
  { ticker: "WELL",  sector: "XLRE", tier: 2 },
  { ticker: "PLD",   sector: "XLRE", tier: 2 },
  { ticker: "EQIX",  sector: "XLRE", tier: 2 },
  { ticker: "AMT",   sector: "XLRE", tier: 2 },
  { ticker: "DLR",   sector: "XLRE", tier: 2 },
  { ticker: "SPG",   sector: "XLRE", tier: 2 },
  { ticker: "CBRE",  sector: "XLRE", tier: 2 },
  { ticker: "PSA",   sector: "XLRE", tier: 2 },
  { ticker: "O",     sector: "XLRE", tier: 2 },
  { ticker: "VTR",   sector: "XLRE", tier: 2 },
  { ticker: "CCI",   sector: "XLRE", tier: 2 },
  { ticker: "IRM",   sector: "XLRE", tier: 2 },
  { ticker: "VICI",  sector: "XLRE", tier: 2 },
  { ticker: "EXR",   sector: "XLRE", tier: 2 },
  { ticker: "AVB",   sector: "XLRE", tier: 2 },
  { ticker: "SBAC",  sector: "XLRE", tier: 2 },
  { ticker: "EQR",   sector: "XLRE", tier: 2 },
  { ticker: "WY",    sector: "XLRE", tier: 2 },
  { ticker: "ESS",   sector: "XLRE", tier: 2 },
  { ticker: "KIM",   sector: "XLRE", tier: 2 },
];

export const UNIVERSE: TickerMeta[] = [
  ...TIER1,
  ...TIER2_XLU,
  ...TIER2_XLI,
  ...TIER2_XLP,
  ...TIER2_XLE,
  ...TIER2_XLF,
  ...TIER2_XLV,
  ...TIER2_XLB,
  ...TIER2_XLY,
  ...TIER2_XLK,
  ...TIER2_XLC,
  ...TIER2_XLRE,
];

// Expansion schedule: add these weekly, in order, starting week 2
export const EXPANSION_SCHEDULE: { week: number; tickers: string[]; sector: string }[] = [
  { week: 2, sector: "XLU", tickers: ["FTS", "AQN", "EVRG", "PNW", "OGE", "SR", "NWE", "OTTR", "POR", "AVA"] },
  { week: 3, sector: "XLI", tickers: ["CARR", "OTIS", "TT", "XYL", "GNRC", "FBHS", "MAS", "ALLE", "IR", "HUBB"] },
  { week: 4, sector: "XLP", tickers: ["CHD", "EL", "COTY", "SJM", "CAG", "CPB", "MKC", "TAP", "BF.B", "INGR"] },
  { week: 5, sector: "XLE", tickers: ["DVN", "EOG", "CTRA", "PXD", "MUR", "RRC", "AR", "SM", "PDCE", "PR"] },
];

export function getUniverseTickers(tierFilter?: 1 | 2): string[] {
  const tickers = tierFilter
    ? UNIVERSE.filter((t) => t.tier === tierFilter).map((t) => t.ticker)
    : UNIVERSE.map((t) => t.ticker);
  return [...new Set(tickers)]; // deduplicate
}

export function getMetaForTicker(ticker: string): TickerMeta | undefined {
  return UNIVERSE.find((t) => t.ticker === ticker);
}
