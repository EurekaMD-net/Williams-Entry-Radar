# Williams Entry Radar

> Hypothesis validation and live screening tool for the Bill Williams AO/AC momentum signal.

---

## Objective

Determine whether the **AC red→green crossover with both AO < 0 and AC < 0** reliably predicts the onset of bullish momentum reversals — and whether this signal behaves differently across consolidated vs. high-volatility sectors.

This project was conceived from direct trading experience: on weekly charts, when both oscillators are negative and AC prints its first green bar after reaching a cycle bottom, the *deceleration of decline* often precedes the price reversal by several weeks. The PLUG (Plug Power) 2023 weekly chart is the canonical visual reference: AC turned green before AO, AO turned green before price, and price subsequently exploded +43% in a single candle.

---

## Hypothesis

> **H₁:** When `AO < 0` AND `AC < 0` AND `AC[t] > AC[t-1]` (first green bar after a cycle bottom), the equity is in the early phase of momentum reversal. A sustained green AC while AO remains negative is a high-probability precursor to a full AO crossover and price rally within 4–12 weeks.

> **H₀ (null):** The AC red→green transition under these conditions produces no statistically significant forward returns vs. random entry.

---

## Signal Definition

```
midpoint(t) = (High(t) + Low(t)) / 2

AO(t)    = SMA(midpoint, 5) − SMA(midpoint, 34)
AC(t)    = AO(t) − SMA(AO, 5)

color(t) = GREEN if AC(t) > AC(t−1)
           RED   if AC(t) < AC(t−1)

SIGNAL   = AO(t) < 0
         AND AC(t) < 0
         AND color(t) == GREEN
         AND color(t−1) == RED          -- first green after red streak
         AND AC(t) == local_min(AC, 8w) -- exiting a cycle bottom
```

**Timeframe:** Weekly (1W) exclusively.  
**Data source:** Alpha Vantage `TIME_SERIES_WEEKLY_ADJUSTED`

---

## Backtesting Methodology

### Universe — Phase 1 (ETF Sector Proxies)

| Group | Tickers | Rationale |
|-------|---------|-----------|
| Defensive / Consolidated | XLU, XLP | Low beta, slow cycles — cleanest signal expected |
| Cyclical mid-vol | XLE, XLI | Macro-driven cycles — strong signal candidates |
| Growth / Tech | XLK, XLY | High momentum, fast reversals — signal quality test |
| High volatility | XBI, ARKG | Biotech — frequent signals, high noise expected |

### Period
`2019-01-01 → 2026-04-18` (5+ years, ~365 weekly bars per ticker)

### Phase 2 — Individual Equities
After sector-level validation, descend into S&P 500 components of the best-performing sectors (top 3 by signal quality metrics).

---

## Key Metrics

| Metric | Definition | Target threshold |
|--------|------------|-----------------|
| **Hit Rate** | % of signals with positive return at 8W | > 55% |
| **Profit Factor** | Gross gains / Gross losses across all signals | > 1.5 |
| **Avg Return 4W / 8W / 12W** | Mean % price change post-signal | > 3% / 6% / 10% |
| **Max Drawdown (post-signal)** | Worst intra-period decline after signal date | < 10% |
| **AO Lag** | Weeks until AO crosses zero after AC signal | Median < 4W |
| **Signal Frequency** | Signals per year per ticker | Characterization only |

---

## Comparative Analysis Questions

1. Does the hit rate exceed random (>55%) across all sector groups?
2. Do defensive sectors (XLU, XLP) show fewer but cleaner signals?
3. Do volatile sectors (XBI, ARKG) show higher signal frequency but lower hit rate?
4. Is the AO lag (weeks from AC signal to AO crossover) predictable by sector?
5. What is the optimal confirmation window (2W / 3W of sustained green AC) to filter false positives?

---

## Deliverables

- `data/signals_[TICKER].csv` — all detected signals with outcome columns
- `output/sector_scorecard.md` — hit rate, profit factor, avg returns, drawdown by sector
- `output/hypothesis_verdict.md` — statistical conclusion: H₁ confirmed, rejected, or conditional
- `src/` — TypeScript backtesting engine (Alpha Vantage → indicator calc → signal detection → outcome measurement)

---

## Current Status

| Phase | Status | Notes |
|-------|--------|-------|
| Signal definition | ✅ Complete | Validated visually on PLUG 1W (2023 rally) |
| Experiment design | ✅ Complete | 8 ETFs, 5-year window, 5 outcome metrics |
| Data pipeline | 🔄 In progress | Alpha Vantage API confirmed live |
| Backtesting engine | ⏳ Pending | TypeScript, AO/AC calc + signal scanner |
| Sector scorecard | ⏳ Pending | After backtesting engine runs |
| Live radar | ⏳ Pending | After hypothesis validation |

---

## References

- Bill Williams, *Trading Chaos* (2nd ed.) — original AO/AC framework
- Bill Williams, *New Trading Dimensions* — fractal + oscillator system
- PLUG weekly chart (TradingView, 2023) — canonical signal example

---

*Project initiated: 2026-04-23 | Owner: Federico Moctezuma | Engine: Jarvis Alfa v7.5*
