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

## Resultados del Backtest (2019–2026, Weekly)

Universo: 8 ETFs sectoriales del S&P 500. **338 señales detectadas** en ~26 años de datos.

| Sector | Señales | Hit Rate 8W | Avg Return 8W | Avg Return 12W | Max DD |
|--------|---------|-------------|---------------|----------------|--------|
| **Defensive** (XLU, XLP) | 100 | **70.0%** | +2.44% | +2.81% | -5.78% |
| **Cyclical** (XLE, XLI) | 92 | 66.3% | +2.76% | +2.60% | -9.61% |
| **Growth/Tech** (XLK, XLY) | 82 | 62.2% | +2.42% | +3.10% | -10.01% |
| **High-Vol** (XBI, ARKG) | 65 | 56.3% | +2.40% | +2.48% | -13.35% |
| **OVERALL** | **339** | **64.5%** | — | — | — |

### Hallazgos Clave

1. **La tesis se valida**: Hit rate global de 64.5% vs. ~50% aleatorio. Significativo.
2. **Defensivos ganan en fiabilidad** (70% hit rate), con menor drawdown (-5.78%). Ideal para señales de alta confianza.
3. **Cíclicos tienen mejor return promedio** (+2.76% a 8W) con mayor volatilidad. Mayor riesgo/recompensa.
4. **High-Vol (biotech)**: señales más ruidosas (56% hit rate) pero los aciertos son explosivos (+38% a 8W en 2020).
5. **AO Lag**: 6-7 semanas promedio para que AO cruce cero tras la señal. Ventana óptima de entrada: antes del cruce de AO.
6. **Peores señales** ocurren en bear markets estructurales (2008, 2002, dot-com crash) — contexto macro importa.

### Top 10 Señales Históricas

| Ticker | Fecha | Grupo | 4W% | 8W% | 12W% |
|--------|-------|-------|-----|-----|------|
| ARKG | 2020-04-03 | High-Vol | +33.8% | **+55.6%** | +69.6% |
| XBI | 2020-04-03 | High-Vol | +21.3% | +38.3% | +47.5% |
| XLY | 2020-04-03 | Growth/Tech | +21.5% | +34.4% | +34.2% |
| XLE | 2020-10-09 | Cyclical | -6.0% | +32.0% | +24.8% |
| XLK | 2020-04-03 | Growth/Tech | +15.3% | +27.0% | +32.0% |

> El COVID bottom de abril 2020 fue la señal más clara de la historia reciente. PLUG (caso de estudio) fue una señal equivalente a nivel de ticker individual.

## Metodología

### Cálculo de Indicadores
```
midpoint = (high + low) / 2          # Williams usa midpoint, no cierre
AO = SMA(midpoint, 5) − SMA(midpoint, 34)
AC = AO − SMA(AO, 5)
color = verde si valor[t] > valor[t-1], rojo si valor[t] < valor[t-1]
```

### Métricas de Evaluación
- **Hit Rate 8W**: % de señales con retorno positivo a 8 semanas
- **Avg Return**: retorno promedio a 4W / 8W / 12W desde la señal
- **Max Drawdown**: caída máxima en ventana de 12 semanas post-señal
- **AO Lag**: semanas hasta que AO cruza a positivo (indicador de timing)

## Estructura del Código

```
src/
  data.ts          # Alpha Vantage weekly data fetcher
  indicators.ts    # AO y AC calculation (Bill Williams exact formulas)
  signals.ts       # Signal detection — AC rojo→verde con ambos negativos
  fetch-all.ts     # Batch downloader con rate limiting (13s entre calls)
  backtest-local.ts # Backtest engine — lee cache local, sin API calls
  scan.ts          # Live scanner — estado actual de cada ticker
  verify.ts        # Spot-check vs TradingView

results/
  backtest_2019-2026.csv  # 338 señales con todos los outcomes
```

## Uso

```bash
npm install

# Paso 1: descargar datos (una sola vez, ~2 min por rate limiting)
npx tsx src/fetch-all.ts

# Paso 2: backtesting completo desde cache
npx tsx src/backtest-local.ts

# Paso 3: scan live del estado actual de todos los tickers
npx tsx src/scan.ts
```

## Próximos Pasos

- [ ] Expandir universo a tickers individuales del S&P 500 por sector
- [ ] Filtro de contexto macro (evitar señales en bear markets estructurales)
- [ ] Backtest con criterio de confirmación de 2 semanas de AC verde
- [ ] Dashboard live con ECharts (señales activas + AO/AC chart)
- [ ] Integración con Jarvis — alertas automáticas semanales

## Stack

- **Datos**: Alpha Vantage API (weekly adjusted)
- **Lenguaje**: TypeScript ESM, Node.js
- **Almacenamiento**: JSON cache local + CSV results
- **Timeframe**: Weekly exclusivamente

---

*Basado en el sistema de trading de Bill Williams — "Trading Chaos" (1995)*
*Caso de estudio visual: PLUG Power — señal AC detectada semanas antes del rally de +43%*
