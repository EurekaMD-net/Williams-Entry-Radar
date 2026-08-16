#!/opt/timesfm/bin/python
"""
TimesFM Fase 1 — re-test against a STRONGER naive band (σ over N weeks, default 52).

The spec §5 gate used a 26-week σ random walk. Diagnostics (2026-08-16) showed
TimesFM's band WIDTH beats σ26 once its drift is removed — but a 52-week σ does
too. This script makes that a formal artefact: same scored rows, same
week-clustered bootstrap, baseline = σN random walk recomputed from the DB.

Variants scored against σN:
  tfm_asis       — the model's (q10, q50, q90) as produced
  tfm_recentred  — drift removed: (q10−q50, 0, q90−q50)   (keeps its asymmetry)
  tfm_symwidth   — symmetric half-width around 0: (−hw, 0, +hw), hw = (q90−q10)/2
  sigma26        — the spec §5 baseline, for reference

Also reports the "annotation value" of the σN band: realised outcome by σN
quintile (does volatility at signal time say anything about what follows?).

Usage:
  /opt/timesfm/bin/python scripts/tfm/retest-sigma52.py --rows <rows.csv> --db <radar db> --out <report.md>
        [--sigma-weeks 52] [--horizon 4] [--min-returns 40] [--clean-from <radar-splitbasis-summary.json>]

--clean-from mirrors backtest.py: rows whose σN window starts before the ticker's
single-basis tail (`clean_from`) are dropped as `unclean_sigma_window` (the §5 run
filtered with a 26-week window; a longer σ reaches further back).
Read-only on the DB. Exit 0 = report written; 2 = bad input.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import os
import sqlite3
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from backtest import BOOT_N, BOOT_SEED, MIN_RECENT, RECENT_CUTOFF, bootstrap_mean_by_cluster, gate, row_metrics  # noqa: E402

Z80 = 1.2816  # one-sided z for the 10%/90% quantiles — must equal forecast.py Z80
POST = RECENT_CUTOFF
VARIANTS = ("tfm_asis", "tfm_recentred", "tfm_symwidth", "sigma26")


# ---------------------------------------------------------------------------
# Pure helpers (tested)
# ---------------------------------------------------------------------------
def sigma_band(closes: list[float], sigma_weeks: int, horizon: int, min_returns: int) -> tuple[float, tuple[float, float, float]] | None:
    """σ over the last `sigma_weeks` weekly log returns (ddof=1) → (σ_w, (r10, 0, r90))."""
    c = [x for x in closes if x and x > 0][-(sigma_weeks + 1):]
    rets = np.diff(np.log(c)) if len(c) > 1 else np.array([])
    if len(rets) < min_returns:
        return None
    s = float(np.std(rets, ddof=1))
    b = Z80 * s * math.sqrt(horizon)
    return s, (-b, 0.0, b)


def variants(t10: float, t50: float, t90: float, b26: tuple[float, float, float]) -> dict[str, tuple[float, float, float]]:
    hw = (t90 - t10) / 2
    return {
        "tfm_asis": (t10, t50, t90),
        "tfm_recentred": (t10 - t50, 0.0, t90 - t50),
        "tfm_symwidth": (-hw, 0.0, hw),
        "sigma26": b26,
    }


def sigma_window_clean(as_of: str, sigma_weeks: int, clean_from: str | None) -> bool:
    """True if the σN window (as_of − N weeks … as_of) lies inside the ticker's single-basis tail."""
    if not clean_from:
        return True
    start = date.fromisoformat(as_of) - timedelta(weeks=sigma_weeks)
    return start >= date.fromisoformat(clean_from)


def score(rows: list[dict]) -> dict:
    """rows: {y, as_of, base: (r10,r50,r90), var: {name: (r10,r50,r90)}} → per-variant summary vs base."""
    n = len(rows)
    if n == 0:
        return {"n": 0}
    mb = [row_metrics(r["y"], *r["base"]) for r in rows]
    out = {
        "n": n,
        "weeks": len({r["as_of"] for r in rows}),
        "pb_base": float(np.mean([m["pb"] for m in mb])),
        "cov_base": float(np.mean([m["covered"] for m in mb])),
        "tail_lo_base": float(np.mean([m["below"] for m in mb])),
        "tail_hi_base": float(np.mean([m["above"] for m in mb])),
        "width_base": float(np.median([m["width"] for m in mb])),
        "variants": {},
    }
    for name in VARIANTS:
        mv = [row_metrics(r["y"], *r["var"][name]) for r in rows]
        by_week: dict[str, list[float]] = defaultdict(list)
        for r, a, b in zip(rows, mv, mb):
            by_week[r["as_of"]].append(a["pb"] - b["pb"])
        dpb = [a["pb"] - b["pb"] for a, b in zip(mv, mb)]
        s = {
            "n": n,
            "pb_tfm": float(np.mean([m["pb"] for m in mv])),
            "pb_base": out["pb_base"],
            "dpb_mean": float(np.mean(dpb)),
            "dpb_ci": bootstrap_mean_by_cluster(by_week),
            "cov_tfm": float(np.mean([m["covered"] for m in mv])),
            "tail_lo_tfm": float(np.mean([m["below"] for m in mv])),
            "tail_hi_tfm": float(np.mean([m["above"] for m in mv])),
            "width_tfm": float(np.median([m["width"] for m in mv])),
        }
        s["gate"] = gate(s)
        out["variants"][name] = s
    return out


def uprate_diff_ci(low: list[dict], high: list[dict], n: int = BOOT_N, seed: int = BOOT_SEED) -> tuple[float, tuple[float, float]]:
    """P(r>0 | low-σ quintile) − P(r>0 | high-σ quintile), 95% CI resampling as-of WEEKS."""
    def by_week(rows: list[dict]) -> dict[str, tuple[int, int]]:
        d: dict[str, list[int]] = defaultdict(lambda: [0, 0])
        for r in rows:
            d[r["as_of"]][0] += int(r["y"] > 0)
            d[r["as_of"]][1] += 1
        return {k: (v[0], v[1]) for k, v in d.items()}
    lo, hi = by_week(low), by_week(high)
    weeks = sorted(set(lo) | set(hi))
    if not weeks:
        return float("nan"), (float("nan"), float("nan"))
    L = np.array([lo.get(w, (0, 0)) for w in weeks], dtype=float)
    H = np.array([hi.get(w, (0, 0)) for w in weeks], dtype=float)
    def diff(idx: np.ndarray) -> np.ndarray:
        l = L[idx].sum(axis=1)  # (n, 2)
        h = H[idx].sum(axis=1)
        return l[:, 0] / np.maximum(l[:, 1], 1) - h[:, 0] / np.maximum(h[:, 1], 1)
    point = float(diff(np.arange(len(weeks))[None, :])[0])
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, len(weeks), size=(n, len(weeks)))
    ds = diff(idx)
    return point, (float(np.percentile(ds, 2.5)), float(np.percentile(ds, 97.5)))


def quintile_table(rows: list[dict]) -> list[dict]:
    """Outcome by σN quintile — the annotation-value check."""
    if len(rows) < 50:
        return []
    sig = np.array([r["sigma"] for r in rows])
    edges = np.quantile(sig, [0.2, 0.4, 0.6, 0.8])
    q = np.searchsorted(edges, sig, side="right")
    out = []
    for k in range(5):
        sub = [r for r, qq in zip(rows, q) if qq == k]
        if not sub:
            continue
        ys = np.array([r["y"] for r in sub])
        cov_b = np.mean([row_metrics(r["y"], *r["base"])["covered"] for r in sub])
        cov_t = np.mean([row_metrics(r["y"], *r["var"]["tfm_asis"])["covered"] for r in sub])
        out.append({
            "q": k + 1, "n": len(sub),
            "sigma_lo": float(min(r["sigma"] for r in sub)), "sigma_hi": float(max(r["sigma"] for r in sub)),
            "mean_y": float(ys.mean()), "p_up": float((ys > 0).mean()), "mean_abs": float(np.abs(ys).mean()),
            "cov_base": float(cov_b), "cov_tfm": float(cov_t),
        })
    return out


def verdict(seg_all: dict, seg_post: dict) -> tuple[bool, bool, bool]:
    """(asis improves on σN on BOTH populations, any variant improves on BOTH, insufficient).
    G1 only — coverage/tails belong to the §5 gate on the model itself, not to this improvement question.
    insufficient = the recent population is below MIN_RECENT (mirrors backtest.py): no verdict either way."""
    def passes(seg: dict, name: str) -> bool:
        v = seg.get("variants", {}).get(name)
        return bool(v and v["gate"]["G1"])
    insufficient = seg_post.get("n", 0) < MIN_RECENT
    asis = passes(seg_all, "tfm_asis") and passes(seg_post, "tfm_asis")
    anyv = any(passes(seg_all, nm) and passes(seg_post, nm) for nm in ("tfm_asis", "tfm_recentred", "tfm_symwidth"))
    return asis, anyv, insufficient


# ---------------------------------------------------------------------------
# I/O
# ---------------------------------------------------------------------------
def load_rows(path: str) -> list[dict]:
    with open(path, newline="") as f:
        return list(csv.DictReader(f))


def closes_upto(conn: sqlite3.Connection, cache: dict, ticker: str, as_of: str) -> list[float]:
    if ticker not in cache:
        cache[ticker] = conn.execute("SELECT date, close FROM weekly_bars WHERE ticker=? ORDER BY date", (ticker,)).fetchall()
    return [c for d, c in cache[ticker] if d <= as_of]


def build(rows_csv: list[dict], conn: sqlite3.Connection, sigma_weeks: int, horizon: int, min_returns: int,
          clean_from: dict[str, str] | None = None) -> tuple[list[dict], dict[str, int]]:
    cache: dict = {}
    out: list[dict] = []
    dropped: dict[str, int] = defaultdict(int)
    for r in rows_csv:
        if clean_from is not None and not sigma_window_clean(r["as_of"], sigma_weeks, clean_from.get(r["ticker"])):
            dropped["unclean_sigma_window"] += 1
            continue
        sb = sigma_band(closes_upto(conn, cache, r["ticker"], r["as_of"]), sigma_weeks, horizon, min_returns)
        if sb is None:
            dropped["short_history"] += 1
            continue
        sigma, base = sb
        t10, t50, t90 = (float(r[k]) for k in ("tfm_r10", "tfm_r50", "tfm_r90"))
        b26 = tuple(float(r[k]) for k in ("base_r10", "base_r50", "base_r90"))
        out.append({
            "ticker": r["ticker"], "as_of": r["as_of"], "level": r["level"], "y": float(r["y"]),
            "sigma": sigma, "base": base, "var": variants(t10, t50, t90, b26),
        })
    return out, dict(dropped)


def fmt(x: float, nd: int = 5) -> str:
    return f"{x:+.{nd}f}"


def pct(x: float) -> str:
    return f"{100 * x:.1f}%"


LABEL = {
    "tfm_asis": "TimesFM as-is (q10,q50,q90)",
    "tfm_recentred": "TimesFM re-centred (drift removed)",
    "tfm_symwidth": "TimesFM symmetric width around 0",
    "sigma26": "σ26 random walk (spec §5 baseline)",
}


def seg_block(title: str, s: dict) -> str:
    if s.get("n", 0) == 0:
        return f"### {title}\n\n(no rows)\n"
    lines = [f"### {title} — n={s['n']} · weeks={s['weeks']} · σN band: PB {s['pb_base']:.4f} · cov80 {pct(s['cov_base'])} · tails {pct(s['tail_lo_base'])}/{pct(s['tail_hi_base'])} · width {s['width_base']:.3f}", "",
             "| variant | PB | ΔPB vs σN mean [95% CI] | cov80 | tails lo/hi | width | G1 beats σN |", "|---|---:|---|---:|---|---:|---|"]
    for name in VARIANTS:
        v = s["variants"][name]
        lo, hi = v["dpb_ci"]
        lines.append(f"| {LABEL[name]} | {v['pb_tfm']:.4f} | {fmt(v['dpb_mean'])} [{fmt(lo)}, {fmt(hi)}] | {pct(v['cov_tfm'])} | {pct(v['tail_lo_tfm'])} / {pct(v['tail_hi_tfm'])} | {v['width_tfm']:.3f} | {'✅' if v['gate']['G1'] else '❌'} |")
    return "\n".join(lines) + "\n"


def render(meta: dict, segs: list[tuple[str, dict]], quint: list[dict], qdiff: tuple[float, tuple[float, float]] | None,
           asis_ok: bool, any_ok: bool, insufficient: bool) -> str:
    N = meta["sigma_weeks"]
    L = [f"# TimesFM Fase 1 — re-test vs σ{N} band (stronger naive baseline)", "",
         f"- generated: {meta['generated']}",
         f"- scored rows: `{meta['rows']}` (from the spec §5 run) · σ{N} recomputed from `{meta['db']}` (read-only)",
         f"- horizon {meta['horizon']} · baseline = random walk, r50=0, r10/90 = ∓{Z80}·σ{N}·√h · σ{N} = std(ddof=1) of the last {N} weekly log returns (min {meta['min_returns']})",
         f"- rows: {meta['n']} scored · dropped: {meta['dropped'] or 'none'}" + (f" (`unclean_sigma_window` = σ{N} window starts before the ticker's single-basis tail, per `--clean-from`)" if meta.get('clean_from') else f" (no `--clean-from`: a σ{N} window may reach before a ticker's single-basis tail — see caveats)"),
         "- ΔPB = PB(variant) − PB(σN band); negative = variant more accurate. 95% CI: bootstrap over as-of WEEKS (1,000, seed 42).",
         "", "## Segments", ""]
    for title, s in segs:
        L.append(seg_block(title, s))
    L += ["## Verdict", ""]
    if insufficient:
        L += [f"**INSUFFICIENT** — post-{POST} population has n < {MIN_RECENT}; no verdict either way (widen the population).", ""]
    else:
        L += [f"- TimesFM as-is improves on the σ{N} band on both gate populations (G1: ΔPB < 0 and CI hi < 0): **{'YES' if asis_ok else 'NO'}**",
              f"- Any TimesFM variant (as-is / re-centred / symmetric width) improves on σ{N} on both: **{'YES' if any_ok else 'NO'}**", ""]
        if not any_ok:
            L.append(f"**Result: NO IMPROVEMENT.** Everything the model's band knows about the next {meta['horizon']} weeks is reproduced by a {N}-week standard deviation; its median adds noise. Decision rule (operator 2026-08-16): discard TimesFM from the Radar.")
        else:
            L.append("**Result: IMPROVEMENT on some variant** — see table; a variant that only passes after re-centring is a volatility forecaster, not a directional one.")
    L += ["", f"## Annotation value of the σ{N} band — realised 4-week outcome by σ{N} quintile", "",
          "Does volatility at signal time say anything about what follows? (report-only; population = the scored signal-weeks)", "",
          f"| σ{N} quintile | weekly σ range | n | mean realised r | P(r>0) | mean \\|r\\| | cov80 σ{N} | cov80 TFM |", "|---|---|---:|---:|---:|---:|---:|---:|"]
    for q in quint:
        L.append(f"| Q{q['q']} | {pct(q['sigma_lo'])}–{pct(q['sigma_hi'])} | {q['n']} | {fmt(q['mean_y'], 4)} | {pct(q['p_up'])} | {q['mean_abs']:.4f} | {pct(q['cov_base'])} | {pct(q['cov_tfm'])} |")
    if qdiff is not None and not math.isnan(qdiff[0]):
        d, (lo, hi) = qdiff
        sig = "distinguishable from noise" if (lo > 0 or hi < 0) else "NOT distinguishable from noise"
        L += ["", f"P(r>0) Q1 − Q5 = {100 * d:+.1f} pp, 95% CI [{100 * lo:+.1f}, {100 * hi:+.1f}] pp (week-clustered bootstrap) — **{sig}**. Not a filter under the frozen signal logic either way."]
    L += ["", "## Caveats", "",
          "- Post-hoc analysis on the same scored rows as the §5 gate (variants chosen after seeing diagnostics) — a fair *retest of the same claim*, not an independent sample.",
          "- Same universe/survivorship caveats as the §5 reports.",
          (f"- `--clean-from` applied: rows whose σ{N} window starts before the ticker's single-basis tail were dropped (count above)." if meta.get("clean_from")
           else f"- No `--clean-from`: the §5 run filtered cleanliness with a 26-week window; a σ{N} window reaches further back and may include an unreconciled stretch for a few rows (bias widens the BASELINE band, i.e. favours the model)."),
          "- Level-S2 rows (n≈2) are not shown as a segment — too few to describe.", ""]
    return "\n".join(L)


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rows", required=True)
    ap.add_argument("--db", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--sigma-weeks", type=int, default=52)
    ap.add_argument("--horizon", type=int, default=4)
    ap.add_argument("--min-returns", type=int, default=40)
    ap.add_argument("--clean-from", dest="clean_from", help="make-splitbasis-db summary JSON (clean_from map); drops rows whose σN window precedes the ticker's single-basis tail")
    a = ap.parse_args(argv)
    if not os.path.exists(a.rows) or not os.path.exists(a.db) or (a.clean_from and not os.path.exists(a.clean_from)):
        print("missing --rows / --db / --clean-from file", file=sys.stderr)
        return 2
    if a.sigma_weeks <= 0 or a.horizon <= 0 or a.min_returns <= 0:
        print("--sigma-weeks / --horizon / --min-returns must be positive", file=sys.stderr)
        return 2
    clean_from = None
    if a.clean_from:
        with open(a.clean_from) as fh:
            clean_from = json.load(fh)["clean_from"]
    conn = sqlite3.connect(f"file:{os.path.abspath(a.db)}?mode=ro", uri=True)
    rows, dropped = build(load_rows(a.rows), conn, a.sigma_weeks, a.horizon, a.min_returns, clean_from)
    if not rows:
        print("no scorable rows", file=sys.stderr)
        return 2
    seg_all = score(rows)
    seg_post = score([r for r in rows if r["as_of"] >= POST])
    segs = [("all", seg_all), (f"post-{POST}", seg_post),
            ("level S2D", score([r for r in rows if r["level"] == "S2D"])),
            ("level S1", score([r for r in rows if r["level"] == "S1"]))]
    asis_ok, any_ok, insufficient = verdict(seg_all, seg_post)
    quint = quintile_table(rows)
    qdiff = None
    if len(quint) == 5:
        sig = np.array([r["sigma"] for r in rows])
        edges = np.quantile(sig, [0.2, 0.4, 0.6, 0.8])
        qq = np.searchsorted(edges, sig, side="right")
        qdiff = uprate_diff_ci([r for r, k in zip(rows, qq) if k == 0], [r for r, k in zip(rows, qq) if k == 4])
    meta = {"generated": datetime.now(timezone.utc).isoformat(timespec="seconds"), "rows": os.path.abspath(a.rows), "db": os.path.abspath(a.db),
            "sigma_weeks": a.sigma_weeks, "horizon": a.horizon, "min_returns": a.min_returns, "n": len(rows), "dropped": dropped,
            "clean_from": bool(clean_from)}
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, "w") as f:
        f.write(render(meta, segs, quint, qdiff, asis_ok, any_ok, insufficient))
    print(f"wrote {a.out} · n={len(rows)} dropped={dropped or 'none'} · insufficient={insufficient} asis_improves={asis_ok} any_improves={any_ok}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
