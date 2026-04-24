/**
 * time.ts — TZ-explicit week labeling.
 *
 * `new Date()` + `getDay()` / `setDate()` operate in the process's local
 * timezone. If the systemd unit doesn't pin TZ=America/Mexico_City, a
 * Friday 18:00 MX run executed in winter UTC (Saturday 00:00Z) computes
 * an ISO week that has already rolled over. This module forces the
 * calendar arithmetic through the configured TZ regardless of the
 * process's `TZ` env var.
 */

export const DEFAULT_TZ = "America/Mexico_City";

/**
 * Extract year / month / day / weekday in the given IANA timezone.
 * Uses Intl.DateTimeFormat rather than Date.getUTC* / getHours to
 * sidestep TZ-env-dependent behavior.
 */
function partsInTz(
  date: Date,
  timeZone: string,
): { year: number; month: number; day: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = fmt.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const weekday = weekdayMap[map.weekday];
  if (weekday === undefined) {
    // Fail loud — silently defaulting to Sunday would shift every ISO
    // week calculation and is invisible in the output.
    throw new Error(
      `Intl.DateTimeFormat did not emit a recognized weekday for ${timeZone} / ${date.toISOString()} (got: ${JSON.stringify(map.weekday)})`,
    );
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    weekday,
  };
}

/**
 * ISO 8601 week label (e.g., "2026-W17") for the given instant, computed
 * relative to the given timezone. Exported `getWeekLabel()` defaults to
 * America/Mexico_City per project convention.
 *
 * ISO rule: the week belongs to the year of its Thursday; week 1 is the
 * one containing Jan 4.
 */
export function getWeekLabel(
  now: Date = new Date(),
  timeZone: string = DEFAULT_TZ,
): string {
  const { year, month, day, weekday } = partsInTz(now, timeZone);

  // Build a UTC Date at 00:00Z on the TZ-local Y-M-D so arithmetic is
  // TZ-independent from here on. (We only need date math, not times.)
  const local = new Date(Date.UTC(year, month - 1, day));

  // Shift to the Thursday of the ISO week (ISO weeks start Monday;
  // ISO weekday: Mon=1..Sun=7. Our `weekday` is 0=Sun..6=Sat; convert.)
  const isoWeekday = weekday === 0 ? 7 : weekday;
  const thursday = new Date(local);
  thursday.setUTCDate(local.getUTCDate() + 4 - isoWeekday);

  const isoYear = thursday.getUTCFullYear();
  const week1 = new Date(Date.UTC(isoYear, 0, 4));
  const week1Weekday = week1.getUTCDay() === 0 ? 7 : week1.getUTCDay();
  const week1Monday = new Date(week1);
  week1Monday.setUTCDate(week1.getUTCDate() - week1Weekday + 1);

  const weekNum =
    Math.round(
      (thursday.getTime() - week1Monday.getTime()) / (7 * 24 * 3600 * 1000),
    ) + 1;

  return `${isoYear}-W${String(weekNum).padStart(2, "0")}`;
}
