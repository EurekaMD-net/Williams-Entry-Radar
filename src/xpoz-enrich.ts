/**
 * xpoz-enrich.ts — Reddit confluence enrichment for S2 tickers via Xpoz.
 *
 * Routes every ticker through the local xpoz-intelligence-pipeline service
 * (http://127.0.0.1:8086/search/keyword). That service owns the bearer token
 * for mcp.xpoz.ai and handles the MCP JSON-RPC + SSE + async polling protocol.
 *
 * The old code path (direct REST to https://api.xpoz.io/v1/reddit/search) was
 * broken from day one — that URL never existed; Xpoz's real surface is an MCP
 * server at mcp.xpoz.ai. Every Friday 18:00 run hit 4xx and either aborted
 * the batch (when XPOZ_API_KEY was set) or returned all-NONE silently.
 *
 * Behavior summary:
 *   - XPOZ_API_TOKEN not set → skip enrichment silently (each ticker returns
 *     confluence: "NONE").
 *   - Token set + 4xx response → treat as a configuration fault (wrong token,
 *     service down, route changed) and THROW so the scheduler logs it loudly.
 *     Silent "0 posts" results misrepresent the signal and bleed into
 *     downstream confluence tables.
 *   - Token set + 5xx / 502 / network / parse error → log and return
 *     confluence: "NONE" for that ticker; other tickers keep going.
 */

import { escapeMd } from "./notify.js";

export type Confluence = "HIGH" | "MED" | "LOW" | "NONE";

export interface XpozResult {
  ticker: string;
  confluence: Confluence;
  posts: number;
  topPost: string;
}

const XPOZ_BASE_DEFAULT = "http://127.0.0.1:8086";
const SEARCH_LIMIT = 25;

const HIGH_THRESHOLD = 20;
const MED_THRESHOLD = 5;

function getToken(): string | null {
  const t = process.env.XPOZ_API_TOKEN ?? "";
  return t ? t : null;
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

interface SearchResponse {
  keyword: string;
  postCount: number;
  topPost: {
    title: string;
    score: number;
    subreddit: string;
    url: string;
  } | null;
  posts: Array<{
    title: string;
    score: number;
    subreddit: string;
    url: string;
    createdUtc: number;
  }>;
}

async function searchTicker(
  ticker: string,
  token: string,
): Promise<{ posts: number; topPost: string }> {
  const url = `${getBase()}/search/keyword`;

  // Client-side ceiling = server cap (90s) + 5s connection/headers slack.
  // Without this, a TCP-accept-but-no-response server (tsx mid-restart, GC
  // stall, kernel pause) would hang fetch forever and freeze the batch.
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Xpoz-Token": token,
    },
    body: JSON.stringify({ keyword: ticker, limit: SEARCH_LIMIT }),
    signal: AbortSignal.timeout(95_000),
  });

  // 4xx = config fault. Fail loud — do NOT silently classify as NONE.
  if (res.status >= 400 && res.status < 500) {
    const body = await res.text().catch(() => "(no body)");
    throw new Error(
      `Xpoz ${res.status} for ${ticker}: ${body.slice(0, 200)}. Check XPOZ_API_TOKEN and XPOZ_BASE_URL.`,
    );
  }
  if (!res.ok) {
    console.warn(
      `[xpoz] ${ticker}: HTTP ${res.status} (transient, treating as 0 posts)`,
    );
    return { posts: 0, topPost: "" };
  }

  const data = (await res.json()) as SearchResponse;
  return {
    posts: data.postCount ?? 0,
    topPost: data.topPost?.title ?? "",
  };
}

/**
 * Enrich a list of S2 tickers with Reddit confluence data.
 * Returns one XpozResult per ticker, in the same order.
 *
 * Never throws for a missing token — that's an expected "enrichment off"
 * state, not a failure. Throws on 4xx responses when a token IS set,
 * because a token misconfiguration should surface loudly rather than
 * silently downgrade to "0 posts" across every S2 ticker.
 */
export async function enrichS2Tickers(
  tickers: string[],
): Promise<XpozResult[]> {
  const token = getToken();
  if (!token) {
    console.log("[xpoz] XPOZ_API_TOKEN not set — skipping enrichment");
    return tickers.map((ticker) => ({
      ticker,
      confluence: "NONE",
      posts: 0,
      topPost: "",
    }));
  }

  console.log(
    `[xpoz] Enriching ${tickers.length} S2 ticker(s) via ${getBase()}: ${tickers.join(", ")}`,
  );
  const results: XpozResult[] = [];

  for (const ticker of tickers) {
    try {
      const { posts, topPost } = await searchTicker(ticker, token);
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
    // Small delay between calls so we don't pile requests onto the MCP layer.
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
