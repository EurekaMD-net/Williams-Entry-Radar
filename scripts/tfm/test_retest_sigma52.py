"""Tests for retest-sigma52.py — pure helpers + verdict logic."""
from __future__ import annotations

import importlib.util
import math
import os

import numpy as np
import pytest

spec = importlib.util.spec_from_file_location("rs", os.path.join(os.path.dirname(__file__), "retest-sigma52.py"))
rs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rs)


def _closes(n: int, weekly_ret: float = 0.02, seed: int = 1) -> list[float]:
    rng = np.random.default_rng(seed)
    r = rng.normal(0, weekly_ret, n)
    return list(100 * np.exp(np.cumsum(r)))


def test_z80_pinned_to_forecast_py_constant():
    spec_fc = importlib.util.spec_from_file_location("fc", os.path.join(os.path.dirname(__file__), "forecast.py"))
    fc = importlib.util.module_from_spec(spec_fc)
    spec_fc.loader.exec_module(fc)
    assert rs.Z80 == 1.2816 == fc.Z80


def test_sigma_band_uses_last_n_returns_ddof1_and_scales_sqrt_h():
    closes = _closes(120, 0.03)
    got = rs.sigma_band(closes, 52, 4, 40)
    assert got is not None
    sigma, (r10, r50, r90) = got
    rets = np.diff(np.log(np.array(closes[-53:])))
    assert math.isclose(sigma, float(np.std(rets, ddof=1)), rel_tol=1e-12)
    assert r50 == 0.0 and math.isclose(r90, 1.2816 * sigma * 2.0, rel_tol=1e-12) and math.isclose(r10, -r90)


def test_sigma_window_clean_uses_the_requested_window_length():
    # as_of 2025-01-03; 26w window starts 2024-07-05, 52w window starts 2024-01-05
    assert rs.sigma_window_clean("2025-01-03", 26, "2024-07-01") is True
    assert rs.sigma_window_clean("2025-01-03", 52, "2024-07-01") is False
    assert rs.sigma_window_clean("2025-01-03", 52, None) is True


def test_sigma_band_refuses_short_history_and_ignores_nonpositive():
    assert rs.sigma_band(_closes(30), 52, 4, 40) is None
    closes = _closes(120)
    closes[-5] = 0.0  # a bad bar is dropped, not turned into -inf
    assert rs.sigma_band(closes, 52, 4, 40) is not None


def test_variants_recentre_and_symmetrise():
    v = rs.variants(-0.10, 0.02, 0.14, (-0.1, 0.0, 0.1))
    assert v["tfm_asis"] == (-0.10, 0.02, 0.14)
    assert v["tfm_recentred"] == pytest.approx((-0.12, 0.0, 0.12))
    assert v["tfm_symwidth"] == pytest.approx((-0.12, 0.0, 0.12))
    assert v["sigma26"] == (-0.1, 0.0, 0.1)


def _rows(n_weeks: int, seed: int, tfm_edge: float) -> list[dict]:
    """Synthetic rows: y ~ N(0, 0.1); σN band ±0.128; TimesFM band narrower by `tfm_edge` when it has skill."""
    rng = np.random.default_rng(seed)
    rows = []
    for w in range(n_weeks):
        for k in range(6):
            y = float(rng.normal(0, 0.1))
            base = (-0.128, 0.0, 0.128)
            hw = 0.128 - tfm_edge
            rows.append({"y": y, "as_of": f"2025-{1 + w // 4:02d}-{1 + (w % 4) * 7:02d}", "level": "S1", "sigma": 0.05,
                         "base": base, "var": {"tfm_asis": (-hw, 0.0, hw), "tfm_recentred": (-hw, 0.0, hw), "tfm_symwidth": (-hw, 0.0, hw), "sigma26": base}})
    return rows


def test_verdict_no_improvement_when_bands_identical():
    rows = _rows(60, 3, tfm_edge=0.0)
    s = rs.score(rows)
    assert s["variants"]["tfm_asis"]["dpb_mean"] == 0.0
    assert rs.verdict(s, s) == (False, False, False)


def test_verdict_improvement_when_tfm_band_is_genuinely_sharper():
    # true σ = 0.1 → ideal 80% half-width 0.128; base band 0.128+0.06 is too wide, TFM band ideal
    rows = _rows(80, 5, tfm_edge=0.0)
    for r in rows:
        r["base"] = (-0.19, 0.0, 0.19)
        r["var"]["sigma26"] = r["base"]
    s = rs.score(rows)
    assert s["variants"]["tfm_asis"]["gate"]["G1"] is True
    assert rs.verdict(s, s) == (True, True, False)


def test_verdict_is_g1_only_not_the_full_three_gate_pass():
    # TFM band far too WIDE (coverage ≈ 100% → G2 fails) but base is absurdly wide too → TFM still more accurate (G1 passes)
    rows = _rows(80, 9, tfm_edge=0.0)
    for r in rows:
        r["var"] = {k: (-0.30, 0.0, 0.30) for k in r["var"]}
        r["base"] = (-0.60, 0.0, 0.60)
    s = rs.score(rows)
    g = s["variants"]["tfm_asis"]["gate"]
    assert g["G1"] is True and g["pass"] is False
    assert rs.verdict(s, s)[0] is True


def test_verdict_insufficient_when_recent_population_is_small():
    rows = _rows(80, 5, tfm_edge=0.0)
    small = rows[: rs.MIN_RECENT - 1]
    assert rs.verdict(rs.score(rows), rs.score(small))[2] is True
    assert rs.verdict(rs.score(rows), rs.score(rows))[2] is False


def test_uprate_diff_ci_point_estimate_and_sign():
    low = [{"as_of": f"w{i % 20}", "y": 1.0 if i % 10 < 7 else -1.0} for i in range(200)]   # 70% up
    high = [{"as_of": f"w{i % 20}", "y": 1.0 if i % 10 < 4 else -1.0} for i in range(200)]  # 40% up
    d, (lo, hi) = rs.uprate_diff_ci(low, high, n=200)
    assert math.isclose(d, 0.30, abs_tol=1e-12)
    assert lo <= d <= hi and lo > 0


def test_quintile_table_partitions_all_rows():
    rows = _rows(50, 7, 0.0)
    for i, r in enumerate(rows):
        r["sigma"] = 0.02 + 0.0001 * i
    q = rs.quintile_table(rows)
    assert len(q) == 5 and sum(x["n"] for x in q) == len(rows)
    assert q[0]["sigma_hi"] <= q[-1]["sigma_lo"]
