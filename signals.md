# Williams Entry Radar — Señales Semanales

Este archivo es generado automáticamente cada viernes 18:00 MX por `src/scheduler.ts`.
Cada entrada documenta las señales activas en esa semana.

---

## Metodología — definiciones de señal

El repo contiene **tres definiciones distintas de S1**, por diseño:

| Módulo              | Usado por                                                           | Condición S1                                                                                      | Comportamiento                                                     |
| ------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `src/scanner.ts`    | **Producción** (scheduler, scan-from-db, radar)                     | `ao<0 && ac<0 && ac > prev.ac && !ranging`                                                        | Etiqueta **cada semana** que AC sube en territorio negativo        |
| `src/signals.ts`    | Backtests (`backtest-phase2/3`, `backtest-w20`, `backtest-biotech`) | `ao<0 && ac<0 && acColor==="green" && prev.acColor==="red"` + AC cerca del fondo (lookback 8 wks) | Dispara **solo** en el primer verde tras rojo (gatillo de entrada) |
| `src/signals-s2.ts` | `backtest-s2.ts`                                                    | AC cruza cero + AO recuperando desde fondo reciente                                               | Confirmación estricta (más rara, mayor hit rate)                   |

**Consecuencia operativa:** las métricas históricas (HR%, avgRet, maxDD, aoLag) en `universe.ts` se calculan con la definición **estricta** (`signals.ts` o `signals-s2.ts`). El scanner de producción reporta **toda la ventana de observación**, no solo el gatillo. Por eso tickers como TMUS/BKNG/HSY/LMT/RTX aparecen como "Still S1, Holding" semana tras semana — están dentro de la ventana, no re-disparando entrada.

**No mezclar:** si en el futuro alguien quisiera medir performance "en vivo" tratando cada semana etiquetada como S1 en el scanner como una entrada nueva, los números divergirían del backtest porque estaría contando semanas de continuación. La asimetría es intencional (anclada en tag `pre-jarvis-universe-2026-04-25`).

**Umbrales relacionados** (definidos en `src/scanner.ts`):

- `NEAR_LOWS_PCT = 30` — el campo `nearLows` marca tickers en el bottom 30% del rango de 104 semanas. Este es el umbral citado como "structural lows" en el Journal.
- `RANGING_THRESHOLD = 0.15` — un ticker se considera lateralizando si `(max12 − min12) / avg12 < 15%`. Filtra señales en mercados sin convicción.
- Pre-Radar (Journal) usa un umbral **distinto** de `pricePercentile ≤ 15` aplicado solo a tickers con `signalLevel === "none"`.

---

## 2026-W17

**Run:** 2026-04-24 (manual — sesión de construcción Fase 3)
**Escaneados:** 79 | **S2:** 0 | **S1:** 17

### NIVEL 2 — ATENCIÓN (S2)

Sin señales S2 activas esta semana.

### NIVEL 1 — OBSERVACIÓN (S1)

| Ticker | Sector | T   | HR%   | Wks | Señal      |
| ------ | ------ | --- | ----- | --- | ---------- |
| PG     | XLP    | 1   | 65.4% | 1   | 2026-04-17 |
| CLX    | XLP    | 2   | —     | 1   | 2026-04-17 |
| GIS    | XLP    | 2   | —     | 1   | 2026-04-17 |
| SYY    | XLP    | 2   | —     | 1   | 2026-04-17 |
| KMB    | XLP    | 2   | —     | 1   | 2026-04-17 |
| MDLZ   | XLP    | 2   | —     | 1   | 2026-04-17 |
| NEE    | XLU    | 1   | 77.1% | 3   | 2026-04-03 |
| ED     | XLU    | 1   | 76.4% | 2   | 2026-04-10 |
| WEC    | XLU    | 1   | 80.4% | 4   | 2026-03-27 |
| DUK    | XLU    | 1   | 79.2% | 4   | 2026-03-27 |
| AEE    | XLU    | 1   | 78.0% | 4   | 2026-03-27 |
| XEL    | XLU    | 2   | —     | 3   | 2026-04-03 |
| LNT    | XLU    | 2   | —     | 2   | 2026-04-10 |
| EIX    | XLU    | 2   | —     | 2   | 2026-04-10 |
| NOC    | XLI    | 2   | —     | 1   | 2026-04-17 |
| RTX    | XLI    | 2   | —     | 1   | 2026-04-17 |
| UPS    | XLI    | 2   | —     | 1   | 2026-04-17 |

**Nota:** PG es el ticker de mayor calidad activo (Tier 1, señal nueva esta semana).
XLP en corrección amplia — múltiples S1 simultáneos son señal de sector, no de tickers individuales.

---

## 2026-W18

**Run:** 2026-05-02T00:06:02.732Z
**Escaneados:** 254 | **S2:** 0 | **S2D:** 7 | **S1:** 23

### S2 DEGRADADA — POTENCIAL (movimiento adelantado)

| Ticker | Sector | T   | HR%   | AO      | AC    | Price% | Señal      |
| ------ | ------ | --- | ----- | ------- | ----- | ------ | ---------- |
| PG     | XLP    | 1   | 65.4% | -3.573  | 1.067 | 23%    | 2026-05-01 |
| CTAS   | XLI    | 2   | —%    | -13.069 | 0.743 | 6%     | 2026-05-01 |
| HD     | XLY    | 2   | —%    | -32.712 | 3.298 | 13%    | 2026-05-01 |
| LEN    | XLY    | 2   | —%    | -22.537 | 1.340 | 3%     | 2026-05-01 |
| CVS    | XLV    | 2   | —%    | -0.888  | 1.437 | 99%    | 2026-05-01 |
| F      | XLY    | 2   | —%    | -0.730  | 0.131 | 60%    | 2026-05-01 |
| EXR    | XLRE   | 2   | —%    | -0.358  | 1.827 | 37%    | 2026-05-01 |

### NIVEL 1 — OBSERVACIÓN (S1)

| Ticker | Sector | T   | HR% | Price% | Señal      |
| ------ | ------ | --- | --- | ------ | ---------- |
| CLX    | XLP    | 2   | —%  | 0%     | 2026-05-01 |
| GIS    | XLP    | 2   | —%  | 0%     | 2026-05-01 |
| HRL    | XLP    | 2   | —%  | 6%     | 2026-05-01 |
| MDT    | XLV    | 2   | —%  | 22%    | 2026-05-01 |
| ABT    | XLV    | 2   | —%  | 0%     | 2026-05-01 |
| SYK    | XLV    | 2   | —%  | 0%     | 2026-05-01 |
| MOS    | XLB    | 2   | —%  | 3%     | 2026-05-01 |
| NKE    | XLY    | 2   | —%  | 4%     | 2026-05-01 |
| CRM    | XLK    | 2   | —%  | 10%    | 2026-05-01 |
| OMC    | XLC    | 2   | —%  | 30%    | 2026-05-01 |
| GE     | XLI    | 2   | —%  | 70%    | 2026-05-01 |
| HSY    | XLP    | 2   | —%  | 42%    | 2026-05-01 |
| PM     | XLP    | 2   | —%  | 79%    | 2026-05-01 |
| SYY    | XLP    | 2   | —%  | 32%    | 2026-05-01 |
| LLY    | XLV    | 2   | —%  | 75%    | 2026-05-01 |
| BDX    | XLV    | 2   | —%  | 34%    | 2026-05-01 |
| ECL    | XLB    | 2   | —%  | 41%    | 2026-05-01 |
| TSLA   | XLY    | 2   | —%  | 71%    | 2026-05-01 |
| MCD    | XLY    | 2   | —%  | 46%    | 2026-05-01 |
| TMUS   | XLC    | 2   | —%  | 35%    | 2026-05-01 |
| TKO    | XLC    | 2   | —%  | 70%    | 2026-05-01 |
| VRTX   | IBB    | 2   | —%  | 38%    | 2026-05-01 |
| IONS   | IBB    | 2   | —%  | 81%    | 2026-05-01 |

---

## 2026-W19

**Run:** 2026-05-09T00:06:02.047Z
**Escaneados:** 254 | **S2:** 0 | **S2D:** 4 | **S1:** 15

### S2 DEGRADADA — POTENCIAL (movimiento adelantado)

| Ticker | Sector | T   | HR% | AO      | AC    | Price% | Señal      |
| ------ | ------ | --- | --- | ------- | ----- | ------ | ---------- |
| GIS    | XLP    | 2   | —%  | -8.832  | 0.087 | 0%     | 2026-05-08 |
| CRM    | XLK    | 2   | —%  | -42.414 | 0.760 | 9%     | 2026-05-08 |
| PM     | XLP    | 2   | —%  | -0.028  | 1.690 | 84%    | 2026-05-08 |
| TSLA   | XLY    | 2   | —%  | -38.082 | 3.837 | 83%    | 2026-05-08 |

### NIVEL 1 — OBSERVACIÓN (S1)

| Ticker | Sector | T   | HR% | Price% | Señal      |
| ------ | ------ | --- | --- | ------ | ---------- |
| HRL    | XLP    | 2   | —%  | 0%     | 2026-05-08 |
| SYY    | XLP    | 2   | —%  | 25%    | 2026-05-08 |
| BSX    | XLV    | 2   | —%  | 0%     | 2026-05-08 |
| NKE    | XLY    | 2   | —%  | 3%     | 2026-05-08 |
| GE     | XLI    | 2   | —%  | 76%    | 2026-05-08 |
| HSY    | XLP    | 2   | —%  | 46%    | 2026-05-08 |
| LLY    | XLV    | 2   | —%  | 71%    | 2026-05-08 |
| BDX    | XLV    | 2   | —%  | 35%    | 2026-05-08 |
| ECL    | XLB    | 2   | —%  | 34%    | 2026-05-08 |
| BKNG   | XLY    | 2   | —%  | 36%    | 2026-05-08 |
| PLTR   | XLK    | 2   | —%  | 65%    | 2026-05-08 |
| TMUS   | XLC    | 2   | —%  | 32%    | 2026-05-08 |
| TKO    | XLC    | 2   | —%  | 70%    | 2026-05-08 |
| VRTX   | IBB    | 2   | —%  | 42%    | 2026-05-08 |
| IONS   | IBB    | 2   | —%  | 82%    | 2026-05-08 |

---

## 2026-W20

**Run:** 2026-05-16T00:06:11.819Z
**Escaneados:** 254 | **S2:** 1 | **S2D:** 2 | **S1:** 9

### S2 PURA — ATENCIÓN (entrada limpia)

| Ticker | Sector | T   | HR% | AO     | AC    | Price% | Señal      |
| ------ | ------ | --- | --- | ------ | ----- | ------ | ---------- |
| SYY    | XLP    | 2   | —%  | -3.810 | 0.119 | 26%    | 2026-05-15 |

**Reddit (Xpoz):**

- 🔥 `SYY` HIGH (25 posts) — "AI Booms &amp; Big Oil Surges: AMD targets $330 while EVs &a…"
- 🔥 `NKE` HIGH (25 posts) — "Are we sure this isn’t a crazy buying opportunity for $NKE?"
- 🔥 `LLY` HIGH (25 posts) — "That 12% Spike Wasn’t Random - People Just Weren’t Paying At…"

### S2 DEGRADADA — POTENCIAL (movimiento adelantado)

| Ticker | Sector | T   | HR% | AO      | AC    | Price% | Señal      |
| ------ | ------ | --- | --- | ------- | ----- | ------ | ---------- |
| NKE    | XLY    | 2   | —%  | -15.436 | 0.173 | 0%     | 2026-05-15 |
| LLY    | XLV    | 2   | —%  | -29.749 | 0.119 | 84%    | 2026-05-15 |

### NIVEL 1 — OBSERVACIÓN (S1)

| Ticker | Sector | T   | HR%   | Price% | Señal      |
| ------ | ------ | --- | ----- | ------ | ---------- |
| HRL    | XLP    | 2   | —%    | 0%     | 2026-05-15 |
| BKNG   | XLY    | 2   | —%    | 24%    | 2026-05-15 |
| TMUS   | XLC    | 2   | —%    | 23%    | 2026-05-15 |
| LMT    | XLI    | 1   | 66.7% | 41%    | 2026-05-15 |
| RTX    | XLI    | 2   | —%    | 66%    | 2026-05-15 |
| HSY    | XLP    | 2   | —%    | 48%    | 2026-05-15 |
| PLTR   | XLK    | 2   | —%    | 63%    | 2026-05-15 |
| TKO    | XLC    | 2   | —%    | 73%    | 2026-05-15 |
| VRTX   | IBB    | 2   | —%    | 47%    | 2026-05-15 |

---

## 2026-W21

**Run:** 2026-05-23T00:05:57.433Z
**Escaneados:** 254 | **S2:** 0 | **S2D:** 1 | **S1:** 12

### S2 DEGRADADA — POTENCIAL (movimiento adelantado)

| Ticker | Sector | T   | HR% | AO      | AC    | Price% | Señal      |
| ------ | ------ | --- | --- | ------- | ----- | ------ | ---------- |
| PLTR   | XLK    | 2   | —%  | -21.846 | 0.157 | 64%    | 2026-05-22 |

### NIVEL 1 — OBSERVACIÓN (S1)

| Ticker | Sector | T   | HR%   | Price% | Señal      |
| ------ | ------ | --- | ----- | ------ | ---------- |
| CLX    | XLP    | 2   | —%    | 11%    | 2026-05-22 |
| ABT    | XLV    | 2   | —%    | 6%     | 2026-05-22 |
| BSX    | XLV    | 2   | —%    | 9%     | 2026-05-22 |
| MOS    | XLB    | 2   | —%    | 7%     | 2026-05-22 |
| TMUS   | XLC    | 2   | —%    | 22%    | 2026-05-22 |
| LMT    | XLI    | 1   | 66.7% | 47%    | 2026-05-22 |
| NOC    | XLI    | 2   | —%    | 42%    | 2026-05-22 |
| RTX    | XLI    | 2   | —%    | 72%    | 2026-05-22 |
| HSY    | XLP    | 2   | —%    | 57%    | 2026-05-22 |
| BKNG   | XLY    | 2   | —%    | 31%    | 2026-05-22 |
| IBM    | XLK    | 2   | —%    | 65%    | 2026-05-22 |
| T      | XLC    | 2   | —%    | 72%    | 2026-05-22 |

---
## 2026-W22

**Run:** 2026-05-30T00:06:23.055Z
**Escaneados:** 254 | **S2:** 0 | **S2D:** 4 | **S1:** 12

### S2 DEGRADADA — POTENCIAL (movimiento adelantado)
| Ticker | Sector | T | HR% | AO | AC | Price% | Señal |
|--------|--------|---|-----|-----|-----|--------|-------|
| TMUS | XLC | 2 | —% | -13.119 | 0.304 | 19% | 2026-05-29 |
| HRL | XLP | 2 | —% | -1.878 | 0.141 | 32% | 2026-05-29 |
| BKNG | XLY | 2 | —% | -3591.744 | 145.156 | 38% | 2026-05-29 |
| IBM | XLK | 2 | —% | -35.517 | 4.465 | 95% | 2026-05-29 |

### NIVEL 1 — OBSERVACIÓN (S1)
| Ticker | Sector | T | HR% | Price% | Señal |
|--------|--------|---|-----|--------|-------|
| CLX | XLP | 2 | —% | 4% | 2026-05-29 |
| MDT | XLV | 2 | —% | 1% | 2026-05-29 |
| ABT | XLV | 2 | —% | 3% | 2026-05-29 |
| SYK | XLV | 2 | —% | 17% | 2026-05-29 |
| MOS | XLB | 2 | —% | 16% | 2026-05-29 |
| LMT | XLI | 1 | 66.7% | 46% | 2026-05-29 |
| NOC | XLI | 2 | —% | 44% | 2026-05-29 |
| RTX | XLI | 2 | —% | 74% | 2026-05-29 |
| HSY | XLP | 2 | —% | 56% | 2026-05-29 |
| T | XLC | 2 | —% | 69% | 2026-05-29 |
| INSM | IBB | 2 | —% | 33% | 2026-05-29 |
| NTRA | IBB | 2 | —% | 85% | 2026-05-29 |

---

## 2026-W23

**Run:** 2026-06-06T03:52:15.769Z
**Escaneados:** 388 | **S2:** 0 | **S2D:** 5 | **S1:** 29

### S2 DEGRADADA — POTENCIAL (movimiento adelantado)
| Ticker | Sector | T | HR% | AO | AC | Price% | Señal |
|--------|--------|---|-----|-----|-----|--------|-------|
| MOS | XLB | 2 | —% | -3.218 | 0.089 | 5% | 2026-06-05 |
| RXRX | XBI | 2 | —% | -0.802 | 0.063 | 5% | 2026-06-05 |
| AGIO | XBI | 2 | —% | -2.501 | 0.383 | 10% | 2026-06-05 |
| HSY | XLP | 2 | —% | -6.116 | 0.169 | 46% | 2026-06-05 |
| NTRA | IBB | 2 | —% | -5.954 | 0.399 | 80% | 2026-06-05 |

### NIVEL 1 — OBSERVACIÓN (S1)
| Ticker | Sector | T | HR% | Price% | Señal |
|--------|--------|---|-----|--------|-------|
| XYL | XLI | 2 | —% | 15% | 2026-06-05 |
| IR | XLI | 2 | —% | 8% | 2026-06-05 |
| CLX | XLP | 2 | —% | 10% | 2026-06-05 |
| CAG | XLP | 2 | —% | 0% | 2026-06-05 |
| MDT | XLV | 2 | —% | 27% | 2026-06-05 |
| ABT | XLV | 2 | —% | 13% | 2026-06-05 |
| SYK | XLV | 2 | —% | 18% | 2026-06-05 |
| COO | XLV | 2 | —% | 15% | 2026-06-05 |
| RPM | XLB | 2 | —% | 29% | 2026-06-05 |
| HD | XLY | 2 | —% | 13% | 2026-06-05 |
| NCLH | XLY | 2 | —% | 25% | 2026-06-05 |
| CHTR | XLC | 2 | —% | 0% | 2026-06-05 |
| INSM | IBB | 2 | —% | 21% | 2026-06-05 |
| PCVX | XBI | 2 | —% | 20% | 2026-06-05 |
| VKTX | XBI | 2 | —% | 11% | 2026-06-05 |
| LMT | XLI | 1 | 66.7% | 45% | 2026-06-05 |
| NRG | XLU | 2 | —% | 55% | 2026-06-05 |
| EMR | XLI | 2 | —% | 72% | 2026-06-05 |
| NOC | XLI | 2 | —% | 38% | 2026-06-05 |
| PH | XLI | 2 | —% | 74% | 2026-06-05 |
| RTX | XLI | 2 | —% | 75% | 2026-06-05 |
| UPS | XLI | 2 | —% | 60% | 2026-06-05 |
| MTD | XLV | 2 | —% | 31% | 2026-06-05 |
| MLM | XLB | 2 | —% | 51% | 2026-06-05 |
| CCL | XLY | 2 | —% | 67% | 2026-06-05 |
| LVS | XLY | 2 | —% | 53% | 2026-06-05 |
| EXPE | XLY | 2 | —% | 63% | 2026-06-05 |
| APH | XLK | 2 | —% | 84% | 2026-06-05 |
| SMMT | XBI | 2 | —% | 30% | 2026-06-05 |

---

## 2026-W24

**Run:** 2026-06-13T00:10:09.802Z
**Escaneados:** 388 | **S2:** 0 | **S2D:** 8 | **S1:** 37

### S2 DEGRADADA — POTENCIAL (movimiento adelantado)
| Ticker | Sector | T | HR% | AO | AC | Price% | Señal |
|--------|--------|---|-----|-----|-----|--------|-------|
| CLX | XLP | 2 | —% | -11.821 | 1.837 | 13% | 2026-06-12 |
| MDT | XLV | 2 | —% | -13.994 | 0.033 | 22% | 2026-06-12 |
| ABT | XLV | 2 | —% | -23.246 | 1.539 | 8% | 2026-06-12 |
| SYK | XLV | 2 | —% | -41.241 | 1.439 | 23% | 2026-06-12 |
| COO | XLV | 2 | —% | -11.259 | 0.484 | 16% | 2026-06-12 |
| RTX | XLI | 2 | —% | -9.800 | 0.803 | 77% | 2026-06-12 |
| CCL | XLY | 2 | —% | -1.520 | 0.221 | 77% | 2026-06-12 |
| NCLH | XLY | 2 | —% | -2.978 | 0.244 | 30% | 2026-06-12 |

### NIVEL 1 — OBSERVACIÓN (S1)
| Ticker | Sector | T | HR% | Price% | Señal |
|--------|--------|---|-----|--------|-------|
| XYL | XLI | 2 | —% | 15% | 2026-06-12 |
| IR | XLI | 2 | —% | 13% | 2026-06-12 |
| CAG | XLP | 2 | —% | 5% | 2026-06-12 |
| STZ | XLP | 2 | —% | 18% | 2026-06-12 |
| BSX | XLV | 2 | —% | 0% | 2026-06-12 |
| ZTS | XLV | 2 | —% | 5% | 2026-06-12 |
| ISRG | XLV | 2 | —% | 0% | 2026-06-12 |
| MTD | XLV | 2 | —% | 26% | 2026-06-12 |
| FMC | XLB | 2 | —% | 0% | 2026-06-12 |
| HD | XLY | 2 | —% | 28% | 2026-06-12 |
| LOW | XLY | 2 | —% | 19% | 2026-06-12 |
| CMG | XLY | 2 | —% | 8% | 2026-06-12 |
| CMCSA | XLC | 2 | —% | 10% | 2026-06-12 |
| CHTR | XLC | 2 | —% | 5% | 2026-06-12 |
| REGN | IBB | 2 | —% | 18% | 2026-06-12 |
| INSM | IBB | 2 | —% | 23% | 2026-06-12 |
| XNCR | IBB | 2 | —% | 28% | 2026-06-12 |
| SMMT | XBI | 2 | —% | 27% | 2026-06-12 |
| PCVX | XBI | 2 | —% | 20% | 2026-06-12 |
| VKTX | XBI | 2 | —% | 12% | 2026-06-12 |
| LMT | XLI | 1 | 66.7% | 51% | 2026-06-12 |
| NRG | XLU | 2 | —% | 52% | 2026-06-12 |
| SR | XLU | 2 | —% | 64% | 2026-06-12 |
| NOC | XLI | 2 | —% | 40% | 2026-06-12 |
| PH | XLI | 2 | —% | 78% | 2026-06-12 |
| HUBB | XLI | 2 | —% | 69% | 2026-06-12 |
| KR | XLP | 2 | —% | 62% | 2026-06-12 |
| BAC | XLF | 2 | —% | 100% | 2026-06-12 |
| TFC | XLF | 2 | —% | 86% | 2026-06-12 |
| MLM | XLB | 2 | —% | 52% | 2026-06-12 |
| BALL | XLB | 2 | —% | 52% | 2026-06-12 |
| DHI | XLY | 2 | —% | 50% | 2026-06-12 |
| LVS | XLY | 2 | —% | 54% | 2026-06-12 |
| EXPE | XLY | 2 | —% | 61% | 2026-06-12 |
| APH | XLK | 2 | —% | 100% | 2026-06-12 |
| CBRE | XLRE | 2 | —% | 55% | 2026-06-12 |
| BBIO | IBB | 2 | —% | 79% | 2026-06-12 |

---

## 2026-W25

**Run:** 2026-06-20T00:10:22.036Z
**Escaneados:** 388 | **S2:** 0 | **S2D:** 9 | **S1:** 31

### S2 DEGRADADA — POTENCIAL (movimiento adelantado)
| Ticker | Sector | T | HR% | AO | AC | Price% | Señal |
|--------|--------|---|-----|-----|-----|--------|-------|
| XYL | XLI | 2 | —% | -19.428 | 0.042 | 18% | 2026-06-18 |
| CAG | XLP | 2 | —% | -3.007 | 0.018 | 1% | 2026-06-18 |
| FMC | XLB | 2 | —% | -2.084 | 0.159 | 0% | 2026-06-18 |
| RARE | IBB | 2 | —% | -2.227 | 0.022 | 20% | 2026-06-18 |
| LMT | XLI | 1 | 66.7% | -25.540 | 1.649 | 40% | 2026-06-18 |
| FE | XLU | 2 | —% | -1.205 | 0.202 | 71% | 2026-06-18 |
| HD | XLY | 2 | —% | -31.947 | 5.775 | 33% | 2026-06-18 |
| DHI | XLY | 2 | —% | -1.420 | 1.974 | 55% | 2026-06-18 |
| DASH | XLC | 2 | —% | -29.853 | 3.252 | 41% | 2026-06-18 |

### NIVEL 1 — OBSERVACIÓN (S1)
| Ticker | Sector | T | HR% | Price% | Señal |
|--------|--------|---|-----|--------|-------|
| IR | XLI | 2 | —% | 24% | 2026-06-18 |
| STZ | XLP | 2 | —% | 12% | 2026-06-18 |
| BSX | XLV | 2 | —% | 0% | 2026-06-18 |
| ZTS | XLV | 2 | —% | 4% | 2026-06-18 |
| ISRG | XLV | 2 | —% | 0% | 2026-06-18 |
| MTD | XLV | 2 | —% | 29% | 2026-06-18 |
| LOW | XLY | 2 | —% | 20% | 2026-06-18 |
| AZO | XLY | 2 | —% | 17% | 2026-06-18 |
| CMG | XLY | 2 | —% | 9% | 2026-06-18 |
| CMCSA | XLC | 2 | —% | 0% | 2026-06-18 |
| CHTR | XLC | 2 | —% | 0% | 2026-06-18 |
| ZG | XLC | 2 | —% | 1% | 2026-06-18 |
| REGN | IBB | 2 | —% | 17% | 2026-06-18 |
| INSM | IBB | 2 | —% | 22% | 2026-06-18 |
| SMMT | XBI | 2 | —% | 26% | 2026-06-18 |
| PCVX | XBI | 2 | —% | 25% | 2026-06-18 |
| VKTX | XBI | 2 | —% | 15% | 2026-06-18 |
| SRPT | XBI | 2 | —% | 4% | 2026-06-18 |
| NRG | XLU | 2 | —% | 61% | 2026-06-18 |
| SR | XLU | 2 | —% | 57% | 2026-06-18 |
| NOC | XLI | 2 | —% | 31% | 2026-06-18 |
| PH | XLI | 2 | —% | 87% | 2026-06-18 |
| HUBB | XLI | 2 | —% | 88% | 2026-06-18 |
| NEM | XLB | 2 | —% | 72% | 2026-06-18 |
| MLM | XLB | 2 | —% | 66% | 2026-06-18 |
| BALL | XLB | 2 | —% | 55% | 2026-06-18 |
| LVS | XLY | 2 | —% | 48% | 2026-06-18 |
| EXPE | XLY | 2 | —% | 70% | 2026-06-18 |
| META | XLC | 2 | —% | 36% | 2026-06-18 |
| CBRE | XLRE | 2 | —% | 53% | 2026-06-18 |
| BBIO | IBB | 2 | —% | 78% | 2026-06-18 |

---

## 2026-W26

**Run:** 2026-06-27T00:11:05.332Z
**Escaneados:** 388 | **S2:** 1 | **S2D:** 11 | **S1:** 17

### S2 PURA — ATENCIÓN (entrada limpia)
| Ticker | Sector | T | HR% | AO | AC | Price% | Señal |
|--------|--------|---|-----|-----|-----|--------|-------|
| CMG | XLY | 2 | —% | -3.104 | 0.012 | 11% | 2026-06-26 |

**Reddit (Xpoz):**
- 🔥 `CMG` HIGH (25 posts) — "������ Top Gainers &amp; Losers to Watch | Feb 04 (Wed)"
- 🔥 `ZTS` HIGH (25 posts) — "ZOETIS (ZTS)"
- 🔥 `VKTX` HIGH (25 posts) — "These are the Gappers Watchlist for 1/14������"
- 🔥 `NRG` HIGH (25 posts) — "VCT 2026 — Masters Santiago / Playoffs — Day 4 / Live Discus…"
- 🔥 `PH` HIGH (25 posts) — "Cleaning rates"
- 🔥 `IR` HIGH (25 posts) — "KIBERNETINIO SAUGUMO RADAR - 2026-06-21"
- 🔥 `MTD` HIGH (25 posts) — "Final declarations are replacing self-assessment in 2026 - h…"
- 🔥 `MLM` HIGH (25 posts) — "[Seeking] Operations Manager / Program Manager / Program Coo…"
- 🔥 `EXPE` HIGH (25 posts) — "Understanding the Structural Tightness of This Float"
- 🔥 `CBRE` HIGH (25 posts) — "These 13 stocks could surge on upbeat results this earnings …"
- 🔥 `XNCR` HIGH (25 posts) — "EverHint – Momentum Swing — Breakout Standard for Apr 08, 20…"
- 🔥 `ACAD` HIGH (25 posts) — "Unraveling the lek paradox - why sexual selection does not d…"

### S2 DEGRADADA — POTENCIAL (movimiento adelantado)
| Ticker | Sector | T | HR% | AO | AC | Price% | Señal |
|--------|--------|---|-----|-----|-----|--------|-------|
| ZTS | XLV | 2 | —% | -33.729 | 1.107 | 2% | 2026-06-26 |
| VKTX | XBI | 2 | —% | -2.145 | 0.680 | 28% | 2026-06-26 |
| NRG | XLU | 2 | —% | -19.658 | 1.110 | 73% | 2026-06-26 |
| PH | XLI | 2 | —% | -12.551 | 14.138 | 90% | 2026-06-26 |
| IR | XLI | 2 | —% | -7.324 | 1.439 | 34% | 2026-06-26 |
| MTD | XLV | 2 | —% | -152.592 | 30.974 | 54% | 2026-06-26 |
| MLM | XLB | 2 | —% | -31.152 | 12.177 | 69% | 2026-06-26 |
| EXPE | XLY | 2 | —% | -14.179 | 4.591 | 82% | 2026-06-26 |
| CBRE | XLRE | 2 | —% | -16.693 | 0.123 | 59% | 2026-06-26 |
| XNCR | IBB | 2 | —% | -0.914 | 0.492 | 43% | 2026-06-26 |
| ACAD | XBI | 2 | —% | -1.500 | 0.343 | 83% | 2026-06-26 |

### NIVEL 1 — OBSERVACIÓN (S1)
| Ticker | Sector | T | HR% | Price% | Señal |
|--------|--------|---|-----|--------|-------|
| STZ | XLP | 2 | —% | 17% | 2026-06-26 |
| ISRG | XLV | 2 | —% | 0% | 2026-06-26 |
| LOW | XLY | 2 | —% | 21% | 2026-06-26 |
| AZO | XLY | 2 | —% | 21% | 2026-06-26 |
| CMCSA | XLC | 2 | —% | 5% | 2026-06-26 |
| CHTR | XLC | 2 | —% | 2% | 2026-06-26 |
| ZG | XLC | 2 | —% | 0% | 2026-06-26 |
| REGN | IBB | 2 | —% | 21% | 2026-06-26 |
| INSM | IBB | 2 | —% | 27% | 2026-06-26 |
| SMMT | XBI | 2 | —% | 27% | 2026-06-26 |
| SRPT | XBI | 2 | —% | 4% | 2026-06-26 |
| SR | XLU | 2 | —% | 67% | 2026-06-26 |
| BALL | XLB | 2 | —% | 75% | 2026-06-26 |
| LVS | XLY | 2 | —% | 44% | 2026-06-26 |
| ONC | IBB | 2 | —% | 61% | 2026-06-26 |
| BBIO | IBB | 2 | —% | 85% | 2026-06-26 |
| PCVX | XBI | 2 | —% | 31% | 2026-06-26 |

---

## 2026-W27

**Run:** 2026-07-04T00:10:21.272Z
**Escaneados:** 388 | **S2:** 0 | **S2D:** 5 | **S1:** 16

### S2 DEGRADADA — POTENCIAL (movimiento adelantado)
| Ticker | Sector | T | HR% | AO | AC | Price% | Señal |
|--------|--------|---|-----|-----|-----|--------|-------|
| LOW | XLY | 2 | —% | -25.128 | 1.890 | 24% | 2026-07-02 |
| CHTR | XLC | 2 | —% | -55.927 | 2.687 | 4% | 2026-07-02 |
| INSM | IBB | 2 | —% | -49.084 | 1.467 | 33% | 2026-07-02 |
| BBIO | IBB | 2 | —% | -2.727 | 0.671 | 98% | 2026-07-02 |
| PCVX | XBI | 2 | —% | -1.022 | 0.618 | 33% | 2026-07-02 |

### NIVEL 1 — OBSERVACIÓN (S1)
| Ticker | Sector | T | HR% | Price% | Señal |
|--------|--------|---|-----|--------|-------|
| STZ | XLP | 2 | —% | 9% | 2026-07-02 |
| BSX | XLV | 2 | —% | 1% | 2026-07-02 |
| ISRG | XLV | 2 | —% | 11% | 2026-07-02 |
| AZO | XLY | 2 | —% | 17% | 2026-07-02 |
| CMCSA | XLC | 2 | —% | 12% | 2026-07-02 |
| ZG | XLC | 2 | —% | 4% | 2026-07-02 |
| REGN | IBB | 2 | —% | 24% | 2026-07-02 |
| SMMT | XBI | 2 | —% | 29% | 2026-07-02 |
| SRPT | XBI | 2 | —% | 5% | 2026-07-02 |
| SR | XLU | 2 | —% | 62% | 2026-07-02 |
| TSN | XLP | 2 | —% | 50% | 2026-07-02 |
| WMT | XLP | 2 | —% | 68% | 2026-07-02 |
| RRC | XLE | 2 | —% | 51% | 2026-07-02 |
| AR | XLE | 2 | —% | 50% | 2026-07-02 |
| ONC | IBB | 2 | —% | 68% | 2026-07-02 |
| PRAX | XBI | 2 | —% | 90% | 2026-07-02 |

---

## 2026-W28

**Run:** 2026-07-11T00:10:47.931Z
**Escaneados:** 388 | **S2:** 0 | **S2D:** 7 | **S1:** 19

### S2 DEGRADADA — POTENCIAL (movimiento adelantado)
| Ticker | Sector | T | HR% | AO | AC | Price% | Señal |
|--------|--------|---|-----|-----|-----|--------|-------|
| BSX | XLV | 2 | —% | -26.464 | 0.465 | 1% | 2026-07-10 |
| ISRG | XLV | 2 | —% | -73.892 | 4.222 | 1% | 2026-07-10 |
| AZO | XLY | 2 | —% | -374.341 | 13.067 | 10% | 2026-07-10 |
| ZG | XLC | 2 | —% | -17.427 | 0.372 | 2% | 2026-07-10 |
| REGN | IBB | 2 | —% | -96.286 | 3.066 | 25% | 2026-07-10 |
| SRPT | XBI | 2 | —% | -2.104 | 0.537 | 5% | 2026-07-10 |
| ONC | IBB | 2 | —% | -31.494 | 2.143 | 68% | 2026-07-10 |

### NIVEL 1 — OBSERVACIÓN (S1)
| Ticker | Sector | T | HR% | Price% | Señal |
|--------|--------|---|-----|--------|-------|
| ICE | XLF | 2 | —% | 19% | 2026-07-10 |
| CMCSA | XLC | 2 | —% | 10% | 2026-07-10 |
| SMMT | XBI | 2 | —% | 28% | 2026-07-10 |
| SR | XLU | 2 | —% | 64% | 2026-07-10 |
| FDX | XLI | 2 | —% | 70% | 2026-07-10 |
| TSN | XLP | 2 | —% | 44% | 2026-07-10 |
| WMT | XLP | 2 | —% | 71% | 2026-07-10 |
| KR | XLP | 2 | —% | 42% | 2026-07-10 |
| RRC | XLE | 2 | —% | 39% | 2026-07-10 |
| AR | XLE | 2 | —% | 39% | 2026-07-10 |
| CME | XLF | 2 | —% | 45% | 2026-07-10 |
| NEM | XLB | 2 | —% | 63% | 2026-07-10 |
| DOW | XLB | 2 | —% | 31% | 2026-07-10 |
| LYB | XLB | 2 | —% | 34% | 2026-07-10 |
| ALB | XLB | 2 | —% | 49% | 2026-07-10 |
| META | XLC | 2 | —% | 65% | 2026-07-10 |
| T | XLC | 2 | —% | 34% | 2026-07-10 |
| SBAC | XLRE | 2 | —% | 33% | 2026-07-10 |
| PRAX | XBI | 2 | —% | 92% | 2026-07-10 |

---

## 2026-W29

**Run:** 2026-07-18T01:24:57.045Z
**Escaneados:** 388 | **S2:** 0 | **S2D:** 4 | **S1:** 29

### S2 DEGRADADA — POTENCIAL (movimiento adelantado)
| Ticker | Sector | T | HR% | AO | AC | Price% | Señal |
|--------|--------|---|-----|-----|-----|--------|-------|
| NOW | XLK | 2 | —% | -14.661 | 1.089 | 20% | 2026-07-17 |
| CMCSA | XLC | 2 | —% | -3.879 | 0.020 | 7% | 2026-07-17 |
| SMMT | XBI | 2 | —% | -2.207 | 0.093 | 23% | 2026-07-17 |
| META | XLC | 2 | —% | -25.706 | 10.724 | 60% | 2026-07-17 |

### NIVEL 1 — OBSERVACIÓN (S1)
| Ticker | Sector | T | HR% | Price% | Señal |
|--------|--------|---|-----|--------|-------|
| ICE | XLF | 2 | —% | 22% | 2026-07-17 |
| DOW | XLB | 2 | —% | 28% | 2026-07-17 |
| LYB | XLB | 2 | —% | 27% | 2026-07-17 |
| FMC | XLB | 2 | —% | 0% | 2026-07-17 |
| OLN | XLB | 2 | —% | 9% | 2026-07-17 |
| MSFT | XLK | 2 | —% | 20% | 2026-07-17 |
| CRM | XLK | 2 | —% | 9% | 2026-07-17 |
| SNPS | XLK | 2 | —% | 22% | 2026-07-17 |
| NFLX | XLC | 2 | —% | 18% | 2026-07-17 |
| T | XLC | 2 | —% | 24% | 2026-07-17 |
| SNAP | XLC | 2 | —% | 8% | 2026-07-17 |
| SBAC | XLRE | 2 | —% | 25% | 2026-07-17 |
| SR | XLU | 2 | —% | 62% | 2026-07-17 |
| FDX | XLI | 2 | —% | 52% | 2026-07-17 |
| TSN | XLP | 2 | —% | 38% | 2026-07-17 |
| WMT | XLP | 2 | —% | 71% | 2026-07-17 |
| KR | XLP | 2 | —% | 31% | 2026-07-17 |
| BKR | XLE | 2 | —% | 68% | 2026-07-17 |
| COP | XLE | 2 | —% | 57% | 2026-07-17 |
| HAL | XLE | 2 | —% | 70% | 2026-07-17 |
| SLB | XLE | 2 | —% | 61% | 2026-07-17 |
| DVN | XLE | 2 | —% | 65% | 2026-07-17 |
| RRC | XLE | 2 | —% | 41% | 2026-07-17 |
| AR | XLE | 2 | —% | 45% | 2026-07-17 |
| CME | XLF | 2 | —% | 38% | 2026-07-17 |
| NEM | XLB | 2 | —% | 60% | 2026-07-17 |
| ALB | XLB | 2 | —% | 48% | 2026-07-17 |
| PLTR | XLK | 2 | —% | 60% | 2026-07-17 |
| FOXA | XLC | 2 | —% | 50% | 2026-07-17 |

---

## 2026-W30

**Run:** 2026-07-25T01:24:51.736Z
**Escaneados:** 388 | **S2:** 0 | **S2D:** 4 | **S1:** 26

### S2 DEGRADADA — POTENCIAL (movimiento adelantado)
| Ticker | Sector | T | HR% | AO | AC | Price% | Señal |
|--------|--------|---|-----|-----|-----|--------|-------|
| CRM | XLK | 2 | —% | -35.222 | 1.555 | 10% | 2026-07-24 |
| TSN | XLP | 2 | —% | -3.388 | 0.033 | 39% | 2026-07-24 |
| PLTR | XLK | 2 | —% | -21.377 | 0.258 | 63% | 2026-07-24 |
| SPOT | XLC | 2 | —% | -28.953 | 4.981 | 38% | 2026-07-24 |

### NIVEL 1 — OBSERVACIÓN (S1)
| Ticker | Sector | T | HR% | Price% | Señal |
|--------|--------|---|-----|--------|-------|
| KR | XLP | 2 | —% | 27% | 2026-07-24 |
| ICE | XLF | 2 | —% | 28% | 2026-07-24 |
| DOW | XLB | 2 | —% | 28% | 2026-07-24 |
| FMC | XLB | 2 | —% | 1% | 2026-07-24 |
| OLN | XLB | 2 | —% | 13% | 2026-07-24 |
| HUN | XLB | 2 | —% | 24% | 2026-07-24 |
| MSFT | XLK | 2 | —% | 27% | 2026-07-24 |
| NFLX | XLC | 2 | —% | 9% | 2026-07-24 |
| T | XLC | 2 | —% | 25% | 2026-07-24 |
| SNAP | XLC | 2 | —% | 7% | 2026-07-24 |
| AMT | XLRE | 2 | —% | 1% | 2026-07-24 |
| CCI | XLRE | 2 | —% | 4% | 2026-07-24 |
| SBAC | XLRE | 2 | —% | 19% | 2026-07-24 |
| FDX | XLI | 2 | —% | 48% | 2026-07-24 |
| WMT | XLP | 2 | —% | 67% | 2026-07-24 |
| BKR | XLE | 2 | —% | 61% | 2026-07-24 |
| COP | XLE | 2 | —% | 63% | 2026-07-24 |
| HAL | XLE | 2 | —% | 70% | 2026-07-24 |
| SLB | XLE | 2 | —% | 57% | 2026-07-24 |
| DVN | XLE | 2 | —% | 65% | 2026-07-24 |
| RRC | XLE | 2 | —% | 44% | 2026-07-24 |
| MUR | XLE | 2 | —% | 75% | 2026-07-24 |
| CME | XLF | 2 | —% | 38% | 2026-07-24 |
| LYB | XLB | 2 | —% | 32% | 2026-07-24 |
| LVS | XLY | 2 | —% | 38% | 2026-07-24 |
| FOXA | XLC | 2 | —% | 55% | 2026-07-24 |

---

## 2026-W31

**Run:** 2026-08-01T01:25:41.467Z
**Escaneados:** 388 | **S2:** 0 | **S2D:** 9 | **S1:** 22

### S2 DEGRADADA — POTENCIAL (movimiento adelantado)
| Ticker | Sector | T | HR% | AO | AC | Price% | Señal |
|--------|--------|---|-----|-----|-----|--------|-------|
| FMC | XLB | 2 | —% | -2.577 | 0.008 | 0% | 2026-07-31 |
| MSFT | XLK | 2 | —% | -29.591 | 7.232 | 19% | 2026-07-31 |
| TSN | XLP | 2 | —% | -2.869 | 0.663 | 55% | 2026-07-31 |
| COP | XLE | 2 | —% | -0.795 | 0.227 | 63% | 2026-07-31 |
| RRC | XLE | 2 | —% | -1.733 | 0.109 | 50% | 2026-07-31 |
| CME | XLF | 2 | —% | -36.857 | 1.420 | 43% | 2026-07-31 |
| PLTR | XLK | 2 | —% | -18.787 | 2.977 | 60% | 2026-07-31 |
| T | XLC | 2 | —% | -2.918 | 0.260 | 50% | 2026-07-31 |
| FOXA | XLC | 2 | —% | -7.402 | 0.561 | 49% | 2026-07-31 |

### NIVEL 1 — OBSERVACIÓN (S1)
| Ticker | Sector | T | HR% | Price% | Señal |
|--------|--------|---|-----|--------|-------|
| KR | XLP | 2 | —% | 25% | 2026-07-31 |
| DOW | XLB | 2 | —% | 23% | 2026-07-31 |
| LYB | XLB | 2 | —% | 28% | 2026-07-31 |
| OLN | XLB | 2 | —% | 12% | 2026-07-31 |
| HUN | XLB | 2 | —% | 22% | 2026-07-31 |
| ORCL | XLK | 2 | —% | 3% | 2026-07-31 |
| SNPS | XLK | 2 | —% | 6% | 2026-07-31 |
| NFLX | XLC | 2 | —% | 10% | 2026-07-31 |
| SNAP | XLC | 2 | —% | 7% | 2026-07-31 |
| AMT | XLRE | 2 | —% | 1% | 2026-07-31 |
| CCI | XLRE | 2 | —% | 0% | 2026-07-31 |
| SBAC | XLRE | 2 | —% | 7% | 2026-07-31 |
| FDX | XLI | 2 | —% | 51% | 2026-07-31 |
| WMT | XLP | 2 | —% | 63% | 2026-07-31 |
| BKR | XLE | 2 | —% | 76% | 2026-07-31 |
| HAL | XLE | 2 | —% | 57% | 2026-07-31 |
| SLB | XLE | 2 | —% | 78% | 2026-07-31 |
| DVN | XLE | 2 | —% | 63% | 2026-07-31 |
| NEM | XLB | 2 | —% | 60% | 2026-07-31 |
| ALB | XLB | 2 | —% | 42% | 2026-07-31 |
| CC | XLB | 2 | —% | 39% | 2026-07-31 |
| GM | XLY | 2 | —% | 100% | 2026-07-31 |

---

## 2026-W32

**Run:** 2026-08-08T01:24:49.664Z
**Escaneados:** 388 | **S2:** 0 | **S2D:** 3 | **S1:** 20

### S2 DEGRADADA — POTENCIAL (movimiento adelantado)
| Ticker | Sector | T | HR% | AO | AC | Price% | Señal |
|--------|--------|---|-----|-----|-----|--------|-------|
| KR | XLP | 2 | —% | -6.397 | 0.348 | 27% | 2026-08-07 |
| DVN | XLE | 2 | —% | -0.130 | 0.219 | 69% | 2026-08-07 |
| LYB | XLB | 2 | —% | -2.003 | 0.430 | 32% | 2026-08-07 |

### NIVEL 1 — OBSERVACIÓN (S1)
| Ticker | Sector | T | HR% | Price% | Señal |
|--------|--------|---|-----|--------|-------|
| DOW | XLB | 2 | —% | 27% | 2026-08-07 |
| OLN | XLB | 2 | —% | 1% | 2026-08-07 |
| HUN | XLB | 2 | —% | 12% | 2026-08-07 |
| ORCL | XLK | 2 | —% | 14% | 2026-08-07 |
| QCOM | XLK | 2 | —% | 20% | 2026-08-07 |
| SNPS | XLK | 2 | —% | 8% | 2026-08-07 |
| NFLX | XLC | 2 | —% | 10% | 2026-08-07 |
| AMT | XLRE | 2 | —% | 10% | 2026-08-07 |
| CCI | XLRE | 2 | —% | 4% | 2026-08-07 |
| SBAC | XLRE | 2 | —% | 16% | 2026-08-07 |
| FDX | XLI | 2 | —% | 50% | 2026-08-07 |
| BKR | XLE | 2 | —% | 77% | 2026-08-07 |
| HAL | XLE | 2 | —% | 55% | 2026-08-07 |
| SLB | XLE | 2 | —% | 69% | 2026-08-07 |
| FCX | XLB | 2 | —% | 84% | 2026-08-07 |
| NEM | XLB | 2 | —% | 62% | 2026-08-07 |
| ALB | XLB | 2 | —% | 44% | 2026-08-07 |
| CC | XLB | 2 | —% | 40% | 2026-08-07 |
| CCL | XLY | 2 | —% | 72% | 2026-08-07 |
| TKO | XLC | 2 | —% | 63% | 2026-08-07 |

---

