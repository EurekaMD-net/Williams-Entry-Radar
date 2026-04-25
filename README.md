# Williams Entry Radar

Early-detection radar based on Bill Williams' AO + AC oscillators applied to the **weekly timeframe**. Scans entire sectors to surface entry candidates _before_ price confirms the move.

## The Signal (Fede's Hypothesis)

When **both AO and AC are negative** and AC flips from **red → green after reaching its cycle bottom**, the system signals early momentum exhaustion. Not a buy signal — a signal to _start watching_.

```
ALERT CONDITION (S1 — Observation):
  AO  < 0  (negative, bearish territory)
  AC  < 0  (negative, bearish territory)
  AC[t] > AC[t-1]  (AC rose this week — green)

CONFIRMATION (S2 — Attention):
  prev.AC < 0 AND AC >= 0  (AC crossed zero this week)
  AO < 0
  Quality split:
    PURE     — AO[t] < AO[t-1]  (AO still falling/red — clean entry)
    DEGRADED — AO[t] >= AO[t-1] (AO already recovering — late confirmation)

EXCLUSIONS (apply to all levels):
  ranging   — 12-week price range / avg < 15% → lateral, low conviction
  AO >= 0   — every signal requires a negative AO

HIERARCHY:
  AC signals first → AO confirms weeks later → Price follows.
  S1  = start watching.
  S2D = a move is underway, but price already moved.
  S2  = consider acting (clean entry, both oscillators agree the move hasn't begun).
```

**Key insight from backtesting:** In individual tickers, AO lag averages 10-18 weeks after S1. You have 2-4 months of observation before AO confirms. Patience is part of the system.

---

## ⚠️ Known biases in the published hit rates

The Phase 1 / Phase 2 / S2 hit rates below were produced with two
methodological biases that the reader should weigh before treating
them as expected forward performance:

1. **Lookahead bias (now fixed).** The original backtests filled the
   trade at the close of the signal bar — the same bar whose AO/AC was
   used to decide the signal. Physically a trader can only fill on the
   _next_ bar. The numbers in the tables below were produced under the
   old code and have not yet been re-run on the fixed pipeline; expect
   hit rates to drop on the order of a few percentage points once
   recomputed.
2. **Survivorship bias (still present).** The universe is the Phase-2
   winners list — the current (2026) membership of XLU / XLI / XLP /
   XLE. Historical backtests on 2001–2026 therefore ignore every name
   that was delisted, went bankrupt, or dropped out of its sector ETF
   between then and now. Future versions should reconstruct point-in-
   time index membership from an authoritative listing-status source.

These caveats apply to **every number marked with ⚠️ below** until a
re-run on the fixed pipeline replaces them.

## Methodology

- **Timeframe**: Weekly exclusively
- **Data**: Alpha Vantage API (weekly OHLC, adjusted close)
- **AO**: SMA(5) of midpoint − SMA(34) of midpoint, where midpoint = (high + low) / 2
- **AC**: AO − SMA(5) of AO
- **AC Color**: green if AC[t] > AC[t-1], red if AC[t] < AC[t-1]

---

## Phase 1 — ETF Backtesting ✅

**338 signals** across 8 sector ETFs, 2001–2026 weekly data.

| Group       | Tickers   | Hit Rate 8W | Avg Ret 8W | Max DD  |
| ----------- | --------- | ----------- | ---------- | ------- |
| Defensive   | XLU, XLP  | **70.0%**   | +2.44%     | -5.78%  |
| Cyclical    | XLE, XLI  | 66.3%       | +2.76%     | -9.61%  |
| Growth/Tech | XLK, XLY  | 62.2%       | +2.42%     | -10.01% |
| High-Vol    | XBI, ARKG | 56.3%       | +2.40%     | -13.35% |
| **OVERALL** | —         | **64.5%**   | —          | —       |

**Key finding:** Hypothesis validated. 64.5% hit rate vs ~50% random. Defensives most reliable; High-Vol too noisy.

---

## Phase 2 — Individual Tickers ✅

**3,774 signals** across 79 individual tickers (XLU, XLP, XLE, XLI), 2001–2026 data.

| Sector                 | Tickers | Avg HR 8W | Avg Ret 8W | Avg Max DD |
| ---------------------- | ------- | --------- | ---------- | ---------- |
| XLU (Utilities)        | 20      | **72.7%** | +5.07%     | -4.9%      |
| XLI (Industrials)      | 20      | 65.0%     | +4.38%     | -6.3%      |
| XLE (Energy)           | 20      | 63.9%     | **+5.11%** | -8.8%      |
| XLP (Consumer Staples) | 19      | 63.1%     | +2.50%     | -5.1%      |

### Top Outliers (≥20 signals, HR ≥ 73%, Max DD < 5%)

| Ticker   | Sector | Signals | HR 8W     | Ret 8W | Max DD | AO Lag |
| -------- | ------ | ------- | --------- | ------ | ------ | ------ |
| **SO**   | XLU    | 40      | **85.0%** | +6.60% | -1.7%  | 11.8W  |
| **WEC**  | XLU    | 51      | 80.4%     | +4.13% | -3.0%  | 12.4W  |
| **SRE**  | XLU    | 39      | 79.5%     | +4.89% | -3.0%  | 15.6W  |
| **DUK**  | XLU    | 48      | 79.2%     | +3.42% | -4.9%  | 18.4W  |
| **AEE**  | XLU    | 50      | 78.0%     | +4.12% | -3.1%  | 14.7W  |
| **NEE**  | XLU    | 48      | 77.1%     | +3.82% | -4.2%  | 14.6W  |
| **ED**   | XLU    | 55      | 76.4%     | +4.00% | -2.4%  | 10.8W  |
| **DE**   | XLI    | 51      | 74.5%     | +6.09% | -4.3%  | 11.7W  |
| **COST** | XLP    | 43      | 74.4%     | +4.39% | -4.2%  | 11.6W  |

### Why Utilities Dominate

Regulated cash flows + dividend yield (≥2.5%) create a structural buyer floor at price lows. AC detects the yield-driven stabilization — institutional income buyers (pensions, funds) rebalance systematically when yield becomes attractive vs. bonds, creating predictable demand at the lows.

### Signal Limitations

- **Does not distinguish correction from deterioration.** KHC, FANG — broken businesses generate false positives. Minimum fundamental filter required before acting on S2.
- **Macro filter adds no edge.** Signal works in bull and bear markets (64.8% vs 67.4%). No SPY SMA40W filter needed.
- **Multiple S1 signals during prolonged downtrend are noise.** The valuable signal is the one that exits the cycle bottom — S2 helps identify it.

---

## Phase 2B — S2 Signal Validation ✅

**491 S2 signals** (−87% vs S1's 3,774) across the same 79-ticker universe.

| Metric          | S1    | S2        | Delta    |
| --------------- | ----- | --------- | -------- |
| Total signals   | 3,774 | 491       | −87%     |
| Avg Hit Rate 8W | 65.8% | 60.7%     | −5.1pp   |
| Avg Max DD      | −6.2% | **−4.9%** | +1.3pp ▲ |
| AO Lag          | 17W   | **11.7W** | −5.3W ▲  |

**Key insight:** S2 does not improve average hit rate — it _concentrates quality_. In predictable businesses (PG: 100% HR / −0.09% DD; LMT: 100% HR; HON: 100% HR; COST: 100% HR) S2 is extraordinary. In commodity-driven energy, S2 generates late false positives. Rule: use S2 selectively in businesses with predictable cash flows and dividend ≥ 2.5%.

Full qualitative analysis: [results/phase2_qualitative_analysis.md](results/phase2_qualitative_analysis.md)

---

## Phase 3 — Live Weekly Radar ✅

SQLite-backed scanner that runs weekly, fetches current data, detects active S1/S2 signals, and produces an actionable report.

### Architecture

```
delivery preflight (Telegram getMe/getChat + GitHub /user — warn on broken)
  ↓
Universe (79 tickers, 3 tiers)
  ↓
fetch (AV Premium, sequential 1s delay, ~80s for full universe)
  ↓
calculate AO + AC (indicators.ts)
  ↓
detect S1 + S2 (signals.ts / signals-s2.ts)
  ↓
weekly report (console + CSV in results/)
  ↓
[if S2 or S2D] xpoz enrichment (POST localhost:8086/search/keyword — wrapped:
  failures cannot block downstream delivery)
  ↓
push to GitHub (wrapped — failures cannot block Telegram)
  ↓
send Telegram
```

Delivery preflight runs at step 0 so misconfigured Telegram or GitHub
credentials surface immediately in the journal instead of after the 5-minute
scan. Xpoz enrichment routes through the local `xpoz-pipeline` service
(`/root/claude/projects/xpoz-pipeline/`) — the previous direct REST call to
`api.xpoz.io` was wired against a nonexistent endpoint.

### W17-2026 First Run — Results

**77 tickers scanned | 17 S1 active | 0 S2 active**

| Tier | Ticker                   | Signal | Weeks | HR Historical              |
| ---- | ------------------------ | ------ | ----- | -------------------------- |
| 1    | **PG**                   | S1     | 1     | 65.4%                      |
| 2    | CLX, GIS, SYY, KMB, MDLZ | S1     | 1-2   | XLP sector-wide correction |
| 2    | BA, EMR, GE, MMM, CTAS   | S1     | 1-2   | XLI correction             |
| 2    | AES, NRG, ES             | S1     | 1-2   | XLU partial correction     |

0 S2 signals = no confirmed reversals yet. Market in early correction phase. S1s are observation, not action.

### Usage

```bash
# Setup
cp .env.example .env
# Edit .env and add: AV_API_KEY=your_key_here

# Install
npm install

# Run full radar (all 79 tickers)
AV_API_KEY=your_key tsx src/radar.ts

# Tier 1 only (fast, < 30 seconds)
tsx src/radar.ts --tier=1

# Single ticker with detail
tsx src/radar.ts --ticker=SO
```

### Universe Expansion Strategy

One batch per week, ordered by sector quality (highest expected HR first):

| Week        | Batch      | Sector          | Criterion                                   |
| ----------- | ---------- | --------------- | ------------------------------------------- |
| W1 (launch) | —          | 79 base tickers | Backtested in Phase 2                       |
| W2          | Batch A    | XLU rank 21-30  | Highest historical HR                       |
| W3          | Batch B    | XLI rank 21-30  | Defensive industrials                       |
| W4          | Batch C    | XLP rank 21-30  | Consumer staples                            |
| W5          | Batch D    | XLE rank 21-30  | Energy — added last                         |
| W6+         | New sector | XLV or XLF      | Based on which sector shows most S1 signals |

Inclusion criteria for new tickers (≥ 3 of 4): market cap ≥ $5B · dividend ≥ 1.5% · beta ≤ 1.1 · AV historical data ≥ 5 years.

---

## Phase 4 — Operational Radar (planned) 🔧

Full design in [docs/Fase4_Operaciones_Radar.md](docs/Fase4_Operaciones_Radar.md).

### What Phase 4 adds

| Feature                 | Description                                                    |
| ----------------------- | -------------------------------------------------------------- |
| **Scheduled execution** | `node-cron` trigger every Friday ~18:00 MX                     |
| **Expanded report**     | "New Tickers Added" section + "S2 Status" section              |
| **`--expand` CLI flag** | `tsx radar.ts --expand=XLU:21-30` adds batch to universe       |
| **Xpoz integration**    | Reddit sentiment enrichment — fires **only when S2 is active** |
| **Persistent results**  | CSV saved outside `/tmp/` (env-configurable path)              |

### Xpoz conditional logic

```
if (s2Active.length > 0) {
  // Query Xpoz for each S2 ticker
  // Look for: rising mention volume, positive sentiment, analyst coverage
  // Add confluence score to report
  // High confluence = elevated priority
} else {
  // No S2 → Xpoz not called (saves API quota)
}
```

Xpoz is a second-layer validator, not a discovery tool. It only runs when the technical signal says "pay attention now."

### Code injection points

| File                   | Change needed                                                                  |
| ---------------------- | ------------------------------------------------------------------------------ |
| `src/index.ts`         | Add `--expand` flag + Xpoz conditional post-scan                               |
| `src/weekly-report.ts` | Add "New Tickers" + "S2/Xpoz Status" sections + env-configurable `RESULTS_DIR` |
| `src/cache.ts`         | Move `RESULTS_DIR` from hardcoded `/tmp/` to `process.env.RADAR_RESULTS_DIR`   |
| `src/xpoz-enrich.ts`   | New module — create when implementing Xpoz integration                         |

---

## Repository Structure

```
src/
  db.ts              # SQLite schema (weekly_bars + ticker_registry)
  cache.ts           # Cache layer — reads/writes from SQLite
  fetcher.ts         # Alpha Vantage fetch + rate limiting
  indicators.ts      # AO + AC calculation
  signals.ts         # S1 detection logic
  signals-s2.ts      # S2 detection logic
  scanner.ts         # Orchestrates fetch → indicators → signals
  weekly-report.ts   # Report formatter (console + CSV)
  universe.ts        # Ticker universe with metadata + expansion
  radar.ts           # CLI entry point
data/
  radar.db           # SQLite database (NOT committed — operational data)
results/
  radar_YYYY-WNN.csv # Weekly scan results
docs/
  Fase4_Operaciones_Radar.md  # Phase 4 operational design
```

---

## Setup

```bash
git clone https://github.com/EurekaMD-net/Williams-Entry-Radar
cd Williams-Entry-Radar
npm install
cp .env.example .env
# Add AV_API_KEY to .env
```

**Environment variables** (see `.env.example`):

- `AV_API_KEY` — Alpha Vantage API key (required)
- `RADAR_CACHE_DIR` — Override SQLite cache directory (optional)
- `RADAR_RESULTS_DIR` — Override CSV output directory (optional)

---

## Phase Status

| Phase    | Description                                  | Status      |
| -------- | -------------------------------------------- | ----------- |
| Phase 1  | ETF backtesting (8 ETFs, 2001–2026)          | ✅ Complete |
| Phase 2  | Individual ticker backtesting (79 tickers)   | ✅ Complete |
| Phase 2B | S2 signal validation                         | ✅ Complete |
| Phase 3  | Live weekly scanner + SQLite cache           | ✅ Complete |
| Phase 4  | Scheduled ops + Xpoz enrichment + expand CLI | 🔧 Planned  |
