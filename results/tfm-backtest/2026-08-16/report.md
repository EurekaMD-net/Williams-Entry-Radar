# TimesFM Fase 1 — calibration backtest report

- generated: 2026-08-16T16:51:43+00:00
- model: `google/timesfm-2.5-200m-pytorch` · lib `timesfm==2.0.2` · horizon 4 · context 512
- population: 14392 signal-weeks since 2019-01-01 across 388 tickers (cap 3000 → 2999 candidates); dropped: {'forecast_error': 10, 'seam_window': 207}
- scored rows: 2782 · post-2025-01-01: 645 (gate needs ≥150)
- metric space: log return over h weeks; TimesFM quantiles = ln(pXX/last_close); baseline = random walk with 26-week realised σ (r50=0, r10/90=∓1.2816·σ·√h)
- ΔPB CI: 95% bootstrap over as-of WEEKS (1,000 resamples, seed 42) — same-week returns share the market

## Segments

| segment | n | weeks | PB tfm | PB base | ΔPB mean [95% CI] | cov80 tfm / base | tails tfm (lo/hi) | width tfm / base | dir hit [CI] (n) | asym med [IQR] |
|---|---:|---:|---:|---:|---|---|---|---|---|---:|
| all | 2782 | 333 | 0.0304 | 0.0301 | 0.00024 [-0.00023, 0.00071] | 81.8% / 81.0% | 7.3% / 10.9% | 0.275 / 0.276 | 53.4% [51.5%, 55.4%] (2549) | 0.96 [0.87, 1.08] |
| post-2025-01-01 | 645 | 78 | 0.0276 | 0.0273 | 0.00026 [-0.00041, 0.00093] | 83.6% / 80.8% | 6.5% / 9.9% | 0.261 / 0.254 | 54.8% [50.7%, 58.7%] (588) | 0.97 [0.87, 1.07] |
| pre-2025-01-01 | 2137 | 255 | 0.0312 | 0.0310 | 0.00023 [-0.00039, 0.00079] | 81.2% / 81.0% | 7.6% / 11.2% | 0.280 / 0.282 | 53.0% [50.8%, 55.2%] (1961) | 0.96 [0.87, 1.08] |
| level S2 * | 6 | 6 | 0.0253 | 0.0227 | 0.00260 [-0.00017, 0.00483] | 83.3% / 100.0% | 0.0% / 16.7% | 0.339 / 0.286 | 33.3% [9.7%, 70.0%] (6) | 0.86 [0.83, 0.95] |
| level S2D | 551 | 179 | 0.0299 | 0.0308 | -0.00084 [-0.00190, 0.00021] | 83.3% / 84.4% | 7.4% / 9.3% | 0.269 / 0.286 | 54.6% [50.3%, 58.9%] (511) | 0.94 [0.86, 1.05] |
| level S1 | 2225 | 328 | 0.0305 | 0.0300 | 0.00050 [0.00003, 0.00094] | 81.4% / 80.1% | 7.3% / 11.3% | 0.277 / 0.273 | 53.2% [51.0%, 55.4%] (2032) | 0.97 [0.87, 1.09] |

(*) n < 30: descriptive only — CIs over so few clusters are not meaningful.

## Gate (spec §5)

| population | n | G1 beats baseline | G2 coverage ∈ [70%, 90%] | G3 tails ∈ [4%, 18%] | result |
|---|---|---|---|---|---|
| all | n=2782 | ❌ ΔPB 0.00024 CI hi 0.00071 | ✅ cov 81.8% | ✅ tails 7.3%/10.9% | **FAIL** |
| post-2025-01-01 | n=645 | ❌ ΔPB 0.00026 CI hi 0.00093 | ✅ cov 83.6% | ✅ tails 6.5%/9.9% | **FAIL** |

## Verdict: **FAIL**

PASS requires all three gates on BOTH populations. FAIL ⇒ the sidecar is not wired (spec §5). INSUFFICIENT ⇒ the recent subset is too small to judge; widen the population before deciding.

## Caveats

- Pre-2025 windows may be optimistic if TimesFM's pretraining corpus contained public equity series (cutoff not published in enough detail).
- Universe is today's active registry — survivorship inflates realised returns slightly; second-order for calibration.
- radar.db has an adjustment seam at 2024-07-19: earlier bars are Alpha Vantage dividend-adjusted closes, later bars Polygon split-adjusted only (166/387 tickers jump >5% in that week). Rows whose realised-return or σ window spans the seam are dropped (`seam_window`); the 512-bar model context still contains the seam for post-2025 rows (a one-off level shift the model sees as history). Same series feeds model and baseline.
