# TimesFM × Williams Radar — Fase 1 Spec (zero-touch sidecar + calibration gate)

> **Status:** EXECUTED 2026-08-16 — gate **FAIL (G1)** in three runs (mixed DB with seam exclusion · Polygon-only window · dividend/split-corrected single-basis copy): calibrated but does not beat the random-walk baseline. Post-hoc re-test against a **stronger naive band (σ52)**: NO IMPROVEMENT on any variant (as-is / drift-removed / symmetric width) — everything the model's band knows is a 52-week standard deviation. **TimesFM DISCARDED from the Radar (operator ruling, 2026-08-16).** §3.5 NOT built; the §10 override brief is CANCELLED. Reports: `results/tfm-backtest/2026-08-16/report.md`, `…/2026-08-16-clean/report-*.md`, `…/2026-08-16-splitbasis/report.md`, `…/2026-08-16-sigma52/report.md`; summary in `docs/timesfm-integration-plan.md` §9. The model-free equivalent band is `scripts/sigma52-band.ts --week <ISO-week>` (one-shot, read-only, unwired).
> **Supersedes:** §4 "Fase 1" and §7/§8 of `docs/timesfm-integration-plan.md` (Jarvis, 2026-08-16). Review findings that drove this re-shape are summarised in §1.
> **Freeze posture:** nothing under `src/` changes. All new code lives in `scripts/tfm/` and `/opt/timesfm`; the frozen scanner is *imported*, never edited.

---

## 0. One-paragraph summary

Stand up TimesFM 2.5 (CPU, own venv) as a **sidecar** that can forecast a 4-week P10/P50/P90 for any ticker in `radar.db`. Before it touches anything an operator reads, run a **retrospective calibration backtest** over historical signal-weeks (the DB holds ≈22 years of bars per ticker) against a random-walk baseline. Only if the gate in §5 passes does the weekly sidecar unit get enabled — and even then it writes a standalone `results/tfm_<week>.{json,md}` artefact; Journal wiring is a separate, later, operator-approved change. Fases 2–3 of the plan are out of scope and stay unapproved.

---

## 1. Why this shape (from the 2026-08-16 review)

| Plan as written | Problem | Fase 1 answer |
|---|---|---|
| Edit `ScanResult` in `src/scanner.ts`, add a scheduler step, write forecasts into `radar.db` | All three are frozen (`CLAUDE.md` §Operating Boundary) | New files only; forecasts go to `results/`, never into `radar.db` |
| Gate = "P50 inside 52-week range" + 4 weeks of shadowing | Satisfied by `P50 = last close`; ~120 samples in one market regime have no power | Retro backtest vs random-walk baseline on hundreds of historical signal-weeks (§4–§5) |
| `upsideAsymmetry = (p90−p50)/(p50−p10)` in price space, ">1 = upside" | Equals e^(1.28·σ√h) for any lognormal-like series — always >1, grows with vol, not skew | Computed in log-return space (symmetric ⇒ 1.0); reported, not thresholded |
| Checkpoints `timesfm-2.0-500m` / `1.0-200m`, `freq="W"` | Stale: current lib is PyPI `timesfm` 2.0.2 with the 2.5 model; frequency indicator removed | Pinned versions + current API (§3.1) |
| "Subprocess from the scheduler" | Heavy PyTorch child inside the `williams-radar` cgroup couples an OOM to the radar unit | Own systemd unit with `MemoryMax`, `CPUQuota`, timeout; failure ⇒ no artefact, radar unaffected |

---

## 2. Scope

**In:** runtime install · `forecast.py` · `signal-weeks.ts` (as-of population) · `backtest.py` + report · gate decision · (conditional) weekly sidecar unit + artefact.
**Out:** any edit under `src/`; Journal/Telegram/CSV/`signals.md` changes; ranging filter (Fase 2); escalation logic (Fase 3); BigQuery ML / Vertex (no verified GCP project on this box); dividend-adjusted data; GPU.

New files (all additive):

```
scripts/tfm/fetch-reference.ts     # (added 08-16) Polygon dividends + splits (free-tier reference endpoints, full history)
scripts/tfm/make-splitbasis-db.py  # (added 08-16) backtest COPY of radar.db on Polygon's split-only basis; per-ticker clean_from
scripts/tfm/forecast.py        # TimesFM CLI: tickers or as-of rows → JSON
scripts/tfm/signal-weeks.ts    # historical signal population via frozen scanTicker() (import only)
scripts/tfm/backtest.py        # metrics vs baseline → results/tfm-backtest/<date>/report.md
scripts/tfm/weekly.sh          # (post-gate) Friday sidecar entrypoint
scripts/tfm/systemd/williams-radar-tfm.service   # (post-gate) reference units, installed by hand
scripts/tfm/systemd/williams-radar-tfm.timer
results/tfm-backtest/          # gitignored except report.md
```

---

## 3. Components

### 3.1 Runtime — `/opt/timesfm`

- `uv venv /opt/timesfm --python 3.12` (host has Python 3.12.3, `uv` at `/root/.local/bin/uv`; venv lives OUTSIDE the Node tree).
- CPU-only torch first, then the lib, both pinned:
  ```bash
  /root/.local/bin/uv pip install --python /opt/timesfm/bin/python \
      --index-url https://download.pytorch.org/whl/cpu torch
  /root/.local/bin/uv pip install --python /opt/timesfm/bin/python 'timesfm[torch]==2.0.2'
  ```
  (default PyPI `torch` on Linux is the CUDA build, multi-GB; CPU wheel ≈ 200 MB.)
- Model: `google/timesfm-2.5-200m-pytorch` (≈0.8 GB fp32) into `HF_HOME=/opt/timesfm/hf`; after the warm-up run every invocation sets `HF_HUB_OFFLINE=1` — Friday runs must not depend on huggingface.co.
- API used (from upstream README at time of writing):
  ```python
  model = timesfm.TimesFM_2p5_200M_torch.from_pretrained("google/timesfm-2.5-200m-pytorch")
  model.compile(timesfm.ForecastConfig(max_context=512, max_horizon=8, normalize_inputs=True,
      use_continuous_quantile_head=True, force_flip_invariance=True, infer_is_positive=True,
      fix_quantile_crossing=True))
  point, quant = model.forecast(horizon=4, inputs=[closes_1, closes_2, ...])
  # quant.shape == (n, 4, 10): [mean, q10, q20, ..., q90]  → P10=idx 1, P50=idx 5, P90=idx 9
  ```
- Threads: `torch.set_num_threads(TFM_THREADS or 2)` + `OMP_NUM_THREADS=2` from the caller (4-core box shared with mission-control/agentic-crm; observed ~197% CPU, RSS ≈1.4 GB).
- Typecheck for the TS script is manual (`tsconfig.json` includes `src/**` only): `npx tsc --noEmit --module nodenext --moduleResolution nodenext --target es2022 --strict --skipLibCheck scripts/tfm/signal-weeks.ts scripts/tfm/signal-weeks.test.ts`.
- Disk budget ≈ 1.5 GB (86 GB free). RAM peak expected 1.5–2.5 GB (12.8 GB available at time of writing).

### 3.2 `scripts/tfm/forecast.py`

CLI, no state, reads `data/radar.db` **read-only** (`?mode=ro`).

```
forecast.py --db data/radar.db --out FILE.json --horizon 4 --context 512 \
            (--tickers BSX,AAPL,NVDA [--as-of YYYY-MM-DD] | --rows ROWS.json)
```

- `--tickers`: forecast each ticker from its last bar (or from the last bar ≤ `--as-of`).
- `--rows`: batch mode for the backtest — each row `{ticker, as_of}`; the series is truncated at `date <= as_of` (no lookahead), last `--context` bars, skip if < 64 bars.
- Input series = `weekly_bars.close` ascending (split-adjusted per Polygon `adjusted=true`; NOT dividend-adjusted — noted in §8).
- Batches of 32 series per `model.forecast` call.
- Output per row (all prices in level space, returns in log space):
  ```json
  {"ticker":"BSX","as_of":"2026-08-14","bars_used":512,"last_close":44.78,"horizon":4,
   "p10":41.20,"p50":45.31,"p90":49.65,
   "r10":-0.0833,"r50":0.0118,"r90":0.1033,
   "asym_log":0.997,                       # (r90-r50)/(r50-r10)  — symmetric ⇒ 1.0
   "baseline":{"sigma_w":0.0331,"r10":-0.0849,"r50":0.0,"r90":0.0849},
   "model":"google/timesfm-2.5-200m-pytorch","lib":"timesfm==2.0.2"}
  ```
  Per-row failures are recorded as `{"ticker":..,"as_of":..,"error":"<reason>"}` and never abort the batch. Exit 0 if ≥1 row succeeded, 2 if none, 1 on setup errors (model load, DB open).
- Baseline (computed here so both artefacts carry it): `sigma_w` = std of the last 26 weekly log returns (min 12, else skip row); `r10/r90 = ∓1.2816·sigma_w·√h`; `r50 = 0`.

### 3.3 `scripts/tfm/signal-weeks.ts` — as-of signal population

Imports the frozen scanner **read-only**: `import { scanTicker } from "../../src/scanner.js"` (+ the `WeeklyBar` type). It does NOT use `src/db.js` `loadBars()` — `getDb()` opens read-write and runs `applySchema()` DDL — it opens its own `better-sqlite3` handle with `{ readonly: true }`. It edits nothing. Population = registry `status != 'discarded'` minus `SPY` (mirrors `getActiveTickers()` + the `runScan()` skip), so the backtest scores exactly what the live radar could emit.

- For every active ticker: bars ascending; for each index `i` with `i+1 ≥ 104` (priceContext window) and `bars[i+4]` present and `bars[i].date ≥ 2019-01-01`:
  `r = scanTicker(ticker, bars.slice(0, i+1))`; keep if `r.signalLevel !== "none"`.
- Row: `{ticker, as_of: bars[i].date, level, quality, close: bars[i].close, close_h4: bars[i+4].close, ranging, nearLows}`.
- **Print the population first** (per gate-scored-an-impossible-population): rows per year × level, and the post-2025-01-01 count. If the post-2025 subset < 150 rows — before OR after the cap — → STOP (exit 3) and report; do not run the backtest blind.
- Cap: if > 3,000 rows, stratified random sample by year (seed 42) — CPU budget, not statistics.
- Flags accept `--k v` and `--k=v`; numeric flags are validated (a typo cannot silently produce an empty population).
- Output `results/tfm-backtest/<date>/signal-weeks.json`. Runtime: seconds (pure TS over ~150k bars).

### 3.4 `scripts/tfm/backtest.py`

`backtest.py --rows signal-weeks.json --forecasts forecasts.json --out report.md`
(`forecasts.json` = `forecast.py --rows signal-weeks.json`.)

Per row: realised `y = ln(close_h4 / close)`. Metrics for TimesFM and baseline (definitions in §4), overall + by level (S1/S2D/S2) + by period (pre/post 2025-01-01); segments with n < 30 are flagged `*` (descriptive only). Writes `report.md` (tables + gate verdict) and `rows.csv` (one line per row, for later slicing). Bootstrap resamples **by as-of week**, not by row — same-week returns are correlated through the market. Join guards: refuses a horizon mismatch between the two artefacts; drops (and counts) rows where the forecast's `last_close` ≠ the population's `close` (a per-row no-lookahead invariant); drops rows whose realised-return or σ window spans the **radar.db adjustment seam** at 2024-07-19 (bars before it are Alpha Vantage dividend-adjusted, after it Polygon split-adjusted — 166/387 tickers jump >5% in that week; found by qa-audit, report-only for the frozen fetcher). Verdict `INSUFFICIENT` (not FAIL) when nothing was scored.

### 3.5 weekly sidecar — **NOT BUILT** (override of 2026-08-16 rescinded the same day after the σ52 re-test; TimesFM discarded — see §10)

Design record only — kept so the shape is not re-derived if a *different* forecaster ever passes §5.

- `scripts/tfm/weekly.sh <ISO-week>`: resolves `results/radar_<week>.csv` → tickers with `signalLevel ∈ {S1,S2D,S2}` → `forecast.py --tickers … --out results/tfm_<week>.json` → renders `results/tfm_<week>.md` (one line per ticker, §6 format) → exit 0. Idempotent: exits 0 without work if `tfm_<week>.md` exists; exits 3 with a log line if the CSV is not there yet (radar still running).
- `williams-radar-tfm.service` (oneshot): `WorkingDirectory=/root/claude/williams-entry-radar`, `ExecStart=/root/claude/williams-entry-radar/scripts/tfm/weekly.sh`, `Environment=HF_HOME=/opt/timesfm/hf HF_HUB_OFFLINE=1 OMP_NUM_THREADS=2 TZ=America/Mexico_City`, `MemoryMax=3G`, `CPUQuota=200%`, `Nice=10`, `TimeoutStartSec=20min`. **Not** `PartOf`/`After` the radar unit — the radar's cron lives inside its node process; there is no completion signal to hook.
- `williams-radar-tfm.timer`: `OnCalendar=Fri 20:00 America/Mexico_City` and `Fri 21:30 America/Mexico_City` (radar typically finishes ≈19:25; the second fire covers a slow Polygon night; idempotency makes it harmless).
- Failure mode by design: any error ⇒ no artefact + journal line; the radar's own cascade is untouched. Nothing is committed to git by the sidecar in Fase 1.

---

## 4. Metric definitions (h = 4 weeks, log-return space)

For row *i*: `y_i = ln(close_h4/close)`, model quantiles `q10,q50,q90` as log returns relative to `close` (TimesFM: `ln(pXX/last_close)`; baseline as §3.2).

- **Pinball loss** at level τ: `ρ_τ(y,q) = τ·(y−q)` if `y ≥ q` else `(τ−1)·(y−q)`. Report `PB = mean over rows of mean over τ∈{.1,.5,.9}`. Lower is better. Also `ΔPB = PB_tfm − PB_base` per row → mean + 95% CI by week-clustered bootstrap (1,000 resamples).
- **Coverage80**: `mean(1[q10 ≤ y ≤ q90])`; target 0.80. Also the two tails separately: `P(y < q10)` and `P(y > q90)`, each ≈ 0.10 — shows *which* side is mis-calibrated.
- **Interval width**: `median(q90 − q10)` for both — sanity that TimesFM is not just wider/narrower.
- **Directional hit-rate** (TimesFM only, report-only, NOT a gate): `mean(sign(q50) == sign(y))` over rows with `|q50| > 0.002`, with a Wilson 95% CI. The baseline has no direction.
- **asym_log** distribution (median, IQR) — informational.

---

## 5. Gate (decides whether §3.5 gets built at all)

All three must hold, on the **full** population *and* on the **post-2025-01-01** subset (n ≥ 150):

- **G1 — beats baseline:** `mean(ΔPB) < 0` and the 95% week-clustered bootstrap CI excludes 0.
- **G2 — calibrated:** `Coverage80 ∈ [0.70, 0.90]`.
- **G3 — no tail collapse:** each tail `P(y<q10)`, `P(y>q90)` ∈ [0.04, 0.18].

Verdict written into `report.md` and copied into `docs/timesfm-integration-plan.md` under a new "Fase 1 result" heading (numbers, date, lib/model versions). **FAIL ⇒ stop**: no unit, no wiring; the plan is marked "not adopted — see report". PASS ⇒ operator may enable §3.5; Journal wiring remains a *separate* approval.

The post-2025 split exists because TimesFM's pretraining corpus/cutoff is not published in enough detail to rule out having seen public equity series before 2025 — pre-2025 windows may be optimistic.

---

## 6. Weekly artefact format

`results/tfm_<week>.md` — one line per signal ticker, in the plan's Journal voice, annotation-only:

```
BSX — S2D · TFM h4: P50 +1.2% · 80% band [−8.3%, +10.3%] (RW band ±8.5%) · asym 1.00 · [TimesFM 2.5 · shadow]
```

Rules: log-return percentages relative to `last_close`; always show the random-walk band next to the model band so the reader can see whether the model is saying anything; never a directional word ("bullish", "confirmed"); the trailing tag makes provenance explicit. `tfm_<week>.json` is the machine copy (§3.2 schema, one object per ticker).

---

## 7. Runbook (operator; all paths absolute)

```bash
# 1. runtime (≈5–10 min, one-time)
/root/.local/bin/uv venv /opt/timesfm --python 3.12
/root/.local/bin/uv pip install --python /opt/timesfm/bin/python --index-url https://download.pytorch.org/whl/cpu torch
/root/.local/bin/uv pip install --python /opt/timesfm/bin/python 'timesfm[torch]==2.0.2'
mkdir -p /opt/timesfm/hf

# 2. warm-up + smoke (downloads the model once; expect 3 rows, p10<p50<p90, <90 s after download)
cd /root/claude/williams-entry-radar
HF_HOME=/opt/timesfm/hf OMP_NUM_THREADS=2 /opt/timesfm/bin/python scripts/tfm/forecast.py \
  --db data/radar.db --tickers BSX,AAPL,NVDA --out /tmp/tfm-smoke.json && cat /tmp/tfm-smoke.json

# 3. population (prints counts per year × level FIRST; stop if post-2025 < 150)
mkdir -p results/tfm-backtest/2026-08-16
npx tsx scripts/tfm/signal-weeks.ts --since 2019-01-01 --cap 3000 \
  --out results/tfm-backtest/2026-08-16/signal-weeks.json

# 4. forecasts as-of (expect 10–30 min on 2 threads for ≤3,000 rows; measure with --limit 64 first)
HF_HOME=/opt/timesfm/hf HF_HUB_OFFLINE=1 OMP_NUM_THREADS=2 /opt/timesfm/bin/python scripts/tfm/forecast.py \
  --db data/radar.db --rows results/tfm-backtest/2026-08-16/signal-weeks.json \
  --out results/tfm-backtest/2026-08-16/forecasts.json

# 5. gate
/opt/timesfm/bin/python scripts/tfm/backtest.py \
  --rows results/tfm-backtest/2026-08-16/signal-weeks.json \
  --forecasts results/tfm-backtest/2026-08-16/forecasts.json \
  --out results/tfm-backtest/2026-08-16/report.md && sed -n 1,60p results/tfm-backtest/2026-08-16/report.md
```

Steps 6+ (§3.5): void — TimesFM discarded 2026-08-16. The equivalent per-signal band without a model: `npx tsx scripts/sigma52-band.ts --week 2026-W33` (prints markdown; read-only; nothing wired).

Re-test against a stronger naive band (post-hoc, same scored rows): `/opt/timesfm/bin/python scripts/tfm/retest-sigma52.py --rows results/tfm-backtest/2026-08-16-splitbasis/rows.csv --db results/tfm-backtest/radar-splitbasis.db --out results/tfm-backtest/2026-08-16-sigma52/report.md [--sigma-weeks 52]`.

Effort estimate: forecast.py ≈ 120 LOC · signal-weeks.ts ≈ 80 LOC · backtest.py ≈ 150 LOC · weekly.sh + units ≈ 60 LOC. One session including the backtest run.

---

## 8. Risks & caveats

| Risk | Handling |
|---|---|
| Pretraining leakage inflates retro metrics | Post-2025 subset is part of the gate (§5) |
| Survivorship: today's universe was picked partly on backtested hit-rate | Second-order for *calibration* (we test whether bands cover realised returns); noted in report header |
| radar.db adjustment seam 2024-07-19 (AV dividend-adjusted → Polygon split-only; +5–15% one-week jumps on dividend payers) | Rows whose y or σ window spans it are dropped and counted; the 512-bar context still contains it for post-2025 rows (a level shift the model sees as history). Live scanner: the 104-week window moved past the seam in July 2026 — no current impact; the frozen fetcher is report-only |
| CPU time / RAM on a shared 4-core box | 2 threads, batches of 32, own unit with `MemoryMax=3G` `CPUQuota=200%` `Nice=10`; radar cgroup untouched |
| huggingface.co unreachable on a Friday | `HF_HUB_OFFLINE=1` after warm-up; model cached at `/opt/timesfm/hf` |
| Radar finishes late (Polygon slow) | Second timer fire 21:30; sidecar exits 3 without the CSV, idempotent on rerun |
| Reader over-trusts the line | RW band shown next to model band; no directional wording; `[shadow]` tag |
| Lib bump changes API/quantile layout | Versions pinned; `forecast.py` asserts `quant.shape[-1] == 10` and `p10<p50<p90` per row |
| Freeze drift ("while I'm here…") | Every file is new; PR diff must show zero lines changed under `src/` |

---

## 9. Definition of done (Fase 1)

- [ ] `/opt/timesfm` runtime installed, smoke JSON for BSX/AAPL/NVDA sane (`p10<p50<p90`, bands within ±30% at h=4).
- [ ] Population printed and ≥150 post-2025 rows (or an explicit STOP report).
- [ ] `results/tfm-backtest/<date>/report.md` with G1–G3 verdicts on full + post-2025 populations.
- [ ] Verdict + numbers recorded in `docs/timesfm-integration-plan.md` ("Fase 1 result").
- [ ] `git diff --stat` shows no changes under `src/`.
- [ ] Only on PASS: timer enabled, one manual run produced `results/tfm_<week>.md`, radar unit untouched (`systemctl status williams-radar` unchanged).

---

## 10. CLOSED — override rescinded, TimesFM discarded from the Radar (2026-08-16)

**Sequence.** After the third FAIL the operator first ruled to build §3.5 anyway as a pure annotation (brief lived here). Before building, a diagnostic pass on the 2,851 scored rows showed: (a) the model's P50 does move (sd ≈ 3%/4w) but is uncorrelated with what happens (corr +0.05; direction hit 52% vs 56% for "always up"); (b) its band **width** beats the σ26 baseline once the drift is removed *and the band symmetrised* (symmetric-width variant: ΔPB −0.00039 [−0.00074, −0.00008] on the full population only; drift removal alone −0.00027 [−0.00064, +0.00003], not significant — `results/tfm-backtest/2026-08-16-sigma52/report-sigma26.md`) — the "something odd"; (c) a **52-week σ** does the same (σ52 vs σ26: −0.00037 [−0.00063, −0.00013], the mirror of the σ26 row in `report.md`) and TimesFM vs EWMA(0.97) is a tie (inline diagnostic, not a tracked artefact). Operator: "give me the σ52 band instead; if TimesFM shows no improvement over it, discard it altogether."

**Re-test vs σ52** (`scripts/tfm/retest-sigma52.py --clean-from …`, report `results/tfm-backtest/2026-08-16-sigma52/report.md`; same scored rows as §5 minus 30 whose 52-week σ window reaches before the ticker's single-basis tail; ΔPB = variant − σ52 band, week-clustered bootstrap):

| variant | all (n=2,821) | post-2025 (n=652) |
|---|---|---|
| TimesFM as-is | +0.00035 [−0.00015, +0.00090] | +0.00037 [−0.00037, +0.00114] |
| TimesFM drift removed | +0.00009 [−0.00026, +0.00042] | +0.00024 [−0.00020, +0.00069] |
| TimesFM symmetric width | −0.00002 [−0.00033, +0.00027] | +0.00014 [−0.00033, +0.00059] |
| σ26 (spec §5 baseline) | +0.00037 [+0.00013, +0.00063] | +0.00023 [−0.00009, +0.00054] |

No variant improves on σ52 on either population → **NO IMPROVEMENT → TimesFM discarded from the Radar.** Coverage of the σ52 band itself: 81.0% (all) / 79.4% (post-2025). Annotation-value check (outcome by σ52 quintile, report-only): P(r>0) 59.6% / 59.4% in the two low-vol quintiles vs 52.0–55.2% in Q3–Q5, but Q1 − Q5 = +4.4 pp with a week-clustered 95% CI of [−3.0, +11.4] pp — **not distinguishable from noise**, and not a filter under the frozen logic either way.

**What remains.**
- `scripts/sigma52-band.ts --week <ISO-week>` — the model-free band on the week's signals (S2 → S2D → S1), read-only, prints markdown, nothing wired. Whether it becomes a weekly artefact is a separate operator call.
- `scripts/tfm/` stays in the repo as the archived, tested backtest harness (signal-weeks → forecast → gate) so any future forecaster meets the same §5 gate; `/opt/timesfm` (~1.7 GB) is now unused by the Radar — `rm -rf /opt/timesfm` removes it without side effects (keep it if TimesFM is pointed at business series elsewhere).
- Nothing was ever wired: no unit, no timer, no Journal/Telegram change, `src/` untouched, `data/radar.db` read-only throughout.

**If TimesFM is ever re-opened for the Radar**, only two routes are worth a session, both gated by §5 with σ52 (not σ26) as the baseline: fine-tune on the Radar's signal-weeks with a strict time split (train ≤ 2023 / test 2024+), or a different target with real temporal structure (volatility itself vs HAR/EWMA, or non-price series). Zero-shot price re-tests (other horizons/frequencies/covariates) are closed by the 3-strike rule.
