# TimesFM Fase 1 — re-test vs σ26 band (stronger naive baseline)

- generated: 2026-08-16T21:20:20+00:00
- scored rows: `/root/claude/williams-entry-radar/results/tfm-backtest/2026-08-16-splitbasis/rows.csv` (from the spec §5 run) · σ26 recomputed from `/root/claude/williams-entry-radar/results/tfm-backtest/radar-splitbasis.db` (read-only)
- horizon 4 · baseline = random walk, r50=0, r10/90 = ∓1.2816·σ26·√h · σ26 = std(ddof=1) of the last 26 weekly log returns (min 12)
- rows: 2851 scored · dropped: none (`unclean_sigma_window` = σ26 window starts before the ticker's single-basis tail, per `--clean-from`)
- ΔPB = PB(variant) − PB(σN band); negative = variant more accurate. 95% CI: bootstrap over as-of WEEKS (1,000, seed 42).

## Segments

### all — n=2851 · weeks=369 · σN band: PB 0.0303 · cov80 81.9% · tails 7.5%/10.7% · width 0.274

| variant | PB | ΔPB vs σN mean [95% CI] | cov80 | tails lo/hi | width | G1 beats σN |
|---|---:|---|---:|---|---:|---|
| TimesFM as-is (q10,q50,q90) | 0.0303 | -0.00001 [-0.00049, +0.00046] | 82.8% | 8.0% / 9.2% | 0.271 | ❌ |
| TimesFM re-centred (drift removed) | 0.0300 | -0.00027 [-0.00064, +0.00003] | 82.7% | 7.1% / 10.2% | 0.271 | ❌ |
| TimesFM symmetric width around 0 | 0.0299 | -0.00039 [-0.00074, -0.00008] | 83.2% | 7.2% / 9.6% | 0.271 | ✅ |
| σ26 random walk (spec §5 baseline) | 0.0303 | +0.00000 [-0.00000, +0.00000] | 81.9% | 7.5% / 10.7% | 0.274 | ❌ |

### post-2025-01-01 — n=665 · weeks=79 · σN band: PB 0.0286 · cov80 80.3% · tails 8.0%/11.7% · width 0.245

| variant | PB | ΔPB vs σN mean [95% CI] | cov80 | tails lo/hi | width | G1 beats σN |
|---|---:|---|---:|---|---:|---|
| TimesFM as-is (q10,q50,q90) | 0.0287 | +0.00015 [-0.00049, +0.00082] | 84.1% | 7.5% / 8.4% | 0.250 | ❌ |
| TimesFM re-centred (drift removed) | 0.0286 | +0.00000 [-0.00047, +0.00046] | 82.7% | 6.8% / 10.5% | 0.250 | ❌ |
| TimesFM symmetric width around 0 | 0.0285 | -0.00009 [-0.00057, +0.00039] | 82.9% | 7.1% / 10.1% | 0.250 | ❌ |
| σ26 random walk (spec §5 baseline) | 0.0286 | +0.00000 [-0.00000, +0.00000] | 80.3% | 8.0% / 11.7% | 0.245 | ❌ |

### level S2D — n=587 · weeks=216 · σN band: PB 0.0282 · cov80 87.2% · tails 6.6%/6.1% · width 0.299

| variant | PB | ΔPB vs σN mean [95% CI] | cov80 | tails lo/hi | width | G1 beats σN |
|---|---:|---|---:|---|---:|---|
| TimesFM as-is (q10,q50,q90) | 0.0276 | -0.00064 [-0.00141, +0.00014] | 85.7% | 7.5% / 6.8% | 0.276 | ❌ |
| TimesFM re-centred (drift removed) | 0.0275 | -0.00072 [-0.00126, -0.00022] | 85.2% | 7.3% / 7.5% | 0.276 | ✅ |
| TimesFM symmetric width around 0 | 0.0275 | -0.00072 [-0.00125, -0.00022] | 86.2% | 7.2% / 6.6% | 0.276 | ✅ |
| σ26 random walk (spec §5 baseline) | 0.0282 | +0.00000 [-0.00000, +0.00000] | 87.2% | 6.6% / 6.1% | 0.299 | ❌ |

### level S1 — n=2262 · weeks=351 · σN band: PB 0.0308 · cov80 80.5% · tails 7.7%/11.8% · width 0.267

| variant | PB | ΔPB vs σN mean [95% CI] | cov80 | tails lo/hi | width | G1 beats σN |
|---|---:|---|---:|---|---:|---|
| TimesFM as-is (q10,q50,q90) | 0.0310 | +0.00015 [-0.00042, +0.00071] | 82.1% | 8.2% / 9.8% | 0.269 | ❌ |
| TimesFM re-centred (drift removed) | 0.0307 | -0.00016 [-0.00063, +0.00021] | 82.1% | 7.1% / 10.9% | 0.269 | ❌ |
| TimesFM symmetric width around 0 | 0.0305 | -0.00030 [-0.00069, +0.00004] | 82.4% | 7.2% / 10.4% | 0.269 | ❌ |
| σ26 random walk (spec §5 baseline) | 0.0308 | +0.00000 [-0.00000, +0.00000] | 80.5% | 7.7% / 11.8% | 0.267 | ❌ |

## Verdict

- TimesFM as-is improves on the σ26 band on both gate populations (G1: ΔPB < 0 and CI hi < 0): **NO**
- Any TimesFM variant (as-is / re-centred / symmetric width) improves on σ26 on both: **NO**

**Result: NO IMPROVEMENT.** Everything the model's band knows about the next 4 weeks is reproduced by a 26-week standard deviation; its median adds noise. Decision rule (operator 2026-08-16): discard TimesFM from the Radar.

## Annotation value of the σ26 band — realised 4-week outcome by σ26 quintile

Does volatility at signal time say anything about what follows? (report-only; population = the scored signal-weeks)

| σ26 quintile | weekly σ range | n | mean realised r | P(r>0) | mean \|r\| | cov80 σ26 | cov80 TFM |
|---|---|---:|---:|---:|---:|---:|---:|
| Q1 | 2.2%–3.9% | 570 | +0.0144 | 60.5% | 0.0588 | 73.9% | 80.5% |
| Q2 | 3.9%–4.8% | 570 | +0.0080 | 56.3% | 0.0669 | 83.3% | 83.2% |
| Q3 | 4.8%–6.0% | 570 | +0.0132 | 56.7% | 0.0899 | 78.9% | 80.5% |
| Q4 | 6.0%–8.0% | 570 | +0.0117 | 53.7% | 0.1035 | 84.4% | 83.7% |
| Q5 | 8.0%–36.6% | 571 | +0.0067 | 54.3% | 0.1405 | 88.8% | 86.2% |

P(r>0) Q1 − Q5 = +6.2 pp, 95% CI [-0.8, +13.3] pp (week-clustered bootstrap) — **NOT distinguishable from noise**. Not a filter under the frozen signal logic either way.

## Caveats

- Post-hoc analysis on the same scored rows as the §5 gate (variants chosen after seeing diagnostics) — a fair *retest of the same claim*, not an independent sample.
- Same universe/survivorship caveats as the §5 reports.
- `--clean-from` applied: rows whose σ26 window starts before the ticker's single-basis tail were dropped (count above).
- Level-S2 rows (n≈2) are not shown as a segment — too few to describe.
