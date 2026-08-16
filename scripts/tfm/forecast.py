#!/opt/timesfm/bin/python
"""TimesFM 2.5 sidecar forecaster for the Williams Radar — Fase 1.

Reads weekly closes from radar.db (READ-ONLY), asks TimesFM for the h-week
P10/P50/P90, and writes one JSON object per row next to a random-walk baseline.
Nothing here touches src/ or writes to radar.db. Spec: docs/timesfm-fase1-spec.md §3.2.

Usage:
  forecast.py --db data/radar.db --out FILE.json [--horizon 4] [--context 512]
              (--tickers BSX,AAPL [--as-of YYYY-MM-DD] | --rows ROWS.json) [--limit N]

Exit: 0 if >=1 row succeeded · 2 if none succeeded · 1 on setup errors.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sqlite3
import sys
import time
from datetime import datetime, timezone

import numpy as np

MODEL_ID = "google/timesfm-2.5-200m-pytorch"
LIB = "timesfm==2.0.2"
Z80 = 1.2816  # one-sided z for the 10%/90% quantiles
MIN_BARS = 64
SIGMA_WINDOW = 26  # weekly log returns for the random-walk band
SIGMA_MIN = 12
BATCH = 32
# quant[..., 0] is the mean; columns 1..9 are q10..q90
QUANTILE_IDX = {"p10": 1, "p50": 5, "p90": 9}


def log(msg: str) -> None:
    print(f"[tfm-forecast] {msg}", file=sys.stderr, flush=True)


# ---------------------------------------------------------------------------
# Data
# ---------------------------------------------------------------------------
def open_db(path: str) -> sqlite3.Connection:
    return sqlite3.connect(f"file:{path}?mode=ro", uri=True)


def load_closes(conn: sqlite3.Connection, ticker: str, as_of: str | None, context: int) -> tuple[list[str], np.ndarray]:
    """Last `context` closes for `ticker` with date <= as_of (or all), ascending."""
    if as_of:
        cur = conn.execute(
            "SELECT date, close FROM weekly_bars WHERE ticker=? AND date<=? ORDER BY date DESC LIMIT ?",
            (ticker, as_of, context),
        )
    else:
        cur = conn.execute(
            "SELECT date, close FROM weekly_bars WHERE ticker=? ORDER BY date DESC LIMIT ?",
            (ticker, context),
        )
    rows = cur.fetchall()[::-1]
    return [r[0] for r in rows], np.asarray([r[1] for r in rows], dtype=np.float64)


def baseline(closes: np.ndarray, horizon: int) -> dict | None:
    """Random walk in log space: r50 = 0, r10/r90 = -/+ Z80 * sigma_w * sqrt(h)."""
    rets = np.diff(np.log(closes[-(SIGMA_WINDOW + 1):]))
    if len(rets) < SIGMA_MIN:
        return None
    sigma = float(np.std(rets, ddof=1))
    band = Z80 * sigma * math.sqrt(horizon)
    return {"sigma_w": round(sigma, 6), "r10": round(-band, 6), "r50": 0.0, "r90": round(band, 6)}


# ---------------------------------------------------------------------------
# Model
# ---------------------------------------------------------------------------
def load_model(context: int, horizon: int):
    import torch  # noqa: WPS433 — heavy import kept out of the test path
    import timesfm

    torch.set_num_threads(int(os.environ.get("TFM_THREADS", "2")))
    torch.set_float32_matmul_precision("high")
    model = timesfm.TimesFM_2p5_200M_torch.from_pretrained(MODEL_ID)
    model.compile(
        timesfm.ForecastConfig(
            max_context=context,
            max_horizon=max(8, horizon),
            normalize_inputs=True,
            use_continuous_quantile_head=True,
            force_flip_invariance=True,
            infer_is_positive=True,
            fix_quantile_crossing=True,
            per_core_batch_size=BATCH,
        )
    )
    return model


def extract_quantiles(quant: np.ndarray, i: int, horizon: int) -> dict[str, float]:
    """quant: (n, >=horizon, 10). Returns level-space p10/p50/p90 at step `horizon`."""
    if quant.ndim != 3 or quant.shape[-1] != 10:
        raise ValueError(f"unexpected quantile tensor shape {quant.shape}; expected (n, h, 10)")
    step = quant[i, horizon - 1, :]
    return {k: float(step[idx]) for k, idx in QUANTILE_IDX.items()}


def build_row(ticker: str, as_of: str, dates: list[str], closes: np.ndarray, q: dict[str, float], horizon: int) -> dict:
    last = float(closes[-1])
    if not (q["p10"] < q["p50"] < q["p90"]) or q["p10"] <= 0:
        raise ValueError(f"quantile crossing/non-positive: {q}")
    r10, r50, r90 = (math.log(q[k] / last) for k in ("p10", "p50", "p90"))
    asym = (r90 - r50) / (r50 - r10) if (r50 - r10) > 0 else None
    return {
        "ticker": ticker,
        "as_of": as_of or dates[-1],
        "last_bar": dates[-1],
        "bars_used": int(len(closes)),
        "last_close": round(last, 4),
        "horizon": horizon,
        "p10": round(q["p10"], 4),
        "p50": round(q["p50"], 4),
        "p90": round(q["p90"], 4),
        "r10": round(r10, 6),
        "r50": round(r50, 6),
        "r90": round(r90, 6),
        "asym_log": round(asym, 4) if asym is not None else None,
        "baseline": baseline(closes, horizon),
        "model": MODEL_ID,
        "lib": LIB,
    }


def forecast_rows(model, conn: sqlite3.Connection, rows: list[dict], horizon: int, context: int) -> list[dict]:
    """Forecast every {ticker, as_of?} row in batches of BATCH. Per-row failures become error rows."""
    out: list[dict] = []
    pending: list[tuple[dict, list[str], np.ndarray]] = []
    t0 = time.time()

    def flush() -> None:
        if not pending:
            return
        try:
            _, quant = model.forecast(horizon=horizon, inputs=[c for _, _, c in pending])
            quant = np.asarray(quant)
        except Exception as e:  # one bad batch must not kill the run
            for row, _, _ in pending:
                out.append({"ticker": row["ticker"], "as_of": row.get("as_of"), "error": f"forecast: {e}"})
            pending.clear()
            return
        for i, (row, dates, closes) in enumerate(pending):
            try:
                q = extract_quantiles(quant, i, horizon)
                out.append(build_row(row["ticker"], row.get("as_of"), dates, closes, q, horizon))
            except Exception as e:
                out.append({"ticker": row["ticker"], "as_of": row.get("as_of"), "error": str(e)})
        pending.clear()
        done = len(out)
        log(f"{done}/{len(rows)} rows · {time.time() - t0:.0f}s elapsed")

    for row in rows:
        ticker, as_of = row["ticker"], row.get("as_of")
        dates, closes = load_closes(conn, ticker, as_of, context)
        if len(closes) < MIN_BARS:
            out.append({"ticker": ticker, "as_of": as_of, "error": f"only {len(closes)} bars (<{MIN_BARS})"})
            continue
        if not np.all(np.isfinite(closes)) or np.any(closes <= 0):
            out.append({"ticker": ticker, "as_of": as_of, "error": "non-finite or non-positive close in series"})
            continue
        pending.append((row, dates, closes))
        if len(pending) >= BATCH:
            flush()
    flush()
    return out


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--db", default="data/radar.db")
    p.add_argument("--out", required=True)
    p.add_argument("--horizon", type=int, default=4)
    p.add_argument("--context", type=int, default=512)
    p.add_argument("--limit", type=int, default=0, help="only the first N rows (timing runs)")
    src = p.add_mutually_exclusive_group(required=True)
    src.add_argument("--tickers", help="comma-separated tickers, forecast from the last bar (or --as-of)")
    src.add_argument("--rows", help="JSON with {rows:[{ticker, as_of}]} or a bare list (backtest mode)")
    p.add_argument("--as-of", dest="as_of", help="only with --tickers: last bar <= this date")
    return p.parse_args(argv)


def load_rows(args: argparse.Namespace) -> list[dict]:
    if args.tickers:
        return [{"ticker": t.strip().upper(), "as_of": args.as_of} for t in args.tickers.split(",") if t.strip()]
    with open(args.rows) as fh:
        data = json.load(fh)
    rows = data["rows"] if isinstance(data, dict) else data
    return [{"ticker": r["ticker"], "as_of": r["as_of"]} for r in rows]


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    if args.horizon < 1 or args.context < MIN_BARS:
        log(f"bad --horizon/--context ({args.horizon}/{args.context})")
        return 1
    if args.rows and args.as_of:
        log("--as-of only applies to --tickers; --rows carries its own as_of per row")
        return 1
    rows = load_rows(args)
    if args.limit:
        rows = rows[: args.limit]
    if not rows:
        log("no rows to forecast")
        return 1
    try:
        conn = open_db(args.db)
        conn.execute("SELECT 1 FROM weekly_bars LIMIT 1")
    except Exception as e:
        log(f"cannot open {args.db} read-only: {e}")
        return 1
    try:
        t0 = time.time()
        model = load_model(args.context, args.horizon)
        log(f"model ready in {time.time() - t0:.0f}s ({MODEL_ID}, context={args.context}, horizon={args.horizon})")
    except Exception as e:
        log(f"model load failed: {e}")
        return 1

    results = forecast_rows(model, conn, rows, args.horizon, args.context)
    n_ok = sum(1 for r in results if "error" not in r)
    payload = {
        "meta": {
            "model": MODEL_ID,
            "lib": LIB,
            "horizon": args.horizon,
            "context": args.context,
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "n_rows": len(results),
            "n_ok": n_ok,
            "n_err": len(results) - n_ok,
        },
        "rows": results,
    }
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w") as fh:
        json.dump(payload, fh, indent=1)
    log(f"wrote {args.out}: {n_ok} ok / {len(results) - n_ok} error rows")
    return 0 if n_ok else 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
