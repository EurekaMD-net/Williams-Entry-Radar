"""pytest suite for the TimesFM sidecar (forecast.py + backtest.py).
Run: /opt/timesfm/bin/python -m pytest -q scripts/tfm
No torch/model needed — the model is duck-typed where required."""

from __future__ import annotations

import json
import math
import os
import sqlite3
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.dirname(__file__))
import backtest as bt  # noqa: E402
import forecast as fc  # noqa: E402


# ---------------------------------------------------------------------------
# forecast.py
# ---------------------------------------------------------------------------
def make_db(path: str, ticker: str, closes: list[float], start_week: int = 0) -> None:
    conn = sqlite3.connect(path)
    conn.execute(
        "CREATE TABLE weekly_bars (ticker TEXT, date TEXT, open REAL, high REAL, low REAL, close REAL, volume INTEGER, fetched_at TEXT, PRIMARY KEY (ticker, date))"
    )
    for i, c in enumerate(closes):
        # ISO dates spaced 7 days apart, sortable as text
        d = np.datetime64("2020-01-03") + np.timedelta64(7 * (i + start_week), "D")
        conn.execute("INSERT INTO weekly_bars VALUES (?,?,?,?,?,?,?,?)", (ticker, str(d), c, c, c, c, 1, "x"))
    conn.commit()
    conn.close()


def test_load_closes_truncates_at_as_of_and_respects_context(tmp_path):
    db = str(tmp_path / "t.db")
    make_db(db, "AAA", [float(i) for i in range(1, 201)])
    conn = fc.open_db(db)
    dates, closes = fc.load_closes(conn, "AAA", None, 512)
    assert len(closes) == 200 and closes[-1] == 200.0 and dates == sorted(dates)
    # as-of cut: bar 100 is 2020-01-03 + 99*7d = 2021-11-26
    dates, closes = fc.load_closes(conn, "AAA", "2021-11-26", 512)
    assert closes[-1] == 100.0 and dates[-1] == "2021-11-26"
    dates, closes = fc.load_closes(conn, "AAA", "2021-11-26", 64)
    assert len(closes) == 64 and closes[0] == 37.0 and closes[-1] == 100.0
    # from_date lower bound: bar 91 is 2020-01-03 + 90*7d = 2021-09-24
    dates, closes = fc.load_closes(conn, "AAA", "2021-11-26", 512, from_date="2021-09-24")
    assert len(closes) == 10 and dates[0] == "2021-09-24" and closes[-1] == 100.0


def test_open_db_is_read_only(tmp_path):
    db = str(tmp_path / "t.db")
    make_db(db, "AAA", [1.0, 2.0])
    conn = fc.open_db(db)
    with pytest.raises(sqlite3.OperationalError):
        conn.execute("DELETE FROM weekly_bars")


def test_baseline_random_walk_math():
    # 4% weekly log-vol geometric series with alternating +/- returns → sigma ≈ 0.04
    rets = np.array([0.04, -0.04] * 20)
    closes = 100 * np.exp(np.cumsum(rets))
    b = fc.baseline(closes, 4)
    assert b is not None
    assert b["r50"] == 0.0 and math.isclose(b["r10"], -b["r90"])
    assert math.isclose(b["r90"], fc.Z80 * b["sigma_w"] * 2.0, rel_tol=1e-6)
    assert 0.0407 < b["sigma_w"] < 0.0409  # last 26 returns, ddof=1: 0.04·sqrt(26/25) = 0.04079 (ddof=0 → 0.04000)
    assert fc.baseline(closes[-5:], 4) is None  # < SIGMA_MIN returns


def test_extract_quantiles_mapping_and_shape_guard():
    quant = np.zeros((2, 4, 10))
    quant[1, 3, :] = np.arange(10)  # row 1, step 4
    q = fc.extract_quantiles(quant, 1, 4)
    assert q == {"p10": 1.0, "p50": 5.0, "p90": 9.0}
    with pytest.raises(ValueError):
        fc.extract_quantiles(np.zeros((2, 4, 9)), 0, 4)


def test_build_row_log_returns_and_asym():
    closes = np.array([100.0] * 60 + [110.0, 100.0] * 5)
    q = {"p10": 90.0, "p50": 100.0, "p90": 110.0}
    row = fc.build_row("AAA", "2026-01-02", ["d"] * len(closes), closes, q, 4)
    assert row["last_close"] == 100.0 and row["r50"] == 0.0
    assert math.isclose(row["r10"], math.log(0.9), abs_tol=1e-6)
    # symmetric in LEVEL space is asymmetric in LOG space (< 1)
    assert row["asym_log"] < 1.0
    with pytest.raises(ValueError):
        fc.build_row("AAA", "d", ["d"], closes, {"p10": 100.0, "p50": 90.0, "p90": 110.0}, 4)


class FakeModel:
    """Duck-typed model: p50 = last close, band = ±10% in level space; records batch sizes."""

    def __init__(self):
        self.batches: list[int] = []

    def forecast(self, horizon: int, inputs: list[np.ndarray]):
        self.batches.append(len(inputs))
        n = len(inputs)
        quant = np.zeros((n, horizon, 10))
        for i, s in enumerate(inputs):
            last = s[-1]
            quant[i, :, 0] = last
            for k in range(1, 10):
                quant[i, :, k] = last * (0.9 + 0.025 * (k - 1))  # q10=0.9·last … q90=1.1·last
        return quant[:, :, 0], quant


def test_forecast_rows_batches_and_error_rows(tmp_path):
    db = str(tmp_path / "t.db")
    for t in ("AAA", "BBB", "CCC"):
        make_db(db, t, [100.0 + i for i in range(120)]) if t == "AAA" else None
    conn = sqlite3.connect(db)
    for t in ("BBB", "CCC"):
        for i in range(120):
            d = np.datetime64("2020-01-03") + np.timedelta64(7 * i, "D")
            conn.execute("INSERT INTO weekly_bars VALUES (?,?,?,?,?,?,?,?)", (t, str(d), 50.0, 50.0, 50.0, 50.0 + (i % 3), 1, "x"))
    conn.execute("DELETE FROM weekly_bars WHERE ticker='CCC' AND date > '2020-06-01'")  # short series
    conn.commit()
    conn.close()
    conn = fc.open_db(db)
    model = FakeModel()
    rows = [{"ticker": "AAA", "as_of": None}] * 33 + [{"ticker": "BBB", "as_of": "2021-06-04"}, {"ticker": "CCC", "as_of": None}, {"ticker": "ZZZ", "as_of": None}]
    out = fc.forecast_rows(model, conn, rows, 4, 512)
    assert len(out) == 36
    assert model.batches == [32, 2]  # 33 AAA + 1 BBB ok rows → 32 + 2; CCC/ZZZ never reach the model
    errs = [r for r in out if "error" in r]
    assert {r["ticker"] for r in errs} == {"CCC", "ZZZ"} and all("bars" in r["error"] for r in errs)
    ok = [r for r in out if "error" not in r]
    assert all(r["p10"] < r["p50"] < r["p90"] for r in ok)
    bbb = next(r for r in ok if r["ticker"] == "BBB")
    assert bbb["as_of"] == "2021-06-04" and bbb["last_bar"] <= "2021-06-04" and bbb["bars_used"] == 75
    assert all(r["baseline"] is not None for r in ok)


def test_forecast_rows_batch_failure_isolated(tmp_path):
    db = str(tmp_path / "t.db")
    make_db(db, "AAA", [100.0 + i for i in range(120)])
    conn = fc.open_db(db)

    class Boom:
        def forecast(self, horizon, inputs):
            raise RuntimeError("kaboom")

    out = fc.forecast_rows(Boom(), conn, [{"ticker": "AAA", "as_of": None}], 4, 512)
    assert len(out) == 1 and out[0]["error"].startswith("forecast: kaboom")


def test_load_rows_accepts_dict_and_list(tmp_path):
    p = tmp_path / "rows.json"
    p.write_text(json.dumps({"rows": [{"ticker": "AAA", "as_of": "2020-01-01", "extra": 1}]}))
    ns = fc.parse_args(["--rows", str(p), "--out", "x.json"])
    assert fc.load_rows(ns) == [{"ticker": "AAA", "as_of": "2020-01-01"}]
    p.write_text(json.dumps([{"ticker": "BBB", "as_of": "2020-01-08"}]))
    assert fc.load_rows(fc.parse_args(["--rows", str(p), "--out", "x.json"])) == [{"ticker": "BBB", "as_of": "2020-01-08"}]
    ns = fc.parse_args(["--tickers", "bsx, aapl", "--out", "x.json", "--as-of", "2026-01-02"])
    assert fc.load_rows(ns) == [{"ticker": "BSX", "as_of": "2026-01-02"}, {"ticker": "AAPL", "as_of": "2026-01-02"}]


# ---------------------------------------------------------------------------
# backtest.py
# ---------------------------------------------------------------------------
def test_pinball_known_values():
    assert bt.pinball(1.0, 0.0, 0.9) == pytest.approx(0.9)   # under-forecast at high tau costs tau
    assert bt.pinball(-1.0, 0.0, 0.9) == pytest.approx(0.1)  # over-forecast costs 1-tau
    assert bt.pinball(0.5, 0.5, 0.5) == 0.0


def test_row_metrics_coverage_and_tails():
    m = bt.row_metrics(0.0, -0.1, 0.0, 0.1)
    assert m["covered"] and not m["below"] and not m["above"] and m["width"] == pytest.approx(0.2)
    assert bt.row_metrics(-0.2, -0.1, 0.0, 0.1)["below"]
    assert bt.row_metrics(0.2, -0.1, 0.0, 0.1)["above"]


def test_wilson_interval():
    lo, hi = bt.wilson(50, 100)
    assert lo < 0.5 < hi and 0.40 < lo < 0.41 and 0.59 < hi < 0.60
    assert all(math.isnan(v) for v in bt.wilson(0, 0))


def test_bootstrap_is_deterministic_and_clusters_by_week():
    vals = {"2020-01-03": [-0.01, -0.02], "2020-01-10": [0.005], "2020-01-17": [-0.03, -0.01, -0.02]}
    ci1 = bt.bootstrap_mean_by_cluster(vals)
    ci2 = bt.bootstrap_mean_by_cluster(vals)
    assert ci1 == ci2 and ci1[0] <= ci1[1]
    pooled = sum(sum(v) for v in vals.values()) / sum(len(v) for v in vals.values())
    assert ci1[0] <= pooled <= ci1[1]


def _rows(n: int, tfm_scale: float, base_scale: float, seed: int = 0) -> list[dict]:
    rng = np.random.default_rng(seed)
    y = rng.normal(0, 0.05, n)
    return [
        {"ticker": "T", "as_of": f"2025-{1 + i % 12:02d}-{1 + (i // 12) % 28:02d}", "level": "S1", "y": float(y[i]),
         "tfm": (-1.2816 * 0.05 * tfm_scale, 0.0, 1.2816 * 0.05 * tfm_scale),
         "base": (-1.2816 * 0.05 * base_scale, 0.0, 1.2816 * 0.05 * base_scale), "asym": 1.0}
        for i in range(n)
    ]


def test_gate_passes_for_well_calibrated_better_model_and_fails_for_worse():
    good = bt.summarize(_rows(2000, tfm_scale=1.0, base_scale=2.0))  # tfm calibrated, baseline too wide
    assert 0.75 < good["cov_tfm"] < 0.85 and good["dpb_mean"] < 0
    g = bt.gate(good)
    assert g["G1"] and g["G2"] and g["G3"] and g["pass"]
    bad = bt.summarize(_rows(2000, tfm_scale=2.0, base_scale=1.0))  # tfm too wide → cov ≈ 99%, worse PB
    gb = bt.gate(bad)
    assert not gb["G2"] and not gb["G1"] and not gb["pass"]
    assert bt.gate({"n": 0})["insufficient"]


def test_join_rows_drops_and_maps():
    sig = [
        {"ticker": "A", "as_of": "2025-03-07", "level": "S1", "close": 100.0, "close_h4": 110.0},
        {"ticker": "B", "as_of": "2025-03-07", "level": "S2D", "close": 100.0, "close_h4": 90.0},
        {"ticker": "C", "as_of": "2025-03-07", "level": "S1", "close": 100.0, "close_h4": 90.0},
        {"ticker": "D", "as_of": "2025-03-07", "level": "S1", "close": 100.0, "close_h4": 90.0},
        {"ticker": "E", "as_of": "2025-03-07", "level": "S1", "close": 100.0, "close_h4": 90.0},
        {"ticker": "F", "as_of": "2024-07-05", "level": "S1", "close": 100.0, "close_h4": 90.0},  # y window spans the seam
        {"ticker": "G", "as_of": "2024-12-27", "level": "S1", "close": 100.0, "close_h4": 90.0},  # σ window spans the seam
    ]
    ok = {"r10": -0.1, "r50": 0.0, "r90": 0.1, "asym_log": 1.0, "baseline": {"r10": -0.2, "r50": 0.0, "r90": 0.2}, "last_close": 100.0}
    fcs = [
        {"ticker": "A", "as_of": "2025-03-07", **ok},
        {"ticker": "B", "as_of": "2025-03-07", "error": "boom"},
        {"ticker": "C", "as_of": "2025-03-07", **{**ok, "baseline": None}},
        {"ticker": "E", "as_of": "2025-03-07", **{**ok, "last_close": 101.0}},  # forecast not made at as_of
        {"ticker": "F", "as_of": "2024-07-05", **ok},
        {"ticker": "G", "as_of": "2024-12-27", **ok},
    ]
    joined, drop = bt.join_rows(sig, fcs)
    assert [r["ticker"] for r in joined] == ["A"]
    assert joined[0]["y"] == pytest.approx(math.log(1.1)) and joined[0]["base"] == (-0.2, 0.0, 0.2)
    assert drop == {"forecast_error": 1, "no_baseline": 1, "no_forecast": 1, "close_mismatch": 1, "seam_window": 2}
    assert len(joined) + sum(drop.values()) == len(sig)


def test_spans_seam_windows():
    assert bt.spans_seam("2024-07-05", 4)          # seam 2 weeks ahead, inside the realised window
    assert bt.spans_seam("2024-08-16", 4)          # seam 4 weeks back, inside the σ window
    assert bt.spans_seam("2025-01-10", 4)          # 25 weeks back — still inside 26w σ window
    assert not bt.spans_seam("2025-01-24", 4)      # 27 weeks back — clear
    assert not bt.spans_seam("2024-06-14", 4)      # seam 5 weeks ahead — beyond h=4
    assert bt.spans_seam("2024-06-14", 8)          # ... but inside h=8


def test_gate_g1_needs_ci_excluding_zero_and_g3_tails():
    base = {"n": 500, "dpb_mean": -0.001, "dpb_ci": (-0.002, -0.0005), "cov_tfm": 0.80, "tail_lo_tfm": 0.10, "tail_hi_tfm": 0.10}
    assert bt.gate(base)["pass"]
    assert not bt.gate({**base, "dpb_ci": (-0.002, 0.0001)})["G1"]     # mean < 0 but CI touches 0
    assert not bt.gate({**base, "dpb_mean": 0.0001, "dpb_ci": (-0.001, -0.00005)})["G1"]  # incoherent mean
    assert not bt.gate({**base, "tail_hi_tfm": 0.25})["G3"]
    assert not bt.gate({**base, "tail_lo_tfm": 0.02})["G3"]
    assert not bt.gate({**base, "cov_tfm": 0.95})["G2"]
    assert not bt.gate({**base, "cov_tfm": 0.65})["G2"]


def test_bootstrap_clusters_by_week_not_by_row():
    one_week = [dict(r, as_of="2025-03-07") for r in _rows(200, 1.0, 2.0)]
    s = bt.summarize(one_week)
    assert s["weeks"] == 1
    lo, hi = s["dpb_ci"]
    assert lo == pytest.approx(hi) and lo == pytest.approx(s["dpb_mean"])  # one cluster → degenerate CI
    many = bt.summarize(_rows(200, 1.0, 2.0))
    assert many["weeks"] > 1 and many["dpb_ci"][1] > many["dpb_ci"][0]


def test_render_report_insufficient_band_and_zero_rows(tmp_path):
    meta = {"generated_at": "now"}
    rows = _rows(100, 1.0, 2.0)  # all post-2025 but only 100 < MIN_RECENT
    _, verdict = bt.render_report(meta, rows, {}, {}, {})
    assert verdict == "INSUFFICIENT"
    md, verdict = bt.render_report(meta, [], {"no_forecast": 5}, {}, {})
    assert verdict == "INSUFFICIENT" and "**FAIL**" not in md.split("## Verdict")[1]


def test_main_refuses_horizon_mismatch(tmp_path):
    rows_p, fc_p, out_p = tmp_path / "r.json", tmp_path / "f.json", tmp_path / "report.md"
    rows_p.write_text(json.dumps({"meta": {"horizon": 8}, "rows": []}))
    fc_p.write_text(json.dumps({"meta": {"horizon": 4}, "rows": []}))
    assert bt.main(["--rows", str(rows_p), "--forecasts", str(fc_p), "--out", str(out_p)]) == 1
    assert not out_p.exists()


def test_segment_table_flags_small_segments():
    t = bt.segment_table([("tiny", bt.summarize(_rows(4, 1.0, 2.0))), ("big", bt.summarize(_rows(200, 1.0, 2.0)))])
    assert "| tiny * |" in t and "| big |" in t and "(*) n < 30" in t


def test_render_report_verdicts(tmp_path):
    meta = {"generated_at": "now"}
    rows = _rows(400, 1.0, 2.0)  # all in 2025 → post-2025 n=400 ≥ 150
    md, verdict = bt.render_report(meta, rows, {}, {"total_before_cap": 400, "since": "2019", "tickers": 1, "cap": 3000}, {"model": "m", "lib": "l", "horizon": 4, "context": 512})
    assert verdict == "PASS" and "## Verdict: **PASS**" in md
    early = [dict(r, as_of="2020-01-03") for r in rows]  # nothing post-2025 → INSUFFICIENT
    _, verdict = bt.render_report(meta, early, {}, {}, {})
    assert verdict == "INSUFFICIENT"
    _, verdict = bt.render_report(meta, _rows(400, 2.0, 1.0), {}, {}, {})
    assert verdict == "FAIL"
