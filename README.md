# Williams Entry Radar

Early-detection radar based on Bill Williams' AO + AC oscillators applied to **weekly timeframe**. Scans entire sectors to surface entry candidates *before* price confirms the move.

## The Signal (Fede's Hypothesis)

When **both AO and AC are negative** and AC flips from **red → green after reaching its cycle bottom**, the system signals early momentum exhaustion. Not a buy signal — a signal to *start watching*.

```
ALERT CONDITION:
  AO  < 0  (negative, bearish territory)
  AC  < 0  (negative, bearish territory)
  AC[prev] < AC[curr]  (AC hit bottom and is turning)
  AC color: red → green  (first green after red series)

INTERPRETATION:
  The acceleration of negative momentum is stalling.
  Market is still bearish but something is changing in the deep layers.
  Action: observe, not enter yet.
```

**Hierarchy:** AC → AO → Price. AC signals first. AO confirms weeks later. Price follows.

## Methodology

- **Timeframe**: Weekly exclusively
- **Data**: Alpha Vantage API (weekly close, H/L for midpoint)
- **AO**: SMA(5) of midpoint − SMA(34) of midpoint
- **AC**: AO − SMA(5) of AO
- **AC Color**: green if AC[t] > AC[t-1], red if AC[t] < AC[t-1]

---

## Phase 1 Results — ETF Backtesting (2026-04-24)

**338 signals** across 8 sector ETFs, 2001–2026 weekly data.

| Group | Tickers | Hit Rate 8W | Avg Ret 8W | Max DD |
|-------|---------|-------------|------------|--------|
| Defensive | XLU, XLP | **70.0%** | +2.44% | -5.78% |
| Cyclical | XLE, XLI | 66.3% | +2.76% | -9.61% |
| Growth/Tech | XLK, XLY | 62.2% | +2.42% | -10.01% |
| High-Vol | XBI, ARKG | 56.3% | +2.40% | -13.35% |
| **OVERALL** | — | **64.5%** | — | — |

**Key finding:** Hypothesis validated. 64.5% hit rate vs ~50% random. Defensives most reliable; High-Vol too noisy. Average AO lag: 6-7 weeks at ETF level.

---

## Phase 2 Results — Individual Tickers (2026-04-24)

**3,774 signals** across 79 individual tickers (XLU, XLP, XLE, XLI), 2001–2026 data.

| Sector | Tickers | Avg HR 8W | Avg Ret 8W | Avg Max DD |
|--------|---------|-----------|------------|------------|
| XLU (Utilities) | 20 | **72.7%** | +5.07% | -4.9% |
| XLI (Industrials) | 20 | 65.0% | +4.38% | -6.3% |
| XLE (Energy) | 20 | 63.9% | **+5.11%** | -8.8% |
| XLP (Consumer Staples) | 19 | 63.1% | +2.50% | -5.1% |

### Top Outliers (≥20 signals, HR ≥ 73%, Max DD < 5%)

| Ticker | Sector | Signals | HR 8W | Ret 8W | Max DD | AO Lag |
|--------|--------|---------|-------|--------|--------|--------|
| **SO** | XLU | 40 | **85.0%** | +6.60% | -1.7% | 11.8W |
| **WEC** | XLU | 51 | 80.4% | +4.13% | -3.0% | 12.4W |
| **DUK** | XLU | 48 | 79.2% | +3.42% | -4.9% | 18.4W |
| **SRE** | XLU | 39 | 79.5% | +4.89% | -3.0% | 15.6W |
| **AEE** | XLU | 50 | 78.0% | +4.12% | -3.1% | 14.7W |
| **NEE** | XLU | 48 | 77.1% | +3.82% | -4.2% | 14.6W |
| **ED** | XLU | 55 | 76.4% | +4.00% | -2.4% | 10.8W |
| **DE** | XLI | 51 | 74.5% | +6.09% | -4.3% | 11.7W |
| **COST** | XLP | 43 | 74.4% | +4.39% | -4.2% | 11.6W |

### Qualitative Profile of Best Outliers

| Characteristic | Presence in Top 15 | Implication |
|----------------|--------------------|-----------  |
| Beta < 0.70 | 9/15 (60%) | Defensive stocks dominate |
| Dividend ≥ 2.5% | 10/15 (67%) | Yield creates systematic "natural floor" |
| Max DD < 4% | 7/15 (47%) | Best outliers have cushion control |
| AO Lag 10-15W | 13/15 (87%) | Operational sweet spot |
| XLU Utilities | 7/15 (47%) | Regulated businesses = cleaner signals |

**Why utilities dominate:** Regulated cash flows, dividend yield creates structural buyer support at price lows. AC is detecting the yield-driven floor, not just a technical bounce.

**Why some fail:** KHC (44.8%), FANG (46.7%) — structural fundamental deterioration. The signal cannot distinguish cyclical correction from permanent impairment. Businesses with broken fundamentals are false positives.

**Macro filter finding:** Signal works equally in bull and bear markets (64.8% vs 67.4%). No macro filter needed.

**AO lag in individual tickers:** 10-18W (vs 6-7W in ETFs). Plan entries accordingly.

Full qualitative analysis: [results/phase2_qualitative_analysis.md](results/phase2_qualitative_analysis.md)

---

## Ideal Ticker Profile for the Radar

1. **Regulated or predictable backlog business** (utility, defense, infrastructure, staples)
2. **Dividend ≥ 2.5%** — creates the natural floor the signal detects
3. **Beta < 0.85** preferred — reduces external noise
4. **No fundamental impairment** — the core business must be healthy
5. **Historical AO lag 10-15W** — enables planned confirmation entry

---

## Phase 3 — Live Radar (Planned)

- Weekly scan (Thursday/Friday close) of the 79-ticker universe
- Alpha Vantage Premium: 75 req/min → full scan in < 2 minutes
- **Level 1 Alert (Observation)**: AC red→green with both negative
- **Level 2 Alert (Entry Candidate)**: AO also turning up + 2 consecutive green AC weeks
- **Future Xpoz integration**: on Level 1 alert, scan Reddit for emerging narrative on the ticker

---

## Repository Structure

```
src/
  data.ts              # Alpha Vantage fetch + cache
  indicators.ts        # AO, AC calculation
  signals.ts           # Signal detection
  backtest-local.ts    # Phase 1 backtest engine
  fetch-phase2.ts      # Phase 2 batch fetcher (sequential, 1s delay)
  get-components.ts    # Sector component lists
  backtest-phase2.ts   # Phase 2 engine with macro filter + composite score
  report-phase2.ts     # Scorecard generator
  scan.ts              # Live scanner

results/
  backtest_2019-2026.csv         # Phase 1: 338 signals, 8 ETFs
  phase2_outcomes.csv            # Phase 2: 3,774 signals, 79 tickers
  phase2_scorecard.csv           # Phase 2: ranked by composite score
  phase2_qualitative_analysis.md # Qualitative analysis of top outliers
```

## Status

| Phase | Status | Signals | Key Metric |
|-------|--------|---------|------------|
| Phase 1 — ETF Backtest | ✅ Complete | 338 | 64.5% HR overall |
| Phase 2 — Individual Tickers | ✅ Complete | 3,774 | SO: 85% HR, -1.7% DD |
| Phase 2 — Qualitative Analysis | ✅ Complete | 15 outliers profiled | Dividend + regulation = clean signal |
| Phase 3 — Live Radar | 🔜 Planned | — | Weekly scan, two-level alerts |

**API:** Alpha Vantage Premium (`REDACTED_AV_KEY_ROTATED_2026_04_24`) — 75 req/min confirmed  
**Stack:** TypeScript, SQLite cache, sequential fetch (1s delay), GitHub API push
