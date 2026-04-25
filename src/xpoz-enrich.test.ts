import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { enrichS2Tickers } from "./xpoz-enrich.js";

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.XPOZ_API_TOKEN = "test-token";
  process.env.XPOZ_BASE_URL = "http://127.0.0.1:8086";
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe("enrichS2Tickers", () => {
  it("returns all-NONE and skips HTTP when XPOZ_API_TOKEN is unset", async () => {
    delete process.env.XPOZ_API_TOKEN;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const out = await enrichS2Tickers(["AAPL", "TSLA"]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(out).toEqual([
      { ticker: "AAPL", confluence: "NONE", posts: 0, topPost: "" },
      { ticker: "TSLA", confluence: "NONE", posts: 0, topPost: "" },
    ]);
  });

  it("POSTs to /search/keyword with X-Xpoz-Token header and classifies MED", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          keyword: "AAPL",
          postCount: 7,
          topPost: {
            title: "AAPL rips on earnings",
            score: 88,
            subreddit: "stocks",
            url: "u",
          },
          posts: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const out = await enrichS2Tickers(["AAPL"]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:8086/search/keyword");
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Xpoz-Token"]).toBe("test-token");
    expect(init.method).toBe("POST");
    expect(out[0]).toEqual({
      ticker: "AAPL",
      confluence: "MED",
      posts: 7,
      topPost: "AAPL rips on earnings",
    });
  });

  it("throws loudly on 401 so scheduler logs config faults", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Unauthorized", { status: 401 }),
    );
    // Match on the status code, not the exact phrasing — the message is
    // operator-facing copy and could be rephrased without changing the
    // contract (loud throw on 4xx).
    await expect(enrichS2Tickers(["AAPL"])).rejects.toThrow(/401/);
  });

  it("treats 5xx as transient — returns NONE for that ticker and keeps going", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce(
      new Response("bad gateway", { status: 502 }),
    );
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          keyword: "TSLA",
          postCount: 25,
          topPost: { title: "TSLA", score: 10, subreddit: "stocks", url: "u" },
          posts: [],
        }),
        { status: 200 },
      ),
    );
    const out = await enrichS2Tickers(["AAPL", "TSLA"]);
    expect(out[0].confluence).toBe("NONE");
    expect(out[0].posts).toBe(0);
    expect(out[1].confluence).toBe("HIGH");
    expect(out[1].posts).toBe(25);
  });
});
