/**
 * data.ts — Alpha Vantage weekly data fetcher
 * Returns sorted weekly candles (oldest → newest)
 */

const API_KEY = process.env.AV_API_KEY ?? "";
if (!API_KEY) throw new Error("AV_API_KEY environment variable is required");
const BASE_URL = "https://www.alphavantage.co/query";

export interface WeeklyCandle {
  date: string;       // YYYY-MM-DD (week ending date)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  midpoint: number;   // (high + low) / 2 — Williams uses this, NOT close
}

export async function fetchWeeklyData(ticker: string): Promise<WeeklyCandle[]> {
  const url = `${BASE_URL}?function=TIME_SERIES_WEEKLY_ADJUSTED&symbol=${ticker}&apikey=${API_KEY}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${ticker}`);

  const json = await res.json() as Record<string, unknown>;

  // Rate limit / error check
  if ("Note" in json) throw new Error(`Alpha Vantage rate limit: ${json["Note"]}`);
  if ("Information" in json) throw new Error(`Alpha Vantage info: ${json["Information"]}`);

  const series = json["Weekly Adjusted Time Series"] as Record<string, Record<string, string>>;
  if (!series) throw new Error(`No weekly data for ${ticker}`);

  const candles: WeeklyCandle[] = Object.entries(series)
    .map(([date, bar]) => {
      const high = parseFloat(bar["2. high"]);
      const low = parseFloat(bar["3. low"]);
      return {
        date,
        open: parseFloat(bar["1. open"]),
        high,
        low,
        close: parseFloat(bar["5. adjusted close"]),
        volume: parseInt(bar["6. volume"], 10),
        midpoint: (high + low) / 2,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date)); // oldest first

  return candles;
}
