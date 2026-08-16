# TimesFM × Williams Radar — Plan de Integración

> **Autor:** Piotr (Jarvis)  
> **Fecha:** 2026-08-16  
> **Referencia:** [google-research/timesfm](https://github.com/google-research/timesfm) | ICML 2024 (arXiv:2310.10688)
> **Estado (2026-08-16):** Fase 1 ejecutada según `docs/timesfm-fase1-spec.md` — **gate FAIL (G1)** en tres corridas (DB mixta con exclusión de costura · ventana solo-Polygon · copia de base única corregida por dividendos/splits): TimesFM está calibrado pero no supera al random walk. **No adoptado**; Fases 2–3 no proceden. Ver §9.

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
- **Costura de datos y re-test (2026-08-16, misma sesión):** el operador pidió rellenar la era AV con barras Polygon y re-probar. **Bloqueado por el plan de Polygon**: la key actual es free tier — un `lookbackYears=10` devuelve 105 barras desde 2024-08-16 (sondeo bajo `/etc/williams-radar.env`, sin imprimir la key). El script `scripts/backfill-polygon.ts` queda listo (dry-run por defecto, guard de plan → exit 4, backup a `/root/claude-backups/`, checksum de la era viva antes/después) y se ejecuta con `--apply` en cuanto la key sea de un plan con historia ≥5 años (Starter ≈5 a, Developer ≈10 a — verificar en polygon.io/pricing; `--lookback-years ≤ 9` por el tope de 500 barras del fetcher congelado; **solo convierte las barras dentro de esa ventana** — 354/389 tickers tienen historia AV anterior a ~2017-08, así que la frontera de base se MUEVE a ~inicio del lookback en vez de desaparecer; el script reporta cuántos tickers saltan >5% en su primera barra Polygon; qa R2 folded: backup con timestamp + rechazo si existe, validación de `--before`, ventana de scan del viernes bloqueada, `fetched_at` preservado para que `isCacheValid()` no salte el fetch). Mientras tanto se corrió el **re-test libre de costura** sobre la ventana donde TODA barra de entrada ya es base Polygon (as-of ≥ 2025-10-03, 1,379 semanas-señal, `--from-date 2024-07-19`) y, para control, la misma ventana con contexto 512 (costura dentro del contexto): resultados en `results/tfm-backtest/2026-08-16-clean/report-{cleanctx,ctx512}.md` — ver la nota al pie de esta sección.
- **Re-test libre de costura — resultado:** misma ventana (1,379 semanas-señal, as-of ≥ 2025-10-03, 43 semanas), sin ninguna fila descartada. (a) Contexto solo-Polygon (`--from-date 2024-07-19`, 64–106 barras): ΔPB **+0.0005 [−0.0000, +0.0012]** — TimesFM ligeramente PEOR que el random walk; cobertura 81.3% vs 79.8%; ancho 0.247 vs 0.242; dirección 53.8% [51.0, 56.5]. (b) Contexto 512 (la costura dentro del contexto): ΔPB **+0.0005 [+0.0002, +0.0009]** — el IC excluye 0 por el lado equivocado; cobertura 82.5%; ancho 0.258 vs 0.242. `report-cleanctx.md` / `report-ctx512.md` en `results/tfm-backtest/2026-08-16-clean/`. **La costura nunca fue la causa del FAIL**: con datos limpios el modelo no mejora; si acaso empeora. Un backfill Polygon con plan de pago sirve para limpiar `radar.db` (backtests y scorecards históricos), no para cambiar este veredicto.
- **Re-test con datos de base única (plan free, sin backfill de pago) — 2026-08-16:** el operador pidió trabajar con lo disponible en el plan free. Aunque los agregados llegan solo a 2 años, los endpoints de *referencia* de Polygon (dividendos, splits) sirven la historia completa en free tier. Con ellos se construyó una **copia de backtest** de `radar.db` (`results/tfm-backtest/radar-splitbasis.db`, ignorada por git; producción intacta) donde TODAS las filas se llevan a una base común: filas AV → cierre ajustado ÷ factor acumulado de dividendos (1 − cash/precio raw previo, con `F` = fecha de fetch de cada fila), OHLC raw × factor de splits, volumen ÷ splits; filas Polygon → reescaladas por los splits ejecutados después de SU fetch (MNST 1:2 el 2026-08-11 cayó entre fetches semanales — en producción `radar.db` hoy tiene una costura 2× para MNST en 2024-08-09→16, transitoria y ya fuera de la ventana de 104 semanas de W33; solo se reporta). Solo splits **ejecutados** hasta hoy (el feed lista anuncios: APH 1:2 para 2026-09-03). Guardia por fila (±1.5%): `close/SF` debe caer dentro del rango low–high raw; 68,493 filas (16.6% de la era AV) NO se pudieron reconciliar y quedaron AV — la clase **spin-off** (T→WBD 2022, K→WK Kellogg 2023, EXC→Constellation 2022, BDX→Embecta 2022, CMCSA→Versant 2026-01, FDX→Freight 2026-06 …): AV ajusta por la distribución, el feed de dividendos no la lista. Deriva residual disclosed: 22,194/343,306 filas convertidas quedan fuera de su propia barra raw (p95 0.09%, máx 1.52%). Cada ticker lleva un `clean_from` (inicio de su cola de base única) y el backtest descarta filas cuya ventana σ lo preceda (`unclean_window`, 146 filas); el contexto de 512 barras del modelo aún alcanza tramos no reconciliados en 427/2,851 filas (escalón visto como historia; disclosed en el reporte). Salto de costura 2024-07-12→19: 196 → 72 tickers (los 72 son los no reconciliables). Scripts: `scripts/tfm/fetch-reference.ts` (389 llamadas a 13 s ≈ 85 min; datos en `results/tfm-backtest/reference/`, versionados), `scripts/tfm/make-splitbasis-db.py` (+9 tests), `backtest.py --seam-date none --clean-from`. Auditoría qa R3: FAIL (splits futuros/entre-fetches) → folded + tests; verificado por el auditor: T +1.8% en la semana de costura, NVDA OHLC continuo a través del split 10:1, mediana cross-sectional 1.005.
  **Resultado** (`results/tfm-backtest/2026-08-16-splitbasis/report.md`, 2,851 filas puntuadas, 665 post-2025, sin filtro de costura): ΔPB **−0.0000 [−0.0005, +0.0005]** (todas) y **+0.0002 [−0.0005, +0.0008]** (post-2025) — indistinguible del random walk en ambas. Cobertura 82.8% / 84.1% (G2 ✅), colas 8.0/9.2% (G3 ✅), ancho 0.271 vs 0.274, dirección 52.5% [50.5, 54.4] (solo informativo). **Tercer FAIL, ahora sin ninguna excusa de datos.** Cierra la pregunta: el modelo no aporta sobre "último cierre ± volatilidad realizada" en cierres semanales de acciones a 4 semanas.
- **Higiene de datos aplicada en producción (2026-08-16, pedido del operador):** SGEN removido de `src/universe.ts` (387 tickers) y marcado `discarded` en `ticker_registry` (delistado 2023-12-14; AV devolvía barras planas fantasma y gastaba 1 llamada AV/semana) — el daemon lo carga en el reload del viernes 17:50 MX; 78 filas duplicadas por semana ISO eliminadas de `weekly_bars` (GMAB 2014-09-08, WBD 2022-04-05, 74× 2026-04-23, 2× 2026-04-30 — parciales de mitad de semana con la fila completa del viernes ya presente); backup previo en `/root/claude-backups/radar-db-pre-hygiene-2026-08-16/radar.db`; `MAX(fetched_at)` intacto por ticker (el fetch del viernes no se ve afectado); `PRAGMA integrity_check` ok. Pendientes solo-informativos: OHLC raw en la era AV (scanner congelado), costura 2× de MNST 2024-08-09→16 (transitoria).
- **Decisión:** no se cablea el sidecar (§3.5 del spec no se construye); Fases 2–3 quedan sin precondición. El runtime `/opt/timesfm` (~1.7 GB) y `scripts/tfm/` se conservan por si se quiere re-correr con otro horizonte/contexto; `rm -rf /opt/timesfm` lo elimina sin efectos.

---

*Documento generado por Piotr / Jarvis — 2026-08-16*  
*Para integrar con el KB del proyecto: `projects/williams-entry-radar/`*
