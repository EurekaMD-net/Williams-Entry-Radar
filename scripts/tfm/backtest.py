#!/opt/timesfm/bin/python
"""Calibration backtest + gate for the TimesFM sidecar — Fase 1.
Spec: docs/timesfm-fase1-spec.md §3.4–§5.

  backtest.py --rows signal-weeks.json --forecasts forecasts.json --out report.md

Joins the as-of signal population with the as-of forecasts on (ticker, as_of),
scores TimesFM against the random-walk baseline in log-return space at h weeks,
and writes report.md (+ rows.csv next to it) with the G1–G3 verdict on the full
population AND the post-2025-01-01 subset.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone

import numpy as np
from datetime import date, timedelta

TAUS = (0.1, 0.5, 0.9)
RECENT_CUTOFF = "2025-01-01"
MIN_RECENT = 150
DIR_EPS = 0.002  # |r50| below this = "no direction"
BOOT_N = 1000
BOOT_SEED = 42
GATE = {"cov": (0.70, 0.90), "tail": (0.04, 0.18)}
# radar.db adjustment seam: bars <= 2024-07-12 came from Alpha Vantage (dividend-adjusted close),
# bars >= 2024-07-19 from Polygon (split-adjusted only) — 166/387 tickers jump >5% in that one week.
# Rows whose realised-return window or baseline-σ window spans the seam are excluded.
SEAM_DATE = "2024-07-19"
SIGMA_WINDOW_WEEKS = 26
MIN_SEGMENT_N = 30  # below this a segment is descriptive only (flagged with *)


# ---------------------------------------------------------------------------
# Pure metrics
# ---------------------------------------------------------------------------
def pinball(y: float, q: float, tau: float) -> float:
    d = y - q
    return tau * d if d >= 0 else (tau - 1.0) * d


def row_metrics(y: float, q10: float, q50: float, q90: float) -> dict:
    return {
        "pb": (pinball(y, q10, 0.1) + pinball(y, q50, 0.5) + pinball(y, q90, 0.9)) / 3.0,
        "covered": q10 <= y <= q90,
        "below": y < q10,
        "above": y > q90,
        "width": q90 - q10,
    }


def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float]:
    if n == 0:
        return (float("nan"), float("nan"))
    p = k / n
    den = 1 + z * z / n
    c = (p + z * z / (2 * n)) / den
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return (c - h, c + h)


def bootstrap_mean_by_cluster(values_by_cluster: dict[str, list[float]], n: int = BOOT_N, seed: int = BOOT_SEED) -> tuple[float, float]:
    """95% CI of the pooled mean, resampling CLUSTERS (as-of weeks) with replacement."""
    keys = sorted(values_by_cluster)
    if not keys:
        return (float("nan"), float("nan"))
    sums = np.array([sum(values_by_cluster[k]) for k in keys])
    cnts = np.array([len(values_by_cluster[k]) for k in keys], dtype=float)
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, len(keys), size=(n, len(keys)))
    means = sums[idx].sum(axis=1) / cnts[idx].sum(axis=1)
    return (float(np.percentile(means, 2.5)), float(np.percentile(means, 97.5)))


def summarize(rows: list[dict]) -> dict:
    """rows: joined records with y, tfm{q10,q50,q90}, base{q10,q50,q90}, as_of, asym."""
    n = len(rows)
    if n == 0:
        return {"n": 0}
    mt = [row_metrics(r["y"], *r["tfm"]) for r in rows]
    mb = [row_metrics(r["y"], *r["base"]) for r in rows]
    dpb_by_week: dict[str, list[float]] = defaultdict(list)
    for r, a, b in zip(rows, mt, mb):
        dpb_by_week[r["as_of"]].append(a["pb"] - b["pb"])
    dpb = [a["pb"] - b["pb"] for a, b in zip(mt, mb)]
    directional = [(r["tfm"][1] > 0) == (r["y"] > 0) for r in rows if abs(r["tfm"][1]) > DIR_EPS and r["y"] != 0]
    asyms = [r["asym"] for r in rows if r.get("asym") is not None]
    return {
        "n": n,
        "weeks": len(dpb_by_week),
        "pb_tfm": float(np.mean([m["pb"] for m in mt])),
        "pb_base": float(np.mean([m["pb"] for m in mb])),
        "dpb_mean": float(np.mean(dpb)),
        "dpb_ci": bootstrap_mean_by_cluster(dpb_by_week),
        "cov_tfm": float(np.mean([m["covered"] for m in mt])),
        "cov_base": float(np.mean([m["covered"] for m in mb])),
        "tail_lo_tfm": float(np.mean([m["below"] for m in mt])),
        "tail_hi_tfm": float(np.mean([m["above"] for m in mt])),
        "tail_lo_base": float(np.mean([m["below"] for m in mb])),
        "tail_hi_base": float(np.mean([m["above"] for m in mb])),
        "width_tfm": float(np.median([m["width"] for m in mt])),
        "width_base": float(np.median([m["width"] for m in mb])),
        "dir_n": len(directional),
        "dir_hit": float(np.mean(directional)) if directional else float("nan"),
        "dir_ci": wilson(int(sum(directional)), len(directional)),
        "asym_med": float(np.median(asyms)) if asyms else float("nan"),
        "asym_iqr": (float(np.percentile(asyms, 25)), float(np.percentile(asyms, 75))) if asyms else (float("nan"), float("nan")),
    }


def gate(s: dict) -> dict:
    """G1 beats baseline (CI excludes 0) · G2 coverage in band · G3 both tails in band."""
    if s.get("n", 0) == 0:
        return {"G1": False, "G2": False, "G3": False, "pass": False, "insufficient": True}
    lo, hi = GATE["cov"]
    tlo, thi = GATE["tail"]
    g1 = s["dpb_mean"] < 0 and s["dpb_ci"][1] < 0
    g2 = lo <= s["cov_tfm"] <= hi
    g3 = tlo <= s["tail_lo_tfm"] <= thi and tlo <= s["tail_hi_tfm"] <= thi
    return {"G1": g1, "G2": g2, "G3": g3, "pass": g1 and g2 and g3, "insufficient": False}


# ---------------------------------------------------------------------------
# Join + report
# ---------------------------------------------------------------------------
def spans_seam(as_of: str, horizon: int, seam: str = SEAM_DATE) -> bool:
    """True if [as_of − 26w, as_of + h·w] contains the adjustment seam (either metric window)."""
    d = date.fromisoformat(as_of)
    sd = date.fromisoformat(seam)
    return (d - timedelta(weeks=SIGMA_WINDOW_WEEKS)) <= sd <= (d + timedelta(weeks=horizon))


def join_rows(signal_rows: list[dict], forecasts: list[dict], horizon: int = 4) -> tuple[list[dict], dict]:
    fc = {(f["ticker"], f["as_of"]): f for f in forecasts}
    joined: list[dict] = []
    drop = defaultdict(int)
    for s in signal_rows:
        if spans_seam(s["as_of"], horizon):
            drop["seam_window"] += 1
            continue
        f = fc.get((s["ticker"], s["as_of"]))
        if f is None:
            drop["no_forecast"] += 1
            continue
        if "error" in f:
            drop["forecast_error"] += 1
            continue
        if not f.get("baseline"):
            drop["no_baseline"] += 1
            continue
        if s["close"] <= 0 or s["close_h4"] <= 0:
            drop["bad_close"] += 1
            continue
        if abs(f["last_close"] / s["close"] - 1.0) > 1e-6:  # forecast must have been made AT as_of
            drop["close_mismatch"] += 1
            continue
        b = f["baseline"]
        joined.append(
            {
                "ticker": s["ticker"],
                "as_of": s["as_of"],
                "level": s["level"],
                "y": math.log(s["close_h4"] / s["close"]),
                "tfm": (f["r10"], f["r50"], f["r90"]),
                "base": (b["r10"], b["r50"], b["r90"]),
                "asym": f.get("asym_log"),
            }
        )
    return joined, dict(drop)


def fmt(x: float, nd: int = 4) -> str:
    return "n/a" if x is None or (isinstance(x, float) and math.isnan(x)) else f"{x:.{nd}f}"


def pct(x: float) -> str:
    return "n/a" if x is None or (isinstance(x, float) and math.isnan(x)) else f"{100 * x:.1f}%"


def segment_table(segments: list[tuple[str, dict]]) -> str:
    head = "| segment | n | weeks | PB tfm | PB base | ΔPB mean [95% CI] | cov80 tfm / base | tails tfm (lo/hi) | width tfm / base | dir hit [CI] (n) | asym med [IQR] |"
    sep = "|---|---:|---:|---:|---:|---|---|---|---|---|---:|"
    lines = [head, sep]
    for name, s in segments:
        if s.get("n", 0) == 0:
            lines.append(f"| {name} | 0 | | | | | | | | | |")
            continue
        flag = " *" if s["n"] < MIN_SEGMENT_N else ""
        lines.append(
            f"| {name}{flag} | {s['n']} | {s['weeks']} | {fmt(s['pb_tfm'])} | {fmt(s['pb_base'])} | "
            f"{fmt(s['dpb_mean'], 5)} [{fmt(s['dpb_ci'][0], 5)}, {fmt(s['dpb_ci'][1], 5)}] | "
            f"{pct(s['cov_tfm'])} / {pct(s['cov_base'])} | {pct(s['tail_lo_tfm'])} / {pct(s['tail_hi_tfm'])} | "
            f"{fmt(s['width_tfm'], 3)} / {fmt(s['width_base'], 3)} | "
            f"{pct(s['dir_hit'])} [{pct(s['dir_ci'][0])}, {pct(s['dir_ci'][1])}] ({s['dir_n']}) | "
            f"{fmt(s['asym_med'], 2)} [{fmt(s['asym_iqr'][0], 2)}, {fmt(s['asym_iqr'][1], 2)}] |"
        )
    lines.append("")
    lines.append(f"(*) n < {MIN_SEGMENT_N}: descriptive only — CIs over so few clusters are not meaningful.")
    return "\n".join(lines)


def gate_table(name: str, s: dict, g: dict) -> str:
    if g["insufficient"]:
        return f"| {name} | n={s.get('n', 0)} | — | — | — | **INSUFFICIENT** |"
    return (
        f"| {name} | n={s['n']} | {'✅' if g['G1'] else '❌'} ΔPB {fmt(s['dpb_mean'], 5)} CI hi {fmt(s['dpb_ci'][1], 5)} | "
        f"{'✅' if g['G2'] else '❌'} cov {pct(s['cov_tfm'])} | {'✅' if g['G3'] else '❌'} tails {pct(s['tail_lo_tfm'])}/{pct(s['tail_hi_tfm'])} | "
        f"{'**PASS**' if g['pass'] else '**FAIL**'} |"
    )


def render_report(meta: dict, joined: list[dict], drop: dict, sig_meta: dict, fc_meta: dict) -> tuple[str, str]:
    all_s = summarize(joined)
    recent = [r for r in joined if r["as_of"] >= RECENT_CUTOFF]
    early = [r for r in joined if r["as_of"] < RECENT_CUTOFF]
    recent_s = summarize(recent)
    g_all = gate(all_s)
    g_recent = gate(recent_s) if len(recent) >= MIN_RECENT else {"G1": False, "G2": False, "G3": False, "pass": False, "insufficient": True}
    if g_all["insufficient"]:
        verdict = "INSUFFICIENT"  # nothing scored — a pipeline problem, not a model verdict
    elif g_all["pass"] and g_recent["pass"]:
        verdict = "PASS"
    elif g_all["pass"] and g_recent["insufficient"]:
        verdict = "INSUFFICIENT"
    else:
        verdict = "FAIL"

    segs = [("all", all_s), (f"post-{RECENT_CUTOFF}", recent_s), (f"pre-{RECENT_CUTOFF}", summarize(early))]
    for lvl in ("S2", "S2D", "S1"):
        segs.append((f"level {lvl}", summarize([r for r in joined if r["level"] == lvl])))

    md = [
        "# TimesFM Fase 1 — calibration backtest report",
        "",
        f"- generated: {meta['generated_at']}",
        f"- model: `{fc_meta.get('model')}` · lib `{fc_meta.get('lib')}` · horizon {fc_meta.get('horizon')} · context {fc_meta.get('context')}",
        f"- population: {sig_meta.get('total_before_cap')} signal-weeks since {sig_meta.get('since')} across {sig_meta.get('tickers')} tickers"
        f" (cap {sig_meta.get('cap')} → {len(joined) + sum(drop.values())} candidates); dropped: {drop or 'none'}",
        f"- scored rows: {len(joined)} · post-{RECENT_CUTOFF}: {len(recent)} (gate needs ≥{MIN_RECENT})",
        "- metric space: log return over h weeks; TimesFM quantiles = ln(pXX/last_close); baseline = random walk with 26-week realised σ (r50=0, r10/90=∓1.2816·σ·√h)",
        "- ΔPB CI: 95% bootstrap over as-of WEEKS (1,000 resamples, seed 42) — same-week returns share the market",
        "",
        "## Segments",
        "",
        segment_table(segs),
        "",
        "## Gate (spec §5)",
        "",
        "| population | n | G1 beats baseline | G2 coverage ∈ [70%, 90%] | G3 tails ∈ [4%, 18%] | result |",
        "|---|---|---|---|---|---|",
        gate_table("all", all_s, g_all),
        gate_table(f"post-{RECENT_CUTOFF}", recent_s, g_recent),
        "",
        f"## Verdict: **{verdict}**",
        "",
        "PASS requires all three gates on BOTH populations. FAIL ⇒ the sidecar is not wired (spec §5). "
        "INSUFFICIENT ⇒ the recent subset is too small to judge; widen the population before deciding.",
        "",
        "## Caveats",
        "",
        "- Pre-2025 windows may be optimistic if TimesFM's pretraining corpus contained public equity series (cutoff not published in enough detail).",
        "- Universe is today's active registry — survivorship inflates realised returns slightly; second-order for calibration.",
        f"- radar.db has an adjustment seam at {SEAM_DATE}: earlier bars are Alpha Vantage dividend-adjusted closes, later bars Polygon split-adjusted only"
        f" (166/387 tickers jump >5% in that week). Rows whose realised-return or σ window spans the seam are dropped (`seam_window`);"
        " the 512-bar model context still contains the seam for post-2025 rows (a one-off level shift the model sees as history). Same series feeds model and baseline.",
    ]
    return "\n".join(md) + "\n", verdict


def write_rows_csv(path: str, joined: list[dict]) -> None:
    with open(path, "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["ticker", "as_of", "level", "y", "tfm_r10", "tfm_r50", "tfm_r90", "base_r10", "base_r50", "base_r90", "asym_log", "pb_tfm", "pb_base", "cov_tfm", "cov_base"])
        for r in joined:
            a = row_metrics(r["y"], *r["tfm"])
            b = row_metrics(r["y"], *r["base"])
            w.writerow([r["ticker"], r["as_of"], r["level"], f"{r['y']:.6f}", *[f"{v:.6f}" for v in r["tfm"]], *[f"{v:.6f}" for v in r["base"]], r["asym"] if r["asym"] is not None else "", f"{a['pb']:.6f}", f"{b['pb']:.6f}", int(a["covered"]), int(b["covered"])])


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--rows", required=True, help="signal-weeks.json from signal-weeks.ts")
    p.add_argument("--forecasts", required=True, help="forecasts.json from forecast.py --rows")
    p.add_argument("--out", required=True, help="report.md path; rows.csv is written beside it")
    args = p.parse_args(argv)

    with open(args.rows) as fh:
        sig = json.load(fh)
    with open(args.forecasts) as fh:
        fc = json.load(fh)
    h_sig, h_fc = sig.get("meta", {}).get("horizon"), fc.get("meta", {}).get("horizon")
    if h_sig is not None and h_fc is not None and h_sig != h_fc:
        print(f"[tfm-backtest] horizon mismatch: signal-weeks {h_sig} vs forecasts {h_fc} — refusing to score", file=sys.stderr)
        return 1
    joined, drop = join_rows(sig["rows"], fc["rows"], horizon=int(h_fc or 4))
    meta = {"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    md, verdict = render_report(meta, joined, drop, sig.get("meta", {}), fc.get("meta", {}))
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w") as fh:
        fh.write(md)
    write_rows_csv(os.path.join(os.path.dirname(os.path.abspath(args.out)), "rows.csv"), joined)
    print(f"[tfm-backtest] {len(joined)} rows scored · dropped {drop or 'none'} · verdict {verdict} → {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
