# TimesFM Fase 1 — calibration backtest report

- generated: 2026-08-16T17:04:12+00:00
- model: `google/timesfm-2.5-200m-pytorch` · lib `timesfm==2.0.2` · horizon 4 · context 512
- population: 1379 signal-weeks since 2025-10-03 across 388 tickers (cap 3000 → 1379 candidates); dropped: none
- scored rows: 1379 · post-2025-01-01: 1379 (gate needs ≥150)
- metric space: log return over h weeks; TimesFM quantiles = ln(pXX/last_close); baseline = random walk with 26-week realised σ (r50=0, r10/90=∓1.2816·σ·√h)
- ΔPB CI: 95% bootstrap over as-of WEEKS (1,000 resamples, seed 42) — same-week returns share the market

## Segments

| segment | n | weeks | PB tfm | PB base | ΔPB mean [95% CI] | cov80 tfm / base | tails tfm (lo/hi) | width tfm / base | dir hit [CI] (n) | asym med [IQR] |
|---|---:|---:|---:|---:|---|---|---|---|---|---:|
| all | 1379 | 43 | 0.0273 | 0.0268 | 0.00054 [0.00016, 0.00094] | 82.5% / 79.8% | 8.3% / 9.2% | 0.258 / 0.242 | 51.3% [48.5%, 54.1%] (1251) | 0.96 [0.87, 1.07] |
| post-2025-01-01 | 1379 | 43 | 0.0273 | 0.0268 | 0.00054 [0.00016, 0.00094] | 82.5% / 79.8% | 8.3% / 9.2% | 0.258 / 0.242 | 51.3% [48.5%, 54.1%] (1251) | 0.96 [0.87, 1.07] |
| pre-2025-01-01 | 0 | | | | | | | | | |
| level S2 * | 5 | 5 | 0.0198 | 0.0180 | 0.00181 [-0.00134, 0.00524] | 80.0% / 100.0% | 0.0% / 20.0% | 0.204 / 0.238 | 20.0% [3.6%, 62.4%] (5) | 0.96 [0.88, 1.02] |
| level S2D | 244 | 43 | 0.0306 | 0.0301 | 0.00051 [-0.00040, 0.00170] | 81.1% / 80.7% | 8.6% / 10.2% | 0.269 / 0.269 | 54.8% [48.2%, 61.2%] (221) | 0.96 [0.87, 1.06] |
| level S1 | 1130 | 43 | 0.0266 | 0.0261 | 0.00054 [0.00014, 0.00096] | 82.7% / 79.5% | 8.3% / 8.9% | 0.254 / 0.240 | 50.7% [47.7%, 53.8%] (1025) | 0.96 [0.87, 1.07] |

(*) n < 30: descriptive only — CIs over so few clusters are not meaningful.

## Gate (spec §5)

| population | n | G1 beats baseline | G2 coverage ∈ [70%, 90%] | G3 tails ∈ [4%, 18%] | result |
|---|---|---|---|---|---|
| all | n=1379 | ❌ ΔPB 0.00054 CI hi 0.00094 | ✅ cov 82.5% | ✅ tails 8.3%/9.2% | **FAIL** |
| post-2025-01-01 | n=1379 | ❌ ΔPB 0.00054 CI hi 0.00094 | ✅ cov 82.5% | ✅ tails 8.3%/9.2% | **FAIL** |

## Verdict: **FAIL**

PASS requires all three gates on BOTH populations. FAIL ⇒ the sidecar is not wired (spec §5). INSUFFICIENT ⇒ the recent subset is too small to judge; widen the population before deciding.

## Caveats

- Pre-2025 windows may be optimistic if TimesFM's pretraining corpus contained public equity series (cutoff not published in enough detail).
- Universe is today's active registry — survivorship inflates realised returns slightly; second-order for calibration.
- radar.db has an adjustment seam at 2024-07-19: earlier bars are Alpha Vantage dividend-adjusted closes, later bars Polygon split-adjusted only (166/387 tickers jump >5% in that week). Rows whose realised-return or σ window spans the seam are dropped (`seam_window`); the 512-bar model context still contains the seam for post-2025 rows (a one-off level shift the model sees as history). Same series feeds model and baseline.
