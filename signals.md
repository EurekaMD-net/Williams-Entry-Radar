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
