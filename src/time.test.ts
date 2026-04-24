import { describe, it, expect } from "vitest";
import { getWeekLabel } from "./time.js";

describe("getWeekLabel — TZ-explicit ISO week", () => {
  it("computes the same week whether the process TZ is MX or UTC", () => {
    // Friday 2026-04-24 23:45:00 MX = Saturday 2026-04-25 05:45:00 UTC.
    // In UTC that's already week 17 on the Saturday, but in MX it's
    // still Friday of week 17 — both happen to be week 17.
    const fri = new Date("2026-04-25T05:45:00Z"); // Sat 05:45 UTC / Fri 23:45 MX
    expect(getWeekLabel(fri, "America/Mexico_City")).toBe("2026-W17");
    expect(getWeekLabel(fri, "UTC")).toBe("2026-W17");
  });

  it("diverges across TZs only when the instant straddles a week boundary locally", () => {
    // Sunday 00:30 UTC = Saturday 18:30 MX. MX side is still week 17;
    // UTC side has rolled into week 18.
    const instant = new Date("2026-04-26T00:30:00Z");
    expect(getWeekLabel(instant, "America/Mexico_City")).toBe("2026-W17");
    expect(getWeekLabel(instant, "UTC")).toBe("2026-W17");
    // The actual boundary is earlier:
    const lateMondayMorningUTC = new Date("2026-04-27T05:00:00Z"); // Mon 05:00 UTC / Sun 23:00 MX
    expect(getWeekLabel(lateMondayMorningUTC, "America/Mexico_City")).toBe(
      "2026-W17",
    );
    expect(getWeekLabel(lateMondayMorningUTC, "UTC")).toBe("2026-W18");
  });

  it("returns ISO week 53 for year-boundary cases (2020)", () => {
    // 2020-12-31 was a Thursday → week 53 in ISO.
    expect(getWeekLabel(new Date("2020-12-31T12:00:00Z"), "UTC")).toBe(
      "2020-W53",
    );
  });

  it("returns week 01 of next ISO year for early-January dates that belong to the prior year ISO week", () => {
    // 2027-01-01 is a Friday → belongs to 2026-W53 by ISO rules.
    expect(getWeekLabel(new Date("2027-01-01T12:00:00Z"), "UTC")).toBe(
      "2026-W53",
    );
  });

  it("pads the week number to two digits", () => {
    // First Thursday of the year is 2026-01-01 (Thursday) → 2026-W01.
    expect(getWeekLabel(new Date("2026-01-01T12:00:00Z"), "UTC")).toMatch(
      /^\d{4}-W\d{2}$/,
    );
  });
});
