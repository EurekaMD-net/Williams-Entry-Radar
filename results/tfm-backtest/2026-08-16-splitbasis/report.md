# TimesFM Fase 1 — calibration backtest report

- generated: 2026-08-16T19:57:02+00:00
- model: `google/timesfm-2.5-200m-pytorch` · lib `timesfm==2.0.2` · horizon 4 · context 512
- source DB: population `/root/claude/williams-entry-radar/results/tfm-backtest/radar-splitbasis.db` · forecasts `/root/claude/williams-entry-radar/results/tfm-backtest/radar-splitbasis.db`
- population: 14695 signal-weeks since 2019-01-01 across 388 tickers (cap 3000 → 3001 candidates); dropped: {'unclean_window': 146, 'forecast_error': 4}
- scored rows: 2851 · post-2025-01-01: 665 (gate needs ≥150)
- metric space: log return over h weeks; TimesFM quantiles = ln(pXX/last_close); baseline = random walk with 26-week realised σ (r50=0, r10/90=∓1.2816·σ·√h)
- ΔPB CI: 95% bootstrap over as-of WEEKS (1,000 resamples, seed 42) — same-week returns share the market

## Segments

| segment | n | weeks | PB tfm | PB base | ΔPB mean [95% CI] | cov80 tfm / base | tails tfm (lo/hi) | width tfm / base | dir hit [CI] (n) | asym med [IQR] |
|---|---:|---:|---:|---:|---|---|---|---|---|---:|
| all | 2851 | 369 | 0.0303 | 0.0303 | -0.00001 [-0.00049, 0.00046] | 82.8% / 81.9% | 8.0% / 9.2% | 0.271 / 0.274 | 52.5% [50.5%, 54.4%] (2581) | 0.96 [0.87, 1.07] |
| post-2025-01-01 | 665 | 79 | 0.0287 | 0.0286 | 0.00015 [-0.00049, 0.00082] | 84.1% / 80.3% | 7.5% / 8.4% | 0.250 / 0.245 | 52.2% [48.2%, 56.2%] (592) | 0.95 [0.86, 1.05] |
| pre-2025-01-01 | 2186 | 290 | 0.0307 | 0.0308 | -0.00005 [-0.00061, 0.00051] | 82.4% / 82.3% | 8.2% / 9.4% | 0.283 / 0.284 | 52.5% [50.3%, 54.7%] (1989) | 0.96 [0.87, 1.08] |
| level S2 * | 2 | 2 | 0.0272 | 0.0199 | 0.00730 [0.00619, 0.00841] | 100.0% / 100.0% | 0.0% / 0.0% | 0.335 / 0.250 | 0.0% [0.0%, 65.8%] (2) | 0.87 [0.84, 0.89] |
| level S2D | 587 | 216 | 0.0276 | 0.0282 | -0.00064 [-0.00141, 0.00014] | 85.7% / 87.2% | 7.5% / 6.8% | 0.276 / 0.299 | 52.0% [47.7%, 56.2%] (531) | 0.96 [0.86, 1.05] |
| level S1 | 2262 | 351 | 0.0310 | 0.0308 | 0.00015 [-0.00042, 0.00071] | 82.1% / 80.5% | 8.2% / 9.8% | 0.269 / 0.267 | 52.6% [50.5%, 54.8%] (2048) | 0.96 [0.87, 1.08] |

(*) n < 30: descriptive only — CIs over so few clusters are not meaningful.

## Gate (spec §5)

| population | n | G1 beats baseline | G2 coverage ∈ [70%, 90%] | G3 tails ∈ [4%, 18%] | result |
|---|---|---|---|---|---|
| all | n=2851 | ❌ ΔPB -0.00001 CI hi 0.00046 | ✅ cov 82.8% | ✅ tails 8.0%/9.2% | **FAIL** |
| post-2025-01-01 | n=665 | ❌ ΔPB 0.00015 CI hi 0.00082 | ✅ cov 84.1% | ✅ tails 7.5%/8.4% | **FAIL** |

## Verdict: **FAIL**

PASS requires all three gates on BOTH populations. FAIL ⇒ the sidecar is not wired (spec §5). INSUFFICIENT ⇒ the recent subset is too small to judge; widen the population before deciding.

## Caveats

- Pre-2025 windows may be optimistic if TimesFM's pretraining corpus contained public equity series (cutoff not published in enough detail).
- Universe is today's active registry — survivorship inflates realised returns slightly; second-order for calibration.
- seam filter OFF: the source DB is the split-basis copy (make-splitbasis-db.py); rows whose σ window reaches into a ticker's unreconcilable (spin-off) stretch are dropped as `unclean_window`; the model context still reaches into an unreconciled stretch for 427 of 2851 scored rows (level shift seen as history).
