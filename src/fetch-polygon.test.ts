import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPolygonAggsUrl, fetchWeeklyFromPolygon } from "./fetch-polygon.js";

describe("Polygon weekly fetch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.POLYGON_API_KEY;
  });

  it("requests sort=desc so the free-tier 104-row cap cannot drop the newest bar (2026-W37)", () => {
    process.env.POLYGON_API_KEY = "k";
    const url = buildPolygonAggsUrl(
      "MLM",
      new Date("2024-09-12T00:00:00Z"),
      new Date("2026-09-12T00:00:00Z"),
    );
    expect(url).toContain("/range/1/week/2024-09-12/2026-09-12?");
    expect(url).toContain("sort=desc");
    expect(url).not.toContain("sort=asc");
  });

  it("returns bars ascending and Friday-keyed even though the API answers descending", async () => {
    process.env.POLYGON_API_KEY = "k";
    const sun = (d: string) => new Date(`${d}T00:00:00Z`).getTime();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "DELAYED",
          resultsCount: 2,
          results: [
            { t: sun("2026-09-06"), o: 1, h: 2, l: 1, c: 509.96, v: 10 },
            { t: sun("2026-08-30"), o: 1, h: 2, l: 1, c: 514.77, v: 10 },
          ],
        }),
        { status: 200 },
      ),
    );
    const bars = await fetchWeeklyFromPolygon("MLM");
    expect(bars.map((b) => `${b.date}:${b.close}`)).toEqual([
      "2026-09-04:514.77",
      "2026-09-11:509.96",
    ]);
  });
});
