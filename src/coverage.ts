/**
 * Bar-coverage guard for the weekly pipeline.
 *
 * 2026-W37 (2026-09-11): Polygon had not published the Friday weekly bar for
 * 385 of 387 tickers when the 18:00 MX fetch ran. The scan silently re-used
 * every ticker's previous bar, so the "W37" Journal was a re-scan of W36 data
 * and its scorecard measured the prior week's interval. This module answers
 * one question BEFORE anything is scanned or published: which tickers carry a
 * bar from the week being scanned?
 *
 * A bar "belongs" to the scan week when it falls in the same ISO week
 * (Mon..Sun) as the week label. Holiday-shortened weeks (AV era keyed them by
 * their last trading day, e.g. Thursday) therefore still count.
 */

/** Monday (YYYY-MM-DD) of the ISO week containing a YYYY-MM-DD date. */
export function isoWeekMonday(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Monday (YYYY-MM-DD) of an ISO week label such as "2026-W37". */
export function weekLabelMonday(weekLabel: string): string {
  const m = /^(\d{4})-W(\d{2})$/.exec(weekLabel);
  if (!m) throw new Error(`invalid week label: ${weekLabel}`);
  const isoYear = parseInt(m[1], 10);
  const weekNum = parseInt(m[2], 10);
  // ISO week 1 contains Jan 4.
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7));
  week1Monday.setUTCDate(week1Monday.getUTCDate() + (weekNum - 1) * 7);
  return week1Monday.toISOString().slice(0, 10);
}

export interface BarCoverage {
  /** Monday of the scan week — the identity of the expected bar. */
  expectedWeekMonday: string;
  /** Tickers whose latest bar is in the scan week. */
  covered: string[];
  /** Tickers whose latest bar is older than the scan week (or missing). */
  lagging: string[];
  /** covered / (covered + lagging); 0 when the universe is empty. */
  ratio: number;
}

/**
 * @param lastBarDate  ticker -> latest bar date in radar.db (null = no bars)
 * @param weekLabel    the week being scanned, e.g. "2026-W37"
 * @param today        YYYY-MM-DD (UTC) — a bar dated AFTER today is the
 *                     in-progress week labelled with its upcoming Friday
 *                     (mid-week ad-hoc run): a partial bar, counted as lagging.
 */
export function barCoverage(
  lastBarDate: ReadonlyMap<string, string | null>,
  weekLabel: string,
  today: string = new Date().toISOString().slice(0, 10),
): BarCoverage {
  const expectedWeekMonday = weekLabelMonday(weekLabel);
  const covered: string[] = [];
  const lagging: string[] = [];
  for (const [ticker, date] of lastBarDate) {
    if (date && date <= today && isoWeekMonday(date) === expectedWeekMonday)
      covered.push(ticker);
    else lagging.push(ticker);
  }
  const total = covered.length + lagging.length;
  return {
    expectedWeekMonday,
    covered,
    lagging,
    ratio: total === 0 ? 0 : covered.length / total,
  };
}
