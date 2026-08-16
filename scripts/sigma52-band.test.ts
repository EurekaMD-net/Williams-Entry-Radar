import { describe, expect, it } from "vitest";
import { isoWeekFriday, parseSignals, renderMarkdown, sigmaBand, sortRows, Z80 } from "./sigma52-band.js";

function closes(n: number, step = 0.01): number[] {
  const out: number[] = [100];
  for (let i = 1; i < n; i++) out.push(out[i - 1] * Math.exp(i % 2 === 0 ? step : -step));
  return out;
}

describe("sigmaBand", () => {
  it("pins Z80 to the one-sided 80% z used by forecast.py", () => {
    expect(Z80).toBe(1.2816);
  });
  it("uses the last 52 log returns (ddof=1) and scales by √h around the last close", () => {
    const c = closes(120, 0.02);
    const b = sigmaBand(c, 52, 4)!;
    const rets = c.slice(-53).map((x, i, a) => (i ? Math.log(x / a[i - 1]) : NaN)).slice(1);
    const mean = rets.reduce((s, x) => s + x, 0) / rets.length;
    const sd = Math.sqrt(rets.reduce((s, x) => s + (x - mean) ** 2, 0) / (rets.length - 1));
    expect(b.sigmaW).toBeCloseTo(sd, 12);
    const last = c[c.length - 1];
    expect(b.hi).toBeCloseTo(last * Math.exp(1.2816 * sd * 2), 8);
    expect(b.lo).toBeCloseTo(last * Math.exp(-1.2816 * sd * 2), 8);
  });
  it("returns null with fewer than 40 returns and drops non-positive closes", () => {
    expect(sigmaBand(closes(30), 52, 4)).toBeNull();
    const c = closes(120);
    c[c.length - 3] = 0;
    expect(sigmaBand(c, 52, 4)).not.toBeNull();
  });
});

describe("parseSignals + sortRows + renderMarkdown", () => {
  // columns deliberately NOT in the radar CSV order — parsing must go by header name
  const csv = "signalLevel,sector,ticker,tier,x\nS1,XLK,ZZZ,1,1\nS2D,XLE,AAA,2,1\nS2,XLF,BBB,3,1\nnone,X,SPY,0,1\nS1,XLV,CCC,1,1\nconstructor,X,QQQ,0,1\n";
  it("keeps only S1/S2D/S2 by header name and orders S2 → S2D → S1 then ticker", () => {
    const rows = sortRows(parseSignals(csv));
    expect(rows.map((r) => r.ticker)).toEqual(["BBB", "AAA", "CCC", "ZZZ"]);
  });
  it("throws when ticker/signalLevel columns are missing", () => {
    expect(() => parseSignals("a,b\n1,2\n")).toThrow(/signalLevel/);
  });
  it("renders one table row per band and lists missing tickers", () => {
    const md = renderMarkdown("2026-W33", 52, 4, [{ ticker: "AAA", level: "S2D", asOf: "2026-08-14", close: 100, sigmaW: 0.05, lo: 88, hi: 113.6 }], ["QQQ"]);
    expect(md).toContain("| S2D | AAA | 2026-08-14 | 100.00 | 5.0% | −12.0% / +13.6% | 88.00 | 113.60 |");
    expect(md).toContain("Not computed (fewer than 40 weekly returns in the DB as of the week's Friday): QQQ");
    expect(md).toContain("Not a signal, not a filter");
  });
});

describe("isoWeekFriday", () => {
  it("maps ISO weeks to their Friday (radar bar date)", () => {
    expect(isoWeekFriday("2026-W33")).toBe("2026-08-14");
    expect(isoWeekFriday("2026-W01")).toBe("2026-01-02");
    expect(isoWeekFriday("2020-W53")).toBe("2021-01-01"); // ISO 2020 has 53 weeks; W53 Monday = 2020-12-28
    expect(() => isoWeekFriday("2026-W99")).toThrow();
  });
});
