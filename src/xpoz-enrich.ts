/**
 * xpoz-enrich.ts — Reddit sentiment enrichment for S2 tickers via Xpoz API
 *
 * Only called when S2 signals are active.
 * Uses keyword search by ticker + company name in finance-focused subreddits.
 *
 * API key: env var XPOZ_API_KEY
 * Endpoint: https://api.xpoz.io (same pattern as reddit-scraper-tool)
 *
 * Output per ticker:
 *   { ticker, confluence: HIGH | MED | LOW | NONE, posts: number, topPost: string }
 */

export type Confluence = "HIGH" | "MED" | "LOW" | "NONE";

export interface XpozResult {
  ticker: string;
  confluence: Confluence;
  posts: number;
  topPost: string;
  sentiment: string; // "bullish" | "bearish" | "neutral" | "mixed"
}

const XPOZ_API_KEY = process.env.XPOZ_API_KEY ?? "";
// NOTE: The Xpoz REST API base URL and endpoint paths below are placeholders.
// The production Xpoz integration uses an MCP server (not direct HTTP).
// Before activating enrichment, verify the correct REST endpoint with the Xpoz MCP server config.
// The module fails gracefully when XPOZ_API_KEY is not set — enrichment is skipped silently.
const XPOZ_BASE = process.env.XPOZ_BASE_URL ?? "https://api.xpoz.io";

// Finance subreddits — focused to avoid noise
const TARGET_SUBREDDITS = [
  "investing",
  "stocks",
  "dividends",
  "ValueInvesting",
  "StockMarket",
];

// Confidence thresholds
const HIGH_THRESHOLD = 20;
const MED_THRESHOLD = 5;

function classifyConfluence(posts: number): Confluence {
  if (posts >= HIGH_THRESHOLD) return "HIGH";
  if (posts >= MED_THRESHOLD) return "MED";
  if (posts > 0) return "LOW";
  return "NONE";
}

/**
 * Search Reddit for mentions of a ticker in the last 2 weeks.
 * Returns post count + top post title.
 */
async function searchTicker(ticker: string): Promise<{ posts: number; topPost: string; sentiment: string }> {
  if (!XPOZ_API_KEY) {
    return { posts: 0, topPost: "", sentiment: "neutral" };
  }

  const query = ticker; // simple ticker symbol — specific enough for finance subs
  const url = `${XPOZ_BASE}/v1/reddit/search`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": XPOZ_API_KEY,
      },
      body: JSON.stringify({
        keywords: [query],
        subreddits: TARGET_SUBREDDITS,
        timeframe: "2w",
        limit: 25,
        responseType: "sync",
      }),
    });

    if (!res.ok) {
      console.warn(`[xpoz] ${ticker}: HTTP ${res.status}`);
      return { posts: 0, topPost: "", sentiment: "neutral" };
    }

    const data = await res.json() as {
      results?: Array<{ title?: string; score?: number; subreddit?: string }>;
      operationId?: string;
      status?: string;
    };

    // Handle async response (polling)
    if (data.operationId) {
      const result = await pollOperation(data.operationId);
      const posts = result?.results?.length ?? 0;
      const topPost = result?.results?.[0]?.title ?? "";
      return { posts, topPost, sentiment: "neutral" };
    }

    const posts = data.results?.length ?? 0;
    const topPost = data.results?.[0]?.title ?? "";
    return { posts, topPost, sentiment: "neutral" };
  } catch (err) {
    console.warn(`[xpoz] ${ticker}: ${(err as Error).message}`);
    return { posts: 0, topPost: "", sentiment: "neutral" };
  }
}

async function pollOperation(
  operationId: string,
  maxAttempts = 10,
  delayMs = 3000
): Promise<{ results?: Array<{ title?: string }> } | null> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, delayMs));
    try {
      const res = await fetch(`${XPOZ_BASE}/v1/operations/${operationId}`, {
        headers: { "X-API-Key": XPOZ_API_KEY },
      });
      if (!res.ok) continue;
      const data = await res.json() as { status?: string; results?: Array<{ title?: string }> };
      if (data.status === "success") return data;
    } catch {
      // retry
    }
  }
  return null;
}

/**
 * Enrich a list of S2 tickers with Reddit confluence data.
 * Returns one XpozResult per ticker, in the same order.
 */
export async function enrichS2Tickers(tickers: string[]): Promise<XpozResult[]> {
  if (!XPOZ_API_KEY) {
    console.log("[xpoz] XPOZ_API_KEY not set — skipping enrichment");
    return tickers.map((ticker) => ({ ticker, confluence: "NONE", posts: 0, topPost: "", sentiment: "neutral" }));
  }

  console.log(`[xpoz] Enriching ${tickers.length} S2 ticker(s): ${tickers.join(", ")}`);
  const results: XpozResult[] = [];

  for (const ticker of tickers) {
    const { posts, topPost, sentiment } = await searchTicker(ticker);
    const confluence = classifyConfluence(posts);
    results.push({ ticker, confluence, posts, topPost, sentiment });
    console.log(`[xpoz] ${ticker}: ${confluence} (${posts} posts)`);
    // Small delay between calls
    if (ticker !== tickers[tickers.length - 1]) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  return results;
}

/**
 * Format Xpoz results as Telegram-ready lines.
 */
/**
 * Escape characters that break Telegram Markdown (parse_mode=Markdown).
 */
function escapeMd(text: string): string {
  return text.replace(/[_*]/g, (c) => `\\${c}`);
}

export function formatXpozForTelegram(results: XpozResult[]): string[] {
  return results.map((r) => {
    const icon = r.confluence === "HIGH" ? "🔥" : r.confluence === "MED" ? "📊" : r.confluence === "LOW" ? "💬" : "🔇";
    const rawTop = r.topPost ? r.topPost.slice(0, 60) + (r.topPost.length > 60 ? "…" : "") : "";
    const top = rawTop ? ` — "${escapeMd(rawTop)}"` : "";
    return `${icon} \`${r.ticker}\` ${r.confluence} (${r.posts} posts)${top}`;
  });
}
