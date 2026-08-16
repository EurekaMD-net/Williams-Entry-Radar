# TimesFM Fase 1 — re-test vs σ52 band (stronger naive baseline)

- generated: 2026-08-16T21:20:00+00:00
- scored rows: `/root/claude/williams-entry-radar/results/tfm-backtest/2026-08-16-splitbasis/rows.csv` (from the spec §5 run) · σ52 recomputed from `/root/claude/williams-entry-radar/results/tfm-backtest/radar-splitbasis.db` (read-only)
- horizon 4 · baseline = random walk, r50=0, r10/90 = ∓1.2816·σ52·√h · σ52 = std(ddof=1) of the last 52 weekly log returns (min 40)
- rows: 2821 scored · dropped: {'unclean_sigma_window': 30} (`unclean_sigma_window` = σ52 window starts before the ticker's single-basis tail, per `--clean-from`)
- ΔPB = PB(variant) − PB(σN band); negative = variant more accurate. 95% CI: bootstrap over as-of WEEKS (1,000, seed 42).

## Segments

### all — n=2821 · weeks=369 · σN band: PB 0.0300 · cov80 81.0% · tails 8.2%/10.8% · width 0.261

| variant | PB | ΔPB vs σN mean [95% CI] | cov80 | tails lo/hi | width | G1 beats σN |
|---|---:|---|---:|---|---:|---|
| TimesFM as-is (q10,q50,q90) | 0.0304 | +0.00035 [-0.00015, +0.00090] | 82.7% | 8.1% / 9.2% | 0.271 | ❌ |
| TimesFM re-centred (drift removed) | 0.0301 | +0.00009 [-0.00026, +0.00042] | 82.6% | 7.2% / 10.2% | 0.271 | ❌ |
| TimesFM symmetric width around 0 | 0.0300 | -0.00002 [-0.00033, +0.00027] | 83.1% | 7.2% / 9.6% | 0.271 | ❌ |
| σ26 random walk (spec §5 baseline) | 0.0304 | +0.00037 [+0.00013, +0.00063] | 81.9% | 7.5% / 10.6% | 0.274 | ❌ |

### post-2025-01-01 — n=652 · weeks=79 · σN band: PB 0.0286 · cov80 79.4% · tails 8.9%/11.7% · width 0.236

| variant | PB | ΔPB vs σN mean [95% CI] | cov80 | tails lo/hi | width | G1 beats σN |
|---|---:|---|---:|---|---:|---|
| TimesFM as-is (q10,q50,q90) | 0.0290 | +0.00037 [-0.00037, +0.00114] | 83.7% | 7.7% / 8.6% | 0.250 | ❌ |
| TimesFM re-centred (drift removed) | 0.0288 | +0.00024 [-0.00020, +0.00069] | 82.4% | 6.9% / 10.7% | 0.250 | ❌ |
| TimesFM symmetric width around 0 | 0.0287 | +0.00014 [-0.00033, +0.00059] | 82.5% | 7.2% / 10.3% | 0.250 | ❌ |
| σ26 random walk (spec §5 baseline) | 0.0288 | +0.00023 [-0.00009, +0.00054] | 80.1% | 8.1% / 11.8% | 0.245 | ❌ |

### level S2D — n=581 · weeks=216 · σN band: PB 0.0275 · cov80 85.7% · tails 7.7%/6.5% · width 0.283

| variant | PB | ΔPB vs σN mean [95% CI] | cov80 | tails lo/hi | width | G1 beats σN |
|---|---:|---|---:|---|---:|---|
| TimesFM as-is (q10,q50,q90) | 0.0277 | +0.00025 [-0.00043, +0.00090] | 85.5% | 7.6% / 6.9% | 0.276 | ❌ |
| TimesFM re-centred (drift removed) | 0.0276 | +0.00015 [-0.00036, +0.00062] | 85.0% | 7.4% / 7.6% | 0.276 | ❌ |
| TimesFM symmetric width around 0 | 0.0276 | +0.00016 [-0.00031, +0.00062] | 86.1% | 7.2% / 6.7% | 0.276 | ❌ |
| σ26 random walk (spec §5 baseline) | 0.0284 | +0.00089 [+0.00048, +0.00128] | 87.1% | 6.7% / 6.2% | 0.301 | ❌ |

### level S1 — n=2238 · weeks=351 · σN band: PB 0.0307 · cov80 79.8% · tails 8.3%/11.9% · width 0.256

| variant | PB | ΔPB vs σN mean [95% CI] | cov80 | tails lo/hi | width | G1 beats σN |
|---|---:|---|---:|---|---:|---|
| TimesFM as-is (q10,q50,q90) | 0.0311 | +0.00037 [-0.00026, +0.00098] | 82.0% | 8.2% / 9.8% | 0.269 | ❌ |
| TimesFM re-centred (drift removed) | 0.0308 | +0.00007 [-0.00041, +0.00047] | 82.0% | 7.1% / 10.9% | 0.269 | ❌ |
| TimesFM symmetric width around 0 | 0.0306 | -0.00007 [-0.00047, +0.00028] | 82.4% | 7.2% / 10.4% | 0.269 | ❌ |
| σ26 random walk (spec §5 baseline) | 0.0309 | +0.00023 [-0.00002, +0.00050] | 80.5% | 7.7% / 11.8% | 0.268 | ❌ |

## Verdict

- TimesFM as-is improves on the σ52 band on both gate populations (G1: ΔPB < 0 and CI hi < 0): **NO**
- Any TimesFM variant (as-is / re-centred / symmetric width) improves on σ52 on both: **NO**

**Result: NO IMPROVEMENT.** Everything the model's band knows about the next 4 weeks is reproduced by a 52-week standard deviation; its median adds noise. Decision rule (operator 2026-08-16): discard TimesFM from the Radar.

## Annotation value of the σ52 band — realised 4-week outcome by σ52 quintile

Does volatility at signal time say anything about what follows? (report-only; population = the scored signal-weeks)

| σ52 quintile | weekly σ range | n | mean realised r | P(r>0) | mean \|r\| | cov80 σ52 | cov80 TFM |
|---|---|---:|---:|---:|---:|---:|---:|
| Q1 | 2.3%–3.8% | 564 | +0.0106 | 59.6% | 0.0594 | 75.2% | 80.7% |
| Q2 | 3.8%–4.6% | 564 | +0.0166 | 59.4% | 0.0701 | 81.6% | 81.7% |
| Q3 | 4.6%–5.7% | 564 | +0.0053 | 52.0% | 0.0802 | 82.1% | 82.8% |
| Q4 | 5.7%–7.7% | 564 | +0.0136 | 54.4% | 0.1015 | 82.8% | 83.2% |
| Q5 | 7.7%–26.5% | 565 | +0.0069 | 55.2% | 0.1500 | 83.5% | 85.3% |

P(r>0) Q1 − Q5 = +4.4 pp, 95% CI [-3.0, +11.4] pp (week-clustered bootstrap) — **NOT distinguishable from noise**. Not a filter under the frozen signal logic either way.

## Caveats

- Post-hoc analysis on the same scored rows as the §5 gate (variants chosen after seeing diagnostics) — a fair *retest of the same claim*, not an independent sample.
- Same universe/survivorship caveats as the §5 reports.
- `--clean-from` applied: rows whose σ52 window starts before the ticker's single-basis tail were dropped (count above).
- Level-S2 rows (n≈2) are not shown as a segment — too few to describe.
