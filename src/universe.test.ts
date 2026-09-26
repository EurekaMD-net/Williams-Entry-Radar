import { describe, it, expect } from "vitest";
import { UNIVERSE, getUniverseTickers } from "./universe.js";

describe("UNIVERSE", () => {
  it("lists every ticker exactly once", () => {
    const seen = new Set<string>();
    const dupes = UNIVERSE.map((t) => t.ticker).filter((t) =>
      seen.has(t) ? true : (seen.add(t), false),
    );
    expect(dupes).toEqual([]);
  });

  // Every ticker named in a "removed" retirement comment in universe.ts
  // (AMGN/GILD are dedupes, still listed under XLV, so not here).
  const RETIRED = [
    "APGE", "PARA", "SAGE", "K", "HES", "MRO", "CTRA", "CHK", "HOLX", "SEE",
    "SATS", "EA", "IPG", "IAC", "AVB", "EQR", "EXAS", "SGEN", "APLS", "NUVL",
    "FOLD", "BPMC",
  ];

  it("contains no retired ticker", () => {
    const universe = new Set(getUniverseTickers());
    expect(RETIRED.filter((t) => universe.has(t))).toEqual([]);
  });
});
