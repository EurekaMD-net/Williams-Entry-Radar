# CLAUDE.md

## Operating Boundary

**This repo's signal logic is FROZEN.** The S2/S2D/S1 scanner, ranging filter, AO threshold, CSV signalQuality output, scheduler delivery cascade, and Pin Scanner rules were validated and pinned in commits `8d3ebd5`..`2edce1b` (anchor tag: `pre-jarvis-universe-2026-04-25`). The radar works. Do not improve, refactor, "clean up", or reorganize any of this. Any signal-logic regression — even one that "looks like a fix" — costs us live trading signal.

## Authorized tooling

To populate weekly OHLC bars for the universe (e.g. after a universe-expansion PR merges, before the next scheduled scan), invoke the operator-sanctioned wrapper:

```
./scripts/fetch.sh
```

**Always use `./scripts/fetch.sh`. Never call `npx tsx src/fetch-tickers.ts` directly.** The wrapper is not optional — it sources `/etc/williams-radar.env` to set `AV_API_KEY` (mode 600). The mc systemd environment exposes the same secret under a different name (`ALPHAVANTAGE_API_KEY`), so `npx tsx src/fetch-tickers.ts` invoked from inside Jarvis will throw `AV_API_KEY environment variable is required`. Symptom is a silent zero-bars result that does not surface until a scan runs against an empty cache. The wrapper also pins the 1.1s inter-call throttle (Premium 75 req/min ceiling, ~28% headroom) and exits non-zero on any ticker error.

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
