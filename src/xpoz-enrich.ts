/**
 * xpoz-enrich.ts — Reddit confluence enrichment for S2 tickers via Xpoz.
 *
 * Only called when S2 signals are active. Searches finance subreddits
 * for ticker mentions in the last 2 weeks and classifies volume as
 * HIGH / MED / LOW / NONE.
 *
 * Behavior summary:
 *   - XPOZ_API_KEY not set → skip enrichment silently (each ticker
 *     returns confluence: "NONE").
 *   - XPOZ_API_KEY set + 4xx response → treat as a configuration fault
 *     (bad key, wrong endpoint, expired plan) and THROW so the scheduler
 *     logs it loudly. Silent "0 posts" results misrepresent the signal
 *     and bleed into downstream confluence tables.
 *   - XPOZ_API_KEY set + 5xx / network / parse error → log and return
 *     confluence: "NONE" for that ticker; other tickers keep going.
 *
 * The sentiment parser is intentionally out of scope — all prior emissions
 * of `sentiment: "neutral"` regardless of API response were dead code.
 */

import { escapeMd } from "./notify.js";

export type Confluence = "HIGH" | "MED" | "LOW" | "NONE";

export interface XpozResult {
  ticker: string;
  confluence: Confluence;
  posts: number;
  topPost: string;
}

const XPOZ_BASE_DEFAULT = "https://api.xpoz.io";

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

function getApiKey(): string | null {
  const key = process.env.XPOZ_API_KEY ?? "";
  return key ? key : null;
}

function getBase(): string {
  return process.env.XPOZ_BASE_URL ?? XPOZ_BASE_DEFAULT;
}

function classifyConfluence(posts: number): Confluence {
  if (posts >= HIGH_THRESHOLD) return "HIGH";
  if (posts >= MED_THRESHOLD) return "MED";
  if (posts > 0) return "LOW";
  return "NONE";
}

async function searchTicker(
  ticker: string,
  apiKey: string,
): Promise<{ posts: number; topPost: string }> {
  const url = `${getBase()}/v1/reddit/search`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({
      keywords: [ticker],
      subreddits: TARGET_SUBREDDITS,
      timeframe: "2w",
      limit: 25,
      responseType: "sync",
    }),
  });

  // 4xx = config fault. Fail loud — do NOT silently classify as NONE.
  if (res.status >= 400 && res.status < 500) {
    const body = await res.text().catch(() => "(no body)");
    throw new Error(
      `Xpoz ${res.status} for ${ticker}: ${body.slice(0, 200)}. Check XPOZ_API_KEY and XPOZ_BASE_URL.`,
    );
  }
  if (!res.ok) {
    console.warn(
      `[xpoz] ${ticker}: HTTP ${res.status} (transient, treating as 0 posts)`,
    );
    return { posts: 0, topPost: "" };
  }

  const data = (await res.json()) as {
    results?: Array<{ title?: string; score?: number; subreddit?: string }>;
    operationId?: string;
    status?: string;
  };

  if (data.operationId) {
    const result = await pollOperation(data.operationId, apiKey);
    const posts = result?.results?.length ?? 0;
    const topPost = result?.results?.[0]?.title ?? "";
    return { posts, topPost };
  }

  const posts = data.results?.length ?? 0;
  const topPost = data.results?.[0]?.title ?? "";
  return { posts, topPost };
}

async function pollOperation(
  operationId: string,
  apiKey: string,
  maxAttempts = 10,
  delayMs = 3000,
): Promise<{ results?: Array<{ title?: string }> } | null> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, delayMs));
    try {
      const res = await fetch(`${getBase()}/v1/operations/${operationId}`, {
        headers: { "X-API-Key": apiKey },
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        status?: string;
        results?: Array<{ title?: string }>;
      };
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
 *
 * Never throws for a missing key — that's an expected "enrichment off"
 * state, not a failure. Throws on 4xx responses when a key IS set,
 * because a key misconfiguration should surface loudly rather than
 * silently downgrade to "0 posts" across every S2 ticker.
 */
export async function enrichS2Tickers(
  tickers: string[],
): Promise<XpozResult[]> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.log("[xpoz] XPOZ_API_KEY not set — skipping enrichment");
    return tickers.map((ticker) => ({
      ticker,
      confluence: "NONE",
      posts: 0,
      topPost: "",
    }));
  }

  console.log(
    `[xpoz] Enriching ${tickers.length} S2 ticker(s): ${tickers.join(", ")}`,
  );
  const results: XpozResult[] = [];

  for (const ticker of tickers) {
    try {
      const { posts, topPost } = await searchTicker(ticker, apiKey);
      const confluence = classifyConfluence(posts);
      results.push({ ticker, confluence, posts, topPost });
      console.log(`[xpoz] ${ticker}: ${confluence} (${posts} posts)`);
    } catch (err) {
      // 4xx re-raised here — stop the batch so the config error is loud.
      if (err instanceof Error && /Xpoz 4\d\d/.test(err.message)) {
        throw err;
      }
      console.warn(
        `[xpoz] ${ticker}: ${(err as Error).message} — treating as 0 posts`,
      );
      results.push({ ticker, confluence: "NONE", posts: 0, topPost: "" });
    }
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
export function formatXpozForTelegram(results: XpozResult[]): string[] {
  return results.map((r) => {
    const icon =
      r.confluence === "HIGH"
        ? "🔥"
        : r.confluence === "MED"
          ? "📊"
          : r.confluence === "LOW"
            ? "💬"
            : "🔇";
    const rawTop = r.topPost
      ? r.topPost.slice(0, 60) + (r.topPost.length > 60 ? "…" : "")
      : "";
    const top = rawTop ? ` — "${escapeMd(rawTop)}"` : "";
    return `${icon} \`${r.ticker}\` ${r.confluence} (${r.posts} posts)${top}`;
  });
}
