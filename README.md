# Williams Entry Radar

> Detección temprana de reversiones usando Awesome Oscillator (AO) y Accelerator Oscillator (AC) de Bill Williams — timeframe Weekly.

## La Señal

Cuando **ambos AO y AC están en territorio negativo** y AC cambia de color **rojo → verde** (primera barra verde tras una serie roja), el sistema de momentum está iniciando una inversión. No es señal de compra inmediata — es señal de **observación activa**.

```
CONDICIÓN DE ALERTA (todas deben cumplirse):
  AO[t]  < 0              (momentum aún bajista)
  AC[t]  < 0              (aceleración aún bajista)
  AC[t] > AC[t-1]         (AC tocó bottom y está girando)
  AC color: rojo → verde  (primer verde después de serie roja)
```

**Jerarquía de Williams:** AC → AO → Precio. AC anticipa a AO; AO anticipa al precio.

---

## Fase 1 — ETFs Sectoriales (2019–2026, 8 tickers)

**338 señales detectadas** en 8 ETFs sectoriales.

| Sector | Hit Rate 8W | Avg Return 8W | Max DD |
|--------|-------------|---------------|--------|
| **Defensive** (XLU, XLP) | **70.0%** | +2.44% | -5.78% |
| **Cyclical** (XLE, XLI) | 66.3% | +2.76% | -9.61% |
| **Growth/Tech** (XLK, XLY) | 62.2% | +2.42% | -10.01% |
| **High-Vol** (XBI, ARKG) | 56.3% | +2.40% | -13.35% |
| **OVERALL** | **64.5%** | — | — |

**AO Lag promedio:** 6-7 semanas tras la señal AC.

---

## Fase 2 — Componentes Individuales (26 años de datos, 80 tickers)

**3,774 señales** en 79 tickers de 4 sectores (XLU, XLP, XLE, XLI). Datos 2001–2026 weekly. Filtro macro: SPY vs SMA(40W).

### Sector Summary

| Sector | Tickers | Señales | Avg HR 8W | Avg Ret 8W | Avg Max DD |
|--------|---------|---------|-----------|------------|------------|
| **XLU** (Utilities) | 20 | 923 | **72.7%** | +5.07% | -4.9% |
| **XLI** (Industrials) | 19 | 924 | 65.0% | +4.38% | -6.3% |
| **XLE** (Energy) | 20 | 912 | 63.9% | **+5.11%** | -8.8% |
| **XLP** (Consumer Staples) | 20 | 1,015 | 63.1% | +2.50% | -5.1% |

### Top 15 Outliers (composite score = hit rate × clean ratio / drawdown)

| Rank | Ticker | Sector | Signals | HR 8W | Ret 8W | Max DD | AO Lag | Score |
|------|--------|--------|---------|-------|--------|--------|--------|-------|
| 1 | **CEG** | Utilities | 2 | 100% | +43.3% | -1.3% | 9.0W | 1.924 |
| 2 | **SO** | Utilities | 40 | **85%** | +6.6% | -1.7% | 11.8W | 1.704 |
| 3 | **SRE** | Utilities | 39 | 80% | +4.9% | -3.0% | 15.6W | 1.469 |
| 4 | **DE** | Industrials | 51 | 75% | +6.1% | -4.3% | 11.7W | 1.443 |
| 5 | **WEC** | Utilities | 51 | 80% | +4.1% | -3.0% | 12.4W | 1.412 |
| 6 | **LMT** | Industrials | 45 | 67% | +5.9% | -3.3% | 13.3W | 1.384 |
| 7 | **AEE** | Utilities | 50 | 78% | +4.1% | -3.1% | 14.7W | 1.376 |
| 8 | **ED** | Utilities | 55 | 76% | +4.0% | -2.4% | 10.8W | 1.369 |
| 9 | **ETN** | Industrials | 45 | 73% | +6.4% | -5.9% | 12.8W | 1.363 |
| 10 | **BKR** | Energy | 17 | 76% | +11.3% | -7.7% | 12.9W | 1.323 |
| 11 | **CTAS** | Industrials | 44 | 66% | +6.2% | -4.8% | 12.7W | 1.298 |
| 12 | **COST** | Consumer Staples | 43 | 74% | +4.4% | -4.2% | 11.6W | 1.294 |
| 13 | **NEE** | Utilities | 48 | 77% | +3.8% | -4.2% | 14.6W | 1.288 |
| 14 | **HON** | Industrials | 44 | 75% | +4.9% | -5.7% | 13.0W | 1.263 |
| 15 | **DUK** | Utilities | 48 | 79% | +3.4% | -4.9% | 18.4W | 1.240 |

> **CEG** (Constellation Energy) tiene solo 2 señales históricas — score inflado por muestra pequeña. El universo de alta confianza empieza en **SO** (40 señales, 85% HR).

### Macro Filter Analysis

| Régimen | Señales | Hit Rate 8W |
|---------|---------|-------------|
| Bull (SPY > SMA40W) | 2,287 | 64.8% |
| Bear (SPY < SMA40W) | 1,487 | **67.4%** |

**Hallazgo sorprendente:** La señal funciona *mejor* en mercados bajistas. Esto tiene sentido mecánico — cuando el mercado general está débil, las acciones defensivas (XLU, XLP) que generan señal AC están en sobre-venta extrema, lo que produce rebounds más pronunciados.

---

## Hallazgos Clave — Fase 2

1. **XLU domina en fiabilidad**: 72.7% avg hit rate, drawdown controlado (-4.9%). El sector ideal para señales de alta confianza.
2. **XLE domina en retorno**: +5.11% avg a 8W pero con mayor drawdown (-8.8%). Mayor riesgo/recompensa.
3. **SO (Southern Company) es el outlier más robusto**: 85% hit rate en 40 señales — estadísticamente sólido, no ruido.
4. **AO Lag expandido**: En tickers individuales el lag es 10-18 semanas (vs 6-7W en ETFs). El componente individual tarda más en confirmar que el ETF.
5. **Macro filter no mejora significativamente**: La señal es robusta en ambos regímenes (64.8% bull vs 67.4% bear). No filtrar por macro.

---

## Señales Candidatas para Radar Live

Los tickers con >30 señales históricas y HR ≥ 75%:

| Ticker | Señales | HR 8W | Notas |
|--------|---------|-------|-------|
| **SO** | 40 | 85% | Más fiable del universo |
| **WEC** | 51 | 80% | Utility mediana, ciclos limpios |
| **DUK** | 48 | 79% | Duke Energy, defensivo puro |
| **SRE** | 39 | 80% | Sempra, exposición internacional |
| **NEE** | 48 | 77% | NextEra, líder renovables |
| **AEE** | 50 | 78% | Ameren, muy limpio |
| **ED** | 55 | 76% | Consolidated Edison, 26 años de datos |
| **HON** | 44 | 75% | Industrial diversificado |
| **DE** | 51 | 75% | Deere, ciclos agrícolas |
| **BKR** | 17 | 76% | Baker Hughes, muestra pequeña pero sólida |

---

## Metodología

### Cálculo de Indicadores
```
midpoint = (high + low) / 2          # Williams usa midpoint, no cierre
AO = SMA(midpoint, 5) − SMA(midpoint, 34)
AC = AO − SMA(AO, 5)
color = verde si valor[t] > valor[t-1], rojo si valor[t] < valor[t-1]
```

### Composite Score (Fase 2)
```
score = (hitRate8W × 0.4 + cleanHitRate × 0.3 + min(avgRet8W × 5, 0.3))
        × (1 + cleanRatio)
        / (1 + |avgMaxDD| × 3)

cleanSignal = señal con maxDD > -15% en ventana de 12 semanas
```

### Métricas de Evaluación
- **Hit Rate 8W**: % de señales con retorno positivo a 8 semanas
- **Avg Return**: retorno promedio a 4W / 8W / 12W desde la señal
- **Max Drawdown**: caída máxima en ventana de 12 semanas post-señal
- **AO Lag**: semanas hasta que AO cruza a positivo
- **Clean Signals**: señales sin drawdown catastrófico (< -15%)

---

## Estructura del Código

```
src/
  data.ts              # Alpha Vantage weekly data fetcher
  indicators.ts        # AO y AC calculation (Bill Williams exact formulas)
  signals.ts           # Signal detection — AC rojo→verde con ambos negativos
  get-components.ts    # Top 20 tickers per sector (XLU, XLP, XLE, XLI)
  fetch-all.ts         # Phase 1 batch downloader (8 ETFs)
  fetch-phase2.ts      # Phase 2 batch downloader (81 tickers, sequential + cache)
  backtest-local.ts    # Phase 1 backtest engine
  backtest-phase2.ts   # Phase 2 engine (macro filter, composite score)
  scan.ts              # Live scanner — estado actual de todos los tickers
  verify.ts            # Spot-check vs TradingView

results/
  backtest_2019-2026.csv      # Phase 1: 338 señales (8 ETFs)
  phase2_outcomes.csv         # Phase 2: 3,774 señales individuales
  phase2_scorecard.csv        # Phase 2: scorecard por ticker (79 tickers)
```

---

## Próximos Pasos — Fase 3

- [ ] **Scanner semanal live**: correr cada viernes post-cierre, detectar señales nuevas en los 10 candidatos del radar
- [ ] **Integración Jarvis**: alertas automáticas vía Telegram cuando aparece nueva señal en los top tickers
- [ ] **Xpoz sentiment layer**: cruzar señal Williams con sentimiento Reddit (r/stocks, r/investing) del ticker — señal + sentimiento negativo extremo = setup más fuerte
- [ ] **Confirmación de 2W**: backtest adicional con condición "AC verde × 2 semanas consecutivas" — ¿sube el hit rate?
- [ ] **Dashboard ECharts**: visualización de AO/AC + señales sobre precio para los top 10

---

## Stack

- **Datos**: Alpha Vantage API (weekly adjusted, Premium)
- **Lenguaje**: TypeScript ESM, Node.js
- **Almacenamiento**: JSON cache local + CSV results
- **Timeframe**: Weekly exclusivamente

---

*Basado en el sistema de trading de Bill Williams — "Trading Chaos" (1995)*
*Caso de estudio visual: PLUG Power — señal AC detectada semanas antes del rally de +43%*
