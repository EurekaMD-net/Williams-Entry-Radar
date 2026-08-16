# TimesFM × Williams Radar — Plan de Integración

> **Autor:** Piotr (Jarvis)  
> **Fecha:** 2026-08-16  
> **Referencia:** [google-research/timesfm](https://github.com/google-research/timesfm) | ICML 2024 (arXiv:2310.10688)
> **Estado (2026-08-16):** Fase 1 ejecutada según `docs/timesfm-fase1-spec.md` — **gate FAIL (G1)**: TimesFM está calibrado pero no supera al random walk. **No adoptado**; Fases 2–3 no proceden. Ver §9.

---

## 1. Contexto — Qué agrega TimesFM al Radar

El Williams Radar es un sistema **técnico-retrospectivo**: AO y AC son derivados del precio histórico con SMAs fijas (5 y 34 semanas). La señal sale cuando las condiciones del último bar se cumplen — sin ninguna capa probabilística ni forward-looking.

TimesFM es un **foundation model decoder-only para series de tiempo** (el equivalente de GPT, pero para secuencias numéricas). Su propuesta: zero-shot forecasting — sin entrenar en tus datos, predice distribuciones de probabilidad del precio futuro a N semanas.

La integración agregaría una **vista forward probabilística**: dado el historial de precios, ¿cuál es la distribución P10/P50/P90 en las próximas 4–8 semanas?

---

## 2. Puntos de inserción naturales en el pipeline

```
Fetcher → DB (weekly_bars) → Indicators → Scanner → ScanResult → Journal
                                                            ↑
                                             [TimesFM entra aquí — post-scan]
```

### 2.1 Post-scan enrichment (Fase 1 — recomendado como primer paso)

Para cada ticker con señal activa (S1/S2D/S2), correr TimesFM sobre los últimos N bars del DB y agregar al `ScanResult`:

```ts
// Nuevo campo opcional en ScanResult (src/scanner.ts):
tfmForecast?: {
  p10: number;            // precio semana +4 (cuantil 10%)
  p50: number;            // mediana
  p90: number;            // cuantil 90%
  upsideAsymmetry: number; // (p90-p50) / (p50-p10) — >1 = sesgo upside
  horizon: number;        // semanas adelante (default: 4)
}
```

El `journal-generator.ts` consume este campo para agregar una línea de contexto probabilístico en el write-up de cada señal.

**Ejemplo de output en el Journal:**

> *BSX — S2D DEGRADED. Forecast P50: $47.20 (+5.4% vs cierre). Asimetría: 1.8× upside. [TimesFM W33]*

---

### 2.2 Pre-filter de ranging mejorado (Fase 2)

Hoy el ranging filter es: `(max12 - min12) / avg12 < 15%`

TimesFM podría complementarlo: si el modelo predice variación esperada en las próximas 4 semanas < umbral → confirma `ranging=true` con señal probabilística adicional. Reduce falsos positivos en tickers que salieron del rango justo esta semana.

---

### 2.3 Confirmación de escalado S1 → S2D (Fase 3 — más ambicioso)

Cuando un S1 de la semana pasada es candidato a escalar a S2D, verificar:

- Si `tfmForecast.p50 > currentPrice` → el modelo ve momentum positivo → escalado confirmado
- Si `tfmForecast.p50 < currentPrice` → degradar a "watch" aunque el AC haya cruzado

Esto solo aplica a escalados, no a señales nuevas. Es la capa de mayor valor pero también la de mayor riesgo de sobrecalibración.

---

## 3. Arquitectura técnica — sin GPU en el VPS

TimesFM 2.5 (200M params, contexto 16,384 steps) puede correr en CPU pero es lento para universos grandes. Para 388 tickers el pipeline duraría ~30 min adicionales — inaceptable.

**Solución:** correr TimesFM **solo sobre tickers con señal activa** (típicamente 20-35/semana). Eso baja el tiempo a ~2-3 min adicionales en CPU.

| Opción | Costo | Latencia (35 tickers) | Setup |
|--------|-------|-----------------------|-------|
| **CPU local en VPS** | $0 | ~2-3 min | Mínimo |
| **BigQuery ML** (TimesFM on BQ) | ~$0.05/batch | ~2-5 min | Google Cloud ya disponible |
| **Vertex AI Model Garden** | ~$0.10-0.30/batch | ~1-3 min | API call directa |
| **Micro-instancia GPU GCP** (spot) | ~$0.50/hr × <1hr | ~1 min | Máxima calidad |

**Recomendación:** empezar con **CPU local** para el prototipo. Si el tiempo adicional es aceptable (<5 min), se queda ahí. Si no, mover a BigQuery ML (mínimo overhead de infraestructura).

---

## 4. Plan de implementación — 3 fases

### Fase 1 — Prototipo local (objetivo: 1-2 horas)

**Archivos nuevos:**

- `src/timesfm-forecast.ts` — función `forecastTicker(ticker, bars, horizon)` que devuelve `TfmForecast`
- `scripts/test-timesfm.ts` — smoke test con 3-5 tickers conocidos

**Cambios a archivos existentes:**

- `src/scanner.ts` — agregar campo opcional `tfmForecast` en `ScanResult`
- `src/scheduler.ts` — paso [9.5/10] post-scan: enriquecer los resultados con forecasts de tickers con señal
- `src/journal-generator.ts` — consumir `tfmForecast` si presente → línea de contexto en el write-up

**Verificación del prototipo:**
```bash
npx tsx scripts/test-timesfm.ts BSX AAPL NVDA
# Espera: 3 objetos TfmForecast con p10/p50/p90 numéricos, tiempo < 90s total
```

---

### Fase 2 — Ranging filter mejorado (objetivo: 1 hora adicional)

Integrar el forecast de volatilidad esperada en el ranging filter existente (`src/scanner.ts: isRanging()`). Nuevo flag opcional `rangingConfidence: number` en el resultado.

**Gate de calidad:** comparar tickers marcados como ranging en W25-W33 con los que efectivamente tuvieron movimiento > 15% en las semanas siguientes. Si TimesFM hubiera cambiado alguna clasificación, ¿cuántos eran correctos? Correr retroactivamente antes de armar en producción.

---

### Fase 3 — Confirmación de escalados (decidir post-Fase 2)

Solo se implementa si Fase 1 y 2 muestran señal útil. Es el riesgo más alto — puede deteriorar la calidad de señales si el modelo no calibra bien sobre series de precio en el horizonte de semanas.

**Precondición:** backtesting sobre escalados W17-W33 vs precio real en las semanas siguientes.

---

## 5. Dependencias técnicas

```bash
# Instalación (virtualenv recomendado por el conflicto de deps Python)
pip install timesfm[torch]   # ~2.5 GB con PyTorch
# O la versión JAX:
pip install timesfm[jax]

# El modelo se descarga automáticamente en el primer run desde HuggingFace:
# google/timesfm-2.0-500m-pytorch  (~500MB)
# google/timesfm-1.0-200m-pytorch  (versión más ligera, suficiente para Fase 1)
```

**Input esperado por TimesFM:**
- Serie de precios de cierre ajustado semanal (el DB ya tiene esto en `weekly_bars.close`)
- Longitud recomendada: al menos 64 bars (el DB tiene ~105 bars por ticker desde Polygon)
- Frecuencia: `"W"` (semanal)

**Interoperabilidad con el stack actual:**
- El Radar es TypeScript; TimesFM es Python. El bridge más limpio: **subprocess** desde el scheduler — un script Python ligero que lee del DB SQLite y escribe los forecasts de vuelta al mismo DB o a un JSON temporal.
- Alternativa: llamar la API de Vertex AI directamente desde TypeScript (sin Python en el VPS).

---

## 6. Riesgos y mitigaciones

| Riesgo | Probabilidad | Mitigación |
|--------|-------------|------------|
| AO/AC son series *derivadas* — TimesFM puede no calibrar tan bien como sobre precio raw | Media | Correr forecasts sobre precio raw + derivar el AO forecast numéricamente |
| Tiempo de inferencia excede ventana del pipeline (~85 min) | Baja (con 35 tickers en CPU) | Gate: medir en prototipo; si >5 min → mover a BigQuery ML |
| El modelo introduce sesgo de confirmación en señales | Media | Tratar `tfmForecast` como contexto informativo, nunca como filtro bloqueante en Fase 1 |
| Drift del modelo (TimesFM no conoce events macro recientes) | Alta (estructural) | Documentar en Journal que el forecast es técnico-estadístico, no fundamental |

---

## 7. Criterio de éxito

**Fase 1 completa si:**
- Los forecasts corren en < 5 min adicionales al pipeline del viernes
- El Journal incluye la línea de contexto probabilístico en al menos 3 señales de la semana de deploy
- El P50 del forecast está dentro del rango de 52 semanas reportado (sanity check mínimo)

**Integración "viva" si (post-Fase 1, 4 semanas de shadowing):**
- La asimetría upside (`upsideAsymmetry > 1.5`) correlaciona positivamente con señales que efectivamente apreciaron en las 4 semanas siguientes — verificable con el scorecard retroactivo del Journal

---

## 8. Próximos pasos inmediatos

1. `pip install timesfm[torch]` en el VPS (ambiente separado, no en el proyecto Node)
2. Crear `scripts/test-timesfm.py` con BSX como caso de prueba — verificar que el modelo corre y devuelve P10/P50/P90 coherentes con el historial
3. Crear `src/timesfm-forecast.ts` con el subprocess bridge
4. Correr en shadow el viernes W34 — el Journal incluye los forecasts pero no los usa para filtrar
5. Después de 2 semanas de shadow → decidir si armar Fase 2

---

## 9. Resultado Fase 1 (2026-08-16) — gate FAIL, no adoptado

Ejecutado con la forma re-diseñada del spec (`docs/timesfm-fase1-spec.md`): sidecar sin tocar `src/`, backtest retrospectivo *as-of* contra un baseline random-walk. Reporte completo: `results/tfm-backtest/2026-08-16/report.md`.

- **Población:** 14,392 semanas-señal (S1/S2D/S2) 2019→2026-W29 sobre 388 tickers (registro activo menos SPY, como el scanner en vivo), generadas con el `scanTicker` congelado sin lookahead; muestra estratificada de 2,999 → **2,782 puntuadas** (645 post-2025-01-01) tras excluir 207 filas cuya ventana de retorno o de σ cruza la costura de ajuste de `radar.db` (2024-07-19: AV dividend-adjusted → Polygon split-only; 166/387 tickers saltan >5% esa semana) y 10 con `p10` recortado a 0 (CHK/OVV/SM 2020, PRAX 2023). Modelo `google/timesfm-2.5-200m-pytorch` (lib `timesfm==2.0.2`, CPU), contexto 512 barras, horizonte 4 semanas.
- **Resultado (todas / post-2025):** pinball TimesFM 0.0304 / 0.0276 vs baseline 0.0301 / 0.0273 → ΔPB +0.0002 [−0.0002, +0.0007] / +0.0003 [−0.0004, +0.0009] (**G1 ❌** — el IC incluye 0; el modelo NO supera al random walk). Cobertura 80% real: 81.8% / 83.6% (**G2 ✅**), colas 7.3%/10.9% y 6.5%/9.9% (**G3 ✅**). Ancho mediano de banda 0.275 vs 0.276 del baseline — TimesFM reproduce la volatilidad realizada, nada más. Dirección de P50: 53.4% [51.5, 55.4] aciertos (54.8% [50.7, 58.7] post-2025) — leve, solo informativo, y con `|r50|` mediano de 1.3% no es operable. Auditoría qa (R1, MERGE-READY-w-W) confirmó que el FAIL es robusto a la costura: el sesgo corría a favor de TimesFM y aun así no pasó.
- **Lectura:** en cierres semanales de acciones el modelo produce "el precio se queda donde está ± su volatilidad habitual". Está bien calibrado, pero eso ya lo da una fórmula de una línea. La línea probabilística del Journal habría sido decoración.
- **Decisión:** no se cablea el sidecar (§3.5 del spec no se construye); Fases 2–3 quedan sin precondición. El runtime `/opt/timesfm` (~1.7 GB) y `scripts/tfm/` se conservan por si se quiere re-correr con otro horizonte/contexto; `rm -rf /opt/timesfm` lo elimina sin efectos.

---

*Documento generado por Piotr / Jarvis — 2026-08-16*  
*Para integrar con el KB del proyecto: `projects/williams-entry-radar/`*
