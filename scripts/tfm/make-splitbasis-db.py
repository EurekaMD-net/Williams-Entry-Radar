#!/opt/timesfm/bin/python
"""Build a BACKTEST COPY of radar.db on Polygon's split-only basis (Fase 1 seam-free re-test).

radar.db mixes two bases: rows written by Alpha Vantage carry a split+dividend-ADJUSTED close and RAW
open/high/low; rows written by Polygon (fetched_at >= 2026-07-14, within that fetch's 2-year window)
are split-adjusted on every field. This script copies radar.db and rewrites the AV rows:

  close_split(t) = close_adj(t) * G(F) / G(t)          G(x) = prod over dividends with ex-date > x of
                                                             (1 - cash / P_pre),  P_pre = RAW close of the
                                                             last bar before the ex-date (cash is as-declared);
                                                             F = the row's own fetched_at (AV adjusts to
                                                             the data available when it was fetched)
  ohlc_split(t)  = ohlc_raw(t) * SF(t)                 SF(t) = prod over splits executed after t of from/to
  volume_split   = volume_raw / SF(t)
  (+ a split executed AFTER F also rescales close_split, since AV could not have applied it)

Consistency: close_split/SF must lie inside [low_raw*0.97, high_raw*1.03]; rows outside are flagged,
counted, and NOT rewritten (left AV) so a bad dividend record cannot silently invent a price.
The production radar.db is opened read-only and never modified. Nothing under src/ is used.

  make-splitbasis-db.py --src data/radar.db --dividends results/tfm-backtest/reference/dividends.json \
      --splits results/tfm-backtest/reference/splits-all.json --out results/tfm-backtest/radar-splitbasis.db
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sqlite3
import sys
from collections import defaultdict
from datetime import date, timedelta

POLYGON_SINCE = "2026-07-14"  # first Polygon-primary write in radar.db
POLYGON_LOOKBACK_DAYS = 2 * 365 + 14  # the frozen fetcher pulls 2 years; small slack for the week label
# A correct raw close lies inside its own bar's raw [low, high]. Tolerance covers the one approximation we
# make (weekly instead of daily pre-ex close in the dividend term: ~0.01%/dividend, ~0.5% over 7 years);
# anything beyond is a missed distribution/split and is refused.
TOL_LO, TOL_HI = 0.985, 1.015


def is_polygon_row(date_s: str, fetched_at: str) -> bool:
    if fetched_at < POLYGON_SINCE:
        return False
    fetched = date.fromisoformat(fetched_at[:10])
    return date.fromisoformat(date_s) >= fetched - timedelta(days=POLYGON_LOOKBACK_DAYS)


def split_factor_fn(splits: list[dict]):
    """SF(t) = product of from/to over splits executed after t (Polygon adjusted=true convention)."""
    ss = sorted(((s["execution_date"], s["split_from"] / s["split_to"]) for s in splits), reverse=True)

    def sf(t: str) -> float:
        f = 1.0
        for ex, r in ss:
            if ex > t:
                f *= r
            else:
                break
        return f

    return sf


def convert_ticker(rows: list[dict], dividends: list[dict], splits: list[dict], today: str | None = None) -> tuple[list[dict], dict]:
    """rows asc by date: {date, open, high, low, close, volume, fetched_at}. Returns (updates, stats).

    Every row — AV or Polygon — is rescaled by the splits executed AFTER its own fetch date, so all rows land
    on one common basis (splits executed up to `today`). Announced-but-unexecuted splits are ignored.
    """
    today = today or date.today().isoformat()
    splits = [s for s in splits if s["execution_date"] <= today]
    stats = {"av_rows": 0, "converted": 0, "flagged": 0, "poly_rows": 0, "poly_rescaled": 0, "overshoot": []}
    sf = split_factor_fn(splits)
    basis = [is_polygon_row(r["date"], r["fetched_at"]) for r in rows]
    stats["poly_rows"] = sum(basis)
    stats["av_rows"] = len(rows) - stats["poly_rows"]
    if not rows:
        stats["clean_from"] = "9999-12-31"
        return [], stats

    # Walk newest → oldest accumulating dividend terms; each term (ex, 1 - cash/P_pre).
    divs = sorted((d for d in dividends if d["cash"] > 0), key=lambda d: d["ex"], reverse=True)
    terms: list[tuple[str, float]] = []  # (ex_date, factor_term), newest first
    g_running = 1.0
    di = 0
    n = len(rows)
    g_at_row = [1.0] * n  # G(date_k) = product of terms with ex > date_k
    def recent_split(f_date: str) -> float:
        """Splits executed after an AV row's fetch date — AV could not have applied them."""
        f = 1.0
        for s in splits:
            if s["execution_date"] > f_date:
                f *= s["split_from"] / s["split_to"]
        return f

    for k in range(n - 1, -1, -1):
        r = rows[k]
        next_date = rows[k + 1]["date"] if k + 1 < n else "9999-12-31"
        # dividends with ex in (date_k, next_date]: P_pre = RAW close of row k (cash_amount is as-declared,
        # pre-split), i.e. common-basis close / SF(date_k). Every row first gets the splits executed after
        # its own fetch; AV rows additionally undo the dividends known so far.
        rs = recent_split(r["fetched_at"][:10])
        p_split = r["close"] * rs if basis[k] else r["close"] * rs / g_running
        p_pre = p_split / sf(r["date"])
        while di < len(divs) and divs[di]["ex"] > r["date"]:
            if divs[di]["ex"] <= next_date or k == n - 1:
                term = 1.0 - divs[di]["cash"] / p_pre if p_pre > 0 else 1.0
                term = min(max(term, 0.5), 1.0)  # a cash/price > 50% is a data error, clamp not trust
                terms.append((divs[di]["ex"], term))
                g_running *= term
                di += 1
            else:
                break
        g_at_row[k] = g_running

    def g_after(x: str) -> float:
        f = 1.0
        for ex, term in terms:
            if ex > x:
                f *= term
            else:
                break
        return f

    updates: list[dict] = []
    flagged_dates: list[str] = []
    for k, r in enumerate(rows):
        f_date = r["fetched_at"][:10]
        rs = recent_split(f_date)
        if basis[k]:
            # Polygon row: already split-basis as of ITS fetch; a split executed after that fetch (e.g. MNST
            # 2026-08-11 between weekly fetches) must be applied to land on the common basis.
            if rs != 1.0:
                updates.append({"date": r["date"], "open": r["open"] * rs, "high": r["high"] * rs, "low": r["low"] * rs, "close": r["close"] * rs, "volume": int(round(r["volume"] / rs))})
                stats["poly_rescaled"] += 1
            continue
        g_f = g_after(f_date)
        close_split = r["close"] * g_f / g_at_row[k] * rs
        s_t = sf(r["date"])
        raw_close_est = close_split / s_t
        if not (r["low"] * TOL_LO <= raw_close_est <= r["high"] * TOL_HI):
            stats["flagged"] += 1
            flagged_dates.append(r["date"])
            continue
        # how far outside its own raw bar the reconstructed close sits (0 = inside) — reported, not hidden
        over = max(r["low"] / raw_close_est, raw_close_est / r["high"], 1.0) - 1.0
        stats["overshoot"].append(over)
        updates.append(
            {
                "date": r["date"],
                "open": r["open"] * s_t,
                "high": r["high"] * s_t,
                "low": r["low"] * s_t,
                "close": close_split,
                "volume": int(round(r["volume"] / s_t)) if s_t else r["volume"],
            }
        )
        stats["converted"] += 1
    # clean_from = first date after the LAST flagged AV row: from here on every row is single-basis
    # (converted AV, or Polygon). Tickers with no flagged rows are clean from their first bar.
    if flagged_dates:
        last_flag = max(flagged_dates)
        later = [r["date"] for r in rows if r["date"] > last_flag]
        stats["clean_from"] = later[0] if later else "9999-12-31"
    else:
        stats["clean_from"] = rows[0]["date"] if rows else "9999-12-31"
    return updates, stats


def seam_jumps(conn: sqlite3.Connection) -> int:
    return conn.execute(
        """WITH a AS (SELECT ticker, close c1 FROM weekly_bars WHERE date='2024-07-12'),
                b AS (SELECT ticker, close c2 FROM weekly_bars WHERE date='2024-07-19')
           SELECT COALESCE(SUM(CASE WHEN c2/c1 > 1.05 OR c2/c1 < 0.95 THEN 1 ELSE 0 END),0) FROM a JOIN b USING(ticker)"""
    ).fetchone()[0]


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--src", default="data/radar.db")
    p.add_argument("--dividends", required=True)
    p.add_argument("--splits", required=True, help="splits-all.json (full history for the universe)")
    p.add_argument("--out", required=True)
    p.add_argument("--today", default=date.today().isoformat(), help="splits executed after this date are ignored (announced ≠ executed)")
    args = p.parse_args(argv)

    with open(args.dividends) as fh:
        dividends = json.load(fh)
    with open(args.splits) as fh:
        splits_by: dict[str, list[dict]] = defaultdict(list)
        for s in json.load(fh)["splits"]:
            splits_by[s["ticker"]].append(s)

    src = sqlite3.connect(f"file:{args.src}?mode=ro", uri=True)
    if os.path.exists(args.out):
        os.remove(args.out)
    for suffix in ("-wal", "-shm"):
        if os.path.exists(args.out + suffix):
            os.remove(args.out + suffix)
    dst = sqlite3.connect(args.out)
    src.backup(dst)
    src.close()
    dst.execute("PRAGMA journal_mode=DELETE")

    tickers = [r[0] for r in dst.execute("SELECT ticker FROM ticker_registry WHERE status != 'discarded' ORDER BY ticker")]
    jumps_before = seam_jumps(dst)
    total = defaultdict(int)
    missing_div = []
    suspicious = []
    clean_from: dict[str, str] = {}
    overshoot_all: list[float] = []
    for t in tickers:
        rows = [
            dict(zip(("date", "open", "high", "low", "close", "volume", "fetched_at"), r))
            for r in dst.execute("SELECT date, open, high, low, close, volume, fetched_at FROM weekly_bars WHERE ticker=? ORDER BY date", (t,))
        ]
        if t not in dividends:
            missing_div.append(t)
        updates, st = convert_ticker(rows, dividends.get(t, []), splits_by.get(t, []), today=args.today)
        clean_from[t] = st.pop("clean_from", "9999-12-31")
        overshoot_all.extend(st.pop("overshoot", []))
        for k, v in st.items():
            total[k] += v
        if st["av_rows"] and st["flagged"] / st["av_rows"] > 0.05:
            suspicious.append(f"{t}({st['flagged']}/{st['av_rows']})")
        dst.executemany(
            "UPDATE weekly_bars SET open=:open, high=:high, low=:low, close=:close, volume=:volume WHERE ticker=:ticker AND date=:date",
            [dict(u, ticker=t) for u in updates],
        )
    dst.commit()
    jumps_after = seam_jumps(dst)
    ov = sorted(overshoot_all)
    pct = lambda q: (ov[min(len(ov) - 1, int(q * len(ov)))] if ov else 0.0)
    outside = sum(1 for o in ov if o > 0)
    summary = {
        "guard": {"tolerance": [TOL_LO, TOL_HI], "converted_rows": len(ov), "close_outside_own_bar": outside,
                  "overshoot_p50": pct(0.5), "overshoot_p95": pct(0.95), "overshoot_max": ov[-1] if ov else 0.0},
        "src": args.src,
        "out": args.out,
        "tickers": len(tickers),
        "rows": dict(total),
        "seam_jumps_before": jumps_before,
        "seam_jumps_after": jumps_after,
        "missing_dividend_data": missing_div,
        "suspicious_tickers": suspicious,
        "polygon_since": POLYGON_SINCE,
        "clean_from": clean_from,  # per ticker: first date from which every later row is single-basis
        "tickers_not_clean_by_2017": sorted(t for t, d in clean_from.items() if d > "2017-01-01"),
    }
    dst.execute("CREATE TABLE IF NOT EXISTS splitbasis_meta (k TEXT PRIMARY KEY, v TEXT)")
    dst.execute("INSERT OR REPLACE INTO splitbasis_meta VALUES ('summary', ?)", (json.dumps(summary),))
    dst.commit()
    dst.close()
    with open(os.path.splitext(args.out)[0] + "-summary.json", "w") as fh:
        json.dump(summary, fh, indent=1)
    print(
        f"[splitbasis] {args.out}: AV rows {total['av_rows']} → converted {total['converted']} · flagged(kept AV) {total['flagged']} · "
        f"polygon rows {total['poly_rows']} (rescaled for post-fetch splits: {total['poly_rescaled']}) · seam jumps 2024-07-12→19 (>5% either way): {jumps_before} → {jumps_after} · "
        f"missing dividend data: {len(missing_div)} · tickers with >5% of AV rows flagged: {len(suspicious)} (full list in the summary JSON)"
    )
    print(
        f"[splitbasis] guard ±{(TOL_HI - 1) * 100:.1f}%: {outside}/{len(ov)} converted rows have their close outside their own raw bar "
        f"(overshoot p50 {pct(0.5) * 100:.2f}% · p95 {pct(0.95) * 100:.2f}% · max {(ov[-1] if ov else 0) * 100:.2f}%) — residual dividend-timing drift, disclosed not hidden"
    )
    late = summary["tickers_not_clean_by_2017"]
    print(f"[splitbasis] tickers whose single-basis tail starts after 2017-01-01 (spin-offs etc., unreconcilable earlier rows): {len(late)}{' ' + ', '.join(f'{t}:{clean_from[t]}' for t in late[:12]) if late else ''}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
