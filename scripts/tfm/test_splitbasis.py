"""pytest for make-splitbasis-db.py — synthetic ticker with a 2:1 split and quarterly dividends.
Run: /opt/timesfm/bin/python -m pytest -q scripts/tfm/test_splitbasis.py"""

from __future__ import annotations

import importlib.util
import math
import os
from datetime import date, timedelta

import pytest

spec = importlib.util.spec_from_file_location("sb", os.path.join(os.path.dirname(__file__), "make-splitbasis-db.py"))
sb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sb)

SPLIT_DATE = "2024-03-15"  # 1:2 forward split → SF(t<split) = 0.5
AV_F = "2026-07-11T00:06:00.000Z"
POLY_F = "2026-07-18T00:52:00.000Z"
POLY_FROM = "2024-07-19"


def fridays(start: str, n: int) -> list[str]:
    d = date.fromisoformat(start)
    return [(d + timedelta(weeks=i)).isoformat() for i in range(n)]


def build(dividend_cash_pre=2.0, dividend_cash_post=1.0, n=120):
    """Returns (rows as stored in radar.db, dividends, splits, true split-basis closes)."""
    dates = fridays("2023-01-06", n)
    base = [100.0 * math.exp(0.02 * math.sin(i / 5.0)) for i in range(n)]  # true split-basis close
    sf = lambda t: 0.5 if t < SPLIT_DATE else 1.0
    raw = [b / sf(t) for b, t in zip(base, dates)]  # raw doubles before the split
    # quarterly ex-dates on Wednesdays, cash halves after the split (as declared)
    divs = []
    d = date.fromisoformat("2023-02-08")
    while d.isoformat() < "2026-06-01":
        divs.append({"ex": d.isoformat(), "cash": dividend_cash_pre if d.isoformat() < SPLIT_DATE else dividend_cash_post})
        d += timedelta(weeks=13)
    splits = [{"ticker": "T", "execution_date": SPLIT_DATE, "split_from": 1, "split_to": 2}]

    def raw_pre(ex: str) -> float:  # raw close of the last bar before ex
        prev = max(i for i, t in enumerate(dates) if t < ex)
        return raw[prev]

    def g_true(t: str, F: str) -> float:
        return math.prod(1 - dv["cash"] / raw_pre(dv["ex"]) for dv in divs if t < dv["ex"] <= F)

    rows = []
    for i, t in enumerate(dates):
        if t >= POLY_FROM:  # Polygon: every field split-adjusted
            rows.append({"date": t, "open": base[i] * 0.99, "high": base[i] * 1.02, "low": base[i] * 0.98, "close": base[i], "volume": 1000, "fetched_at": POLY_F})
        else:  # AV: raw OHLC, adjusted close (splits to F + dividends to F)
            adj = raw[i] * sf(t) * g_true(t, AV_F[:10])
            rows.append({"date": t, "open": raw[i] * 0.99, "high": raw[i] * 1.02, "low": raw[i] * 0.98, "close": adj, "volume": 1000, "fetched_at": AV_F})
    return rows, divs, splits, base


def test_is_polygon_row_classification():
    assert sb.is_polygon_row("2024-09-06", POLY_F)
    assert not sb.is_polygon_row("2024-09-06", AV_F)                    # fetched before the cutover → AV
    assert not sb.is_polygon_row("2001-03-16", "2026-08-15T00:00:00Z")  # SGEN-style AV fallback rewrite
    assert sb.is_polygon_row("2024-08-16", "2026-08-15T00:00:00Z")


def test_converter_recovers_split_basis_closes_and_scales_ohlc():
    rows, divs, splits, base = build()
    updates, st = sb.convert_ticker(rows, divs, splits)
    assert st["flagged"] == 0 and st["converted"] == st["av_rows"] > 0 and st["poly_rows"] > 0
    by_date = {u["date"]: u for u in updates}
    for r, b in zip(rows, base):
        if r["date"] >= POLY_FROM:
            assert r["date"] not in by_date  # Polygon rows untouched
            continue
        u = by_date[r["date"]]
        assert u["close"] == pytest.approx(b, rel=2e-3)  # dividend factor divided out, split kept
        assert u["high"] == pytest.approx(b * 1.02, rel=1e-9) and u["low"] == pytest.approx(b * 0.98, rel=1e-9)
        assert u["volume"] == (2000 if r["date"] < SPLIT_DATE else 1000)
    # the seam week: last AV vs first Polygon close is now a normal weekly move, not a dividend cliff
    last_av = max(d for d in by_date if d < POLY_FROM)
    first_poly = next(r for r in rows if r["date"] >= POLY_FROM)
    assert abs(math.log(first_poly["close"] / by_date[last_av]["close"])) < 0.03


def test_bad_dividend_record_is_flagged_not_written():
    rows, divs, splits, _ = build()
    divs = divs + [{"ex": "2023-08-16", "cash": 150.0}]  # bogus: larger than the price
    updates, st = sb.convert_ticker(rows, divs, splits)
    assert st["flagged"] > 0
    assert all(u["date"] > "2023-08-16" for u in updates)  # everything before the bogus record is refused


def test_non_payer_and_no_split_is_identity_on_close():
    rows, _, _, base = build(dividend_cash_pre=0.0, dividend_cash_post=0.0)
    updates, st = sb.convert_ticker(rows, [], [{"ticker": "T", "execution_date": SPLIT_DATE, "split_from": 1, "split_to": 2}])
    assert st["flagged"] == 0
    for u, r in zip(updates, [r for r in rows if r["date"] < POLY_FROM]):
        assert u["close"] == pytest.approx(r["close"], rel=1e-12)  # no dividends → adjusted close already split-basis


def test_split_after_av_fetch_is_applied():
    rows, divs, splits, base = build()
    late = {"ticker": "T", "execution_date": "2026-07-15", "split_from": 1, "split_to": 4}  # after AV fetch (07-11), before Polygon (07-18)
    # Polygon rows would already be /4; emulate: scale polygon rows
    for r in rows:
        if r["date"] >= POLY_FROM:
            for k in ("open", "high", "low", "close"):
                r[k] /= 4
    updates, st = sb.convert_ticker(rows, divs, splits + [late])
    by_date = {u["date"]: u for u in updates}
    for r, b in zip(rows, base):
        if r["date"] < POLY_FROM:
            assert by_date[r["date"]]["close"] == pytest.approx(b / 4, rel=2e-3)


def test_clean_from_marks_tail_after_last_flag():
    rows, divs, splits, _ = build()
    _, st = sb.convert_ticker(rows, divs, splits)
    assert st["clean_from"] == rows[0]["date"]  # nothing flagged → clean from the first bar
    _, st2 = sb.convert_ticker(rows, divs + [{"ex": "2023-08-16", "cash": 150.0}], splits)
    assert st2["flagged"] > 0 and st2["clean_from"] > "2023-08-16"
    assert all(r["date"] < st2["clean_from"] for r in rows if r["date"] <= "2023-08-11")


def test_split_after_polygon_fetch_rescales_polygon_rows_to_common_basis():
    rows, divs, splits, base = build()
    # MNST-style: 1:2 executed 2026-08-11 — after every fetch in `rows` (AV 07-11, Polygon 07-18); the
    # DB is on the pre-split basis throughout, and the common (today) basis is /2 for EVERY row.
    late = {"ticker": "T", "execution_date": "2026-08-11", "split_from": 1, "split_to": 2}
    updates, st = sb.convert_ticker(rows, divs, splits + [late], today="2026-08-16")
    by_date = {u["date"]: u for u in updates}
    assert st["poly_rescaled"] == st["poly_rows"] > 0
    for r, b in zip(rows, base):
        assert by_date[r["date"]]["close"] == pytest.approx(b / 2, rel=2e-3)
        assert by_date[r["date"]]["volume"] == (4000 if r["date"] < SPLIT_DATE else 2000)


def test_announced_future_split_is_ignored():
    rows, divs, splits, base = build()
    future = {"ticker": "T", "execution_date": "2026-09-03", "split_from": 1, "split_to": 2}  # APH-style
    updates, st = sb.convert_ticker(rows, divs, splits + [future], today="2026-08-16")
    by_date = {u["date"]: u for u in updates}
    assert st["poly_rescaled"] == 0
    for r, b in zip(rows, base):
        if r["date"] < POLY_FROM:
            assert by_date[r["date"]]["close"] == pytest.approx(b, rel=2e-3)


def test_ticker_with_only_polygon_rows_is_clean_from_first_bar():
    rows, divs, splits, _ = build()
    poly_only = [r for r in rows if r["date"] >= POLY_FROM]
    updates, st = sb.convert_ticker(poly_only, divs, splits)
    assert updates == [] and st["av_rows"] == 0 and st["clean_from"] == poly_only[0]["date"]
