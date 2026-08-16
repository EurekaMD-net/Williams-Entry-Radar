# TimesFM Fase 1 — calibration backtest report

- generated: 2026-08-16T17:01:26+00:00
- model: `google/timesfm-2.5-200m-pytorch` · lib `timesfm==2.0.2` · horizon 4 · context 512
- population: 1379 signal-weeks since 2025-10-03 across 388 tickers (cap 3000 → 1379 candidates); dropped: none
- scored rows: 1379 · post-2025-01-01: 1379 (gate needs ≥150)
- metric space: log return over h weeks; TimesFM quantiles = ln(pXX/last_close); baseline = random walk with 26-week realised σ (r50=0, r10/90=∓1.2816·σ·√h)
- ΔPB CI: 95% bootstrap over as-of WEEKS (1,000 resamples, seed 42) — same-week returns share the market

## Segments

| segment | n | weeks | PB tfm | PB base | ΔPB mean [95% CI] | cov80 tfm / base | tails tfm (lo/hi) | width tfm / base | dir hit [CI] (n) | asym med [IQR] |
|---|---:|---:|---:|---:|---|---|---|---|---|---:|
| all | 1379 | 43 | 0.0273 | 0.0268 | 0.00054 [-0.00004, 0.00116] | 81.3% / 79.8% | 9.4% / 9.3% | 0.247 / 0.242 | 53.8% [51.0%, 56.5%] (1302) | 0.92 [0.83, 1.02] |
| post-2025-01-01 | 1379 | 43 | 0.0273 | 0.0268 | 0.00054 [-0.00004, 0.00116] | 81.3% / 79.8% | 9.4% / 9.3% | 0.247 / 0.242 | 53.8% [51.0%, 56.5%] (1302) | 0.92 [0.83, 1.02] |
| pre-2025-01-01 | 0 | | | | | | | | | |
| level S2 * | 5 | 5 | 0.0189 | 0.0180 | 0.00082 [-0.00148, 0.00437] | 80.0% / 100.0% | 0.0% / 20.0% | 0.192 / 0.238 | 75.0% [30.1%, 95.4%] (4) | 1.11 [0.90, 1.12] |
| level S2D | 244 | 43 | 0.0316 | 0.0301 | 0.00154 [-0.00029, 0.00419] | 77.5% / 80.7% | 10.7% / 11.9% | 0.261 / 0.269 | 52.2% [45.7%, 58.6%] (226) | 0.91 [0.82, 1.01] |
| level S1 | 1130 | 43 | 0.0264 | 0.0261 | 0.00033 [-0.00021, 0.00094] | 82.1% / 79.5% | 9.2% / 8.7% | 0.241 / 0.240 | 54.0% [51.0%, 57.0%] (1072) | 0.92 [0.83, 1.03] |

(*) n < 30: descriptive only — CIs over so few clusters are not meaningful.

## Gate (spec §5)

| population | n | G1 beats baseline | G2 coverage ∈ [70%, 90%] | G3 tails ∈ [4%, 18%] | result |
|---|---|---|---|---|---|
| all | n=1379 | ❌ ΔPB 0.00054 CI hi 0.00116 | ✅ cov 81.3% | ✅ tails 9.4%/9.3% | **FAIL** |
| post-2025-01-01 | n=1379 | ❌ ΔPB 0.00054 CI hi 0.00116 | ✅ cov 81.3% | ✅ tails 9.4%/9.3% | **FAIL** |

## Verdict: **FAIL**

PASS requires all three gates on BOTH populations. FAIL ⇒ the sidecar is not wired (spec §5). INSUFFICIENT ⇒ the recent subset is too small to judge; widen the population before deciding.

## Caveats

- Pre-2025 windows may be optimistic if TimesFM's pretraining corpus contained public equity series (cutoff not published in enough detail).
- Universe is today's active registry — survivorship inflates realised returns slightly; second-order for calibration.
- radar.db has an adjustment seam at 2024-07-19: earlier bars are Alpha Vantage dividend-adjusted closes, later bars Polygon split-adjusted only (166/387 tickers jump >5% in that week). Rows whose realised-return or σ window spans the seam are dropped (`seam_window`); the 512-bar model context still contains the seam for post-2025 rows (a one-off level shift the model sees as history). Same series feeds model and baseline.
