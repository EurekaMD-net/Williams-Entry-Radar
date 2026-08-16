# CLAUDE.md

## Operating Boundary

**This repo's signal logic is FROZEN.** The S2/S2D/S1 scanner, ranging filter, AO threshold, CSV signalQuality output, scheduler delivery cascade, and Pin Scanner rules were validated and pinned in commits `8d3ebd5`..`2edce1b` (anchor tag: `pre-jarvis-universe-2026-04-25`). The radar works. Do not improve, refactor, "clean up", or reorganize any of this. Any signal-logic regression — even one that "looks like a fix" — costs us live trading signal.

## Authorized tooling

To populate weekly OHLC bars for the universe (e.g. after a universe-expansion PR merges, before the next scheduled scan), invoke the operator-sanctioned wrapper:

```
./scripts/fetch.sh
```

**Always use `./scripts/fetch.sh`. Never call `npx tsx src/fetch-tickers.ts` directly.** The wrapper is not optional — it sources `/etc/williams-radar.env` to set `POLYGON_API_KEY` + `AV_API_KEY` (mode 600). The mc systemd environment exposes these secrets under different wiring, so `npx tsx src/fetch-tickers.ts` invoked from inside Jarvis will throw `POLYGON_API_KEY environment variable is required`. Symptom is a silent zero-bars result that does not surface until a scan runs against an empty cache. Since 2026-07-14 (AV key downgraded to free tier: 25 req/day) **Polygon is the primary weekly source** (13s inter-call throttle, free 5 req/min; full-universe fetch ≈ 85 min) with AV as scarce fallback; the wrapper exits non-zero on any ticker error.

`./scripts/backfill-polygon.ts` (2026-08-16, operator-sanctioned) replaces the Alpha-Vantage-era bars (< 2024-07-19, dividend-adjusted closes) with Polygon split-adjusted bars so the history shares one basis. Dry-run by default; `--apply` backs radar.db up first and verifies live-era rows are byte-unchanged and per-ticker `MAX(fetched_at)` unmoved (backfilled rows keep their original `fetched_at`, so `isCacheValid()` still triggers Friday's fetch); it exits 4 without writing when the key's plan cannot serve history before the seam (free tier = 2 y — the case as of 2026-08-16); it refuses `--apply` Fridays 15:00–20:00 MX (scan window) and refuses to overwrite an existing backup. Only bars inside `--lookback-years` (≤ 9, the frozen fetcher's 500-bar cap) are converted — older AV-basis bars remain and the basis boundary moves to ~lookback start (the run prints how many tickers still jump >5% there). Run it under the env file exactly like the probe in its header (`systemd-run -p EnvironmentFile=/etc/williams-radar.env … npx tsx scripts/backfill-polygon.ts [--apply]`), never with the key pasted.

`scripts/tfm/fetch-reference.ts` + `scripts/tfm/make-splitbasis-db.py` (2026-08-16) build a **backtest copy** of radar.db on Polygon's split-only basis using the free-tier reference endpoints (dividends/splits, full history) — production radar.db is only ever opened read-only by them. Known data facts they encode: AV-era rows carry an adjusted close but RAW open/high/low; the AV↔Polygon basis seam is 2024-07-19; spin-off distributions are not in the dividend feed, so ~15% of AV rows (35 tickers inside 2017+) stay unreconcilable and are excluded via `clean_from`.

**TimesFM was DISCARDED from the Radar on 2026-08-16** (gate FAIL ×3 + no improvement over a σ52 band; `docs/timesfm-fase1-spec.md` §10). `scripts/tfm/` remains only as the archived backtest harness (`signal-weeks.ts` → `forecast.py` → `backtest.py`, plus `retest-sigma52.py` for the stronger-baseline re-test) — every script opens radar.db read-only; nothing is wired, no unit or timer exists. `scripts/sigma52-band.ts --week <ISO-week>` is a model-free one-shot that prints the 4-week 80% price band (52-week σ random walk) for the week's S1/S2D/S2 signals — read-only, stdout only, annotation not signal. `/opt/timesfm` (~1.7 GB) is unused by this repo.

You should not need to edit `fetcher.ts`, `cache.ts`, `db.ts`, `scheduler.ts`, or any other signal-pipeline file to make this work. If `fetch.sh` fails, **stop and report** — do not "fix" by editing pipeline code, and do not "work around it" by invoking the underlying TS entry point directly.

## Scope of authorized changes

When working in this repo, only modify the **ticker universe**:

- ✅ `src/universe.ts` — add new tickers to `TIER2`, expand sector coverage, update `hrHistorical`/`avgRetHistorical`/`maxDdHistorical`/`aoLagHistorical` from new backtest runs.
- ✅ Test fixtures and seed-data files **only** if they reference the universe directly.
- ✅ Documentation files (`README.md`, `signals.md`) — only when documenting an actual universe change you are making in the same PR.

Everything else is **off limits** without explicit operator approval per change:

- ❌ `src/scanner.ts`, `src/signals/*`, `src/ranging.ts`, `src/ao.ts`, any signal calculation
- ❌ `src/scheduler.ts`, delivery cascade code
- ❌ `src/fetch-tickers.ts`, `scripts/fetch.sh` — operator-sanctioned tooling, not autonomous-edit territory
- ❌ `src/fetcher.ts`, `src/cache.ts`, `src/db.ts` — data plumbing under signal frozen freeze
- ❌ Database schema, migrations, OHLC table structure
- ❌ Backtest harness, evaluation pipeline
- ❌ Pin Scanner rules
- ❌ "Drive-by" refactors of files you happened to read while working on tickers

If you find a bug in non-universe code, **stop and report it**. Do not fix it in the same PR. Open an issue or message the operator. Bundling a "fix" with a ticker addition makes the change unreviewable and risks a silent regression in validated logic.

## PR shape

- One PR per ticker batch.
- Title: `feat(universe): <what was added>` — never `refactor` or `fix` for ticker work.
- Body: list new tickers, their source/justification (backtest rank, sector coverage gap, etc.), and confirmation that no other files changed.
- Diff should be confined to `src/universe.ts` + universe-related fixtures + universe-related doc lines. If the diff touches anything else, the PR is wrong shape — split it.
- Branch off the latest `origin/main` (or stack on top of an open universe-expansion PR if one is in flight).

## Recovery anchor

Tag `pre-jarvis-universe-2026-04-25` on commit `2edce1b` is the last validated state before universe expansion began. If anything ever drifts in the signal logic, `git reset --hard pre-jarvis-universe-2026-04-25` recovers it.

## Why this is locked down

This is an autonomous build by Jarvis under operator supervision. The signal logic was hard-won across multiple sessions of audit, regression hunting, and live validation. Universe expansion is a contained, low-risk, additive change. Anything else needs a deliberate decision from the operator.
