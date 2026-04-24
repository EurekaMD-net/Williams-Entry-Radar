# Williams Entry Radar

Early-detection radar based on Bill Williams' AO + AC oscillators applied to the **weekly timeframe**. Scans entire sectors to surface entry candidates *before* price confirms the move.

## The Signal (Fede's Hypothesis)

When **both AO and AC are negative** and AC flips from **red → green after reaching its cycle bottom**, the system signals early momentum exhaustion. Not a buy signal — a signal to *start watching*.

```
ALERT CONDITION (S1 — Observation):
  AO  < 0  (negative, bearish territory)
  AC  < 0  (negative, bearish territory)
  AC[prev] < AC[curr]  (AC hit bottom and is turning)
  AC color: red → green  (first green after red series)

CONFIRMATION (S2 — Attention):
  AC crosses zero (from negative to positive)
  AO < 0 but recovering from its cycle bottom
  AO[t] > AO[t-N] for N in 2..5 weeks
  AO touched its bottom within the last 16 weeks

HIERARCHY:
  AC signals first → AO confirms weeks later → Price follows.
  S1 = start watching. S2 = consider acting.
```

**Key insight from backtesting:** In individual tickers, AO lag averages 10-18 weeks after S1. You have 2-4 months of observation before AO confirms. Patience is part of the system.

## Methodology

- **Timeframe**: Weekly exclusively
- **Data**: Alpha Vantage API (weekly OHLC, adjusted close)
- **AO**: SMA(5) of midpoint − SMA(34) of midpoint, where midpoint = (high + low) / 2
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
| **SRE** | XLU | 39 | 79.5% | +4.89% | -3.0% | 15.6W |
| **DUK** | XLU | 48 | 79.2% | +3.42% | -4.9% | 18.4W |
| **AEE** | XLU | 50 | 78.0% | +4.12% | -3.1% | 14.7W |
| **NEE** | XLU | 48 | 77.1% | +3.82% | -4.2% | 14.6W |
| **ED** | XLU | 55 | 76.4% | +4.00% | -2.4% | 10.8W |
| **DE** | XLI | 51 | 74.5% | +6.09% | -4.3% | 11.7W |
| **COST** | XLP | 43 | 74.4% | +4.39% | -4.2% | 11.6W |

### Why Utilities Dominate

Regulated cash flows + dividend yield (≥2.5%) create a structural buyer floor at price lows. AC detects the yield-driven stabilization — not a random technical bounce. Institutional income buyers (pensions, funds) rebalance systematically when yield becomes attractive vs. bonds, creating predictable demand at the lows.

### Signal Limitations

- **Does not distinguish correction from deterioration.** KHC (44.8% HR), FANG (46.7%) — broken businesses generate false positives. A minimum fundamental filter is required.
- **Macro filter adds no edge.** Signal works in bull and bear markets (64.8% vs 67.4%). No SPY filter needed.
- **Multiple S1 signals during a prolonged downtrend are noise.** The valuable signal is the one that exits the cycle bottom — S2 helps identify it.

Full qualitative analysis: [results/phase2_qualitative_analysis.md](results/phase2_qualitative_analysis.md)

---

## Phase 2B — S2 Signal Validation (2026-04-24)

**491 S2 signals** (−87% vs S1's 3,774) across the same 79-ticker universe.

| Metric | S1 | S2 | Delta |
|--------|----|----|-------|
| Total signals | 3,774 | 491 | −87% |
| Avg Hit Rate 8W | 65.8% | 60.7% | −5.1pp |
| Avg Max DD | −6.2% | **−4.9%** | +1.3pp ▲ |
| AO Lag | 17W | **11.7W** | −5.3W ▲ |

**Key insight:** S2 does not improve average hit rate — it *concentrates quality*. In predictable businesses, S2 is extraordinary (PG: 100% HR, −0.09% DD; LMT: 100% HR; HON: 100% HR). In commodity-driven energy, S2 generates late false positives where AC crosses zero then retreats. The rule: use S2 selectively on Tier 1 tickers only.

---

## Ideal Ticker Profile for the Radar

1. **Regulated or predictable backlog business** (utility, defense, infrastructure, staples)
2. **Dividend ≥ 2.5%** — creates the natural floor the signal detects
3. **Beta < 0.85** preferred — reduces external noise
4. **No fundamental impairment** — the core business must be healthy
5. **Historical AO lag 10-15W** — enables planned confirmation entry

---

## Phase 3 — Live Weekly Radar (2026-04-24)

**Status: Operational** — first run completed on 2026-W17.

### Architecture

```
UNIVERSE (2 tiers):
  Tier 1 — 15 outliers (SO, WEC, SRE, DUK, AEE, NEE, ED, DE, COST, PG, LMT, HON, ETR, MO, CTAS)
  Tier 2 — remaining 64 tickers from Phase 2 backtest

PIPELINE:
  fetch (cache-first, sequential, 1.1s delay) →
  calculate AO/AC →
  detect S1 + S2 →
  rank by tier + signal level →
  report

OUTPUT:
  Console table (S2 first, then S1)
  results/radar_YYYY-WNN.csv
```

### W17-2026 First Run — Results

**17 S1 signals active, 0 S2 signals** — no confirmations yet, observation phase only.

| Ticker | Tier | Signal | Weeks Active | AO | AC | HR (hist) |
|--------|------|--------|-------------|----|----|-----------|
| **PG** | 1 | S1 | 1 | −5.75 | −3.08 🟢 | 65.4% |
| CLX | 2 | S1 | 1 | negative | green | — |
| GIS | 2 | S1 | 1 | negative | green | — |
| SYY | 2 | S1 | 1 | negative | green | — |
| KMB | 2 | S1 | 1 | negative | green | — |
| MDLZ | 2 | S1 | 1 | negative | green | — |
| BA | 2 | S1 | — | negative | green | — |
| EMR | 2 | S1 | — | negative | green | — |
| GE | 2 | S1 | — | negative | green | — |
| MMM | 2 | S1 | — | negative | green | — |
| CTAS | 2 | S1 | — | negative | green | — |
| AES | 2 | S1 | — | negative | green | — |
| NRG | 2 | S1 | — | negative | green | — |
| ES | 2 | S1 | — | negative | green | — |

**Reading:** Broad XLP correction visible (CLX, GIS, SYY, KMB, MDLZ simultaneously in S1). PG is the only Tier 1 with active signal — watch for S2 confirmation in coming weeks.

### Usage

```bash
# Setup
cp .env.example .env
# Edit .env and add your AV_API_KEY

# Install
npm install

# Run full radar
npx tsx src/index.ts

# Run Tier 1 only (fast, < 30 seconds)
npx tsx src/index.ts --tier=1

# Single ticker detail
npx tsx src/index.ts --ticker=SO
```

### Expansion Strategy

| Week | Universe | Expansion |
|------|----------|-----------|
| W17 | 79 tickers | Baseline |
| W18 | +10 | XLU rank 21-30 by market cap |
| W19 | +10 | XLI rank 21-30 by market cap |
| W20 | +10 | XLP rank 21-30 by market cap |
| W21 | +10 | XLE rank 21-30 by market cap |
| W22+ | New sectors | XLV (healthcare) or XLF (financials) |

---

## Repository Structure

```
src/
  indicators.ts      — AO/AC calculation (Williams method, midpoint-based)
  signals.ts         — S1 detector (AC red→green, AO<0, AC<0)
  signals-s2.ts      — S2 detector (AC crosses zero, AO<0 recovering)
  universe.ts        — Ticker universe with tier classification
  cache.ts           — Persistent cache (data/cache/, 6-day TTL)
  fetcher.ts         — Alpha Vantage batch fetcher (sequential, 1.1s delay)
  data.ts            — Single-ticker AV fetcher (Phase 1 legacy)
  scanner.ts         — Main radar engine
  weekly-report.ts   — Formatted output + CSV writer
  backtest-phase2.ts — Phase 2 backtest engine
  backtest-s2.ts     — S2 backtest engine
  compare-s1-s2.ts   — S1 vs S2 comparative analysis
  index.ts           — CLI entry point

results/
  phase1_backtest.csv           — Phase 1 ETF signals
  phase2_scorecard.csv          — Phase 2 ticker scorecard
  phase2_outcomes.csv           — Phase 2 per-signal outcomes
  phase2_qualitative_analysis.md — Qualitative outlier analysis
  phase2b_s2_scorecard.csv      — S2 signal scorecard
  phase2b_compare_s1_s2.csv     — S1 vs S2 comparison
  radar_2026-W17.csv            — Live radar W17 output

data/
  cache/             — Alpha Vantage response cache (gitignored)
```

## Setup

```bash
npm install
cp .env.example .env   # Add your AV_API_KEY
npx tsx src/index.ts
```

## Status

| Phase | Status | Date |
|-------|--------|------|
| Phase 1 — ETF Backtesting | ✅ Complete | 2026-04-24 |
| Phase 2 — Individual Tickers | ✅ Complete | 2026-04-24 |
| Phase 2B — S2 Validation | ✅ Complete | 2026-04-24 |
| Phase 3 — Live Weekly Radar | ✅ Operational | 2026-04-24 |
| Phase 4 — Reddit/Xpoz Enrichment | 🔜 Planned | — |
