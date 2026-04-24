# Williams Entry Radar — Fase 4: Operaciones

**Estado:** Diseño aprobado — pendiente de implementación  
**Fecha:** 2026-04-24  
**Arquitecto:** Piotr (Jarvis)

---

## 1. Frecuencia y ventana de ejecución

El radar corre **cada viernes**, una vez por semana. El mercado cierra el viernes a las 4 PM ET; la data semanal de Alpha Vantage (`TIME_SERIES_WEEKLY_ADJUSTED`) refleja la semana cerrada. Ejecutar los viernes en la tarde o noche (17:00–23:00 MX) garantiza que la semana está consolidada.

**Punto de inyección en código:** `src/index.ts` (entry point CLI). Agregar llamada a `node-cron` o wrapper de ejecución schedulada. La función `runScan()` en `src/scanner.ts` ya está lista — solo necesita un orquestador que la llame en el schedule correcto.

```
Viernes ~18:00 MX
  ↓
fetch (AV Premium, secuencial 1s delay, ~80s para 80+ tickers)
  ↓
scan (S1 + S2 para todos los tickers del universo)
  ↓
report (consola + CSV en results/)
  ↓
[condicional] xpoz_enrichment si S2 activo (ver §4)
  ↓
push resultados a GitHub
```

---

## 2. Reporte ejecutivo semanal

Cada corrida del viernes genera el siguiente reporte. Las secciones están ordenadas por prioridad de acción.

### Estructura del reporte (consola + CSV)

```
═══════════════════════════════════════════════════
  WILLIAMS ENTRY RADAR — YYYY-MM-DD  (YYYY-WNN)
═══════════════════════════════════════════════════

▶▶ NIVEL 2 — ATENCIÓN (S2)
   [tabla de tickers con señal S2 activa]
   Columnas: Ticker | Sector | Tier | HR% | AO | AC | AO-Recovery | Semanas | ExpLag | Fecha señal

▷  NIVEL 1 — OBSERVACIÓN (S1)
   [tabla de tickers con señal S1 activa]
   Columnas: Ticker | Sector | Tier | HR% | AO | AC | AC-Color | Semanas | ExpLag | Fecha señal

📥 NUEVOS TICKERS AGREGADOS ESTA SEMANA
   [lista de tickers incorporados al universo]
   Columnas: Ticker | Sector | Batch | Dividendo %

🔎 ESTADO DE SEÑAL S2
   S2 activos: N  |  Xpoz activado: SÍ/NO
   [si S2 > 0: lista de tickers con detalle de confluencia Reddit]

───────────────────────────────────────────────────
RESUMEN: N tickers escaneados | S2: N | S1: N | Sin señal: N | Universo total: N
```

### Métricas clave del resumen ejecutivo

| Métrica | Descripción | Por qué importa |
|---------|-------------|-----------------|
| S2 activos | Tickers con AC>0, AO<0 y recuperándose | Alertas de entrada prioritarias |
| S1 activos | Tickers en observación temprana | Pipeline de candidatos |
| Semanas en señal | Cuánto lleva activa la señal por ticker | Señales viejas (>8W) se descartan automáticamente |
| AO lag esperado | Semanas históricas hasta que AO confirma | Gestión de expectativas de timing |
| Nuevos tickers | Incorporaciones de la semana | Transparencia de expansión del universo |
| Xpoz activado | SÍ si S2 > 0 y se corrió validación Reddit | Trazabilidad del enrichment |

---

## 3. Gestión de tickers — Expansión semanal ordenada

### Universo inicial (semana de lanzamiento)
79 tickers de Fase 2 (backtested). Ya están en `src/universe.ts` con metadata completa.

### Rutina de expansión — Una batch por semana, ordenada por calidad de sector

| Semana | Batch | Sector | Tickers | Criterio de calidad |
|--------|-------|--------|---------|---------------------|
| W1 (lanzamiento) | — | — | 79 base | Backtested en Fase 2 |
| W2 | Batch A | XLU | Rank 21-30 por market cap | Utilities reguladas — mayor HR histórico |
| W3 | Batch B | XLI | Rank 21-30 por market cap | Industriales defensivos |
| W4 | Batch C | XLP | Rank 21-30 por market cap | Consumer Staples |
| W5 | Batch D | XLE | Rank 21-30 por market cap | Energía — mayor volatilidad, se incorpora al final |
| W6+ | Sector nuevo | XLV o XLF | Top 20 | Por señal del radar: el sector con más S1 activos en W4-W5 |

### Criterio de selección para nuevos tickers

Un ticker entra al universo si cumple **al menos 3 de 4**:
1. Market cap ≥ $5B
2. Dividendo ≥ 1.5% (preferible ≥ 2.5%)
3. Beta ≤ 1.1
4. Alpha Vantage tiene histórico semanal de ≥ 5 años para el ticker

### Flujo de actualización semanal

```
Jueves noche (día antes del scan):
  tsx src/index.ts --expand=SECTOR:rank_from-rank_to
  → agrega los tickers a universe.ts
  → dispara fetch inicial (secuencial, 1s delay)
  → verifica que el caché de los nuevos tickers es válido

Viernes (scan semanal):
  tsx src/index.ts
  → escanea universo completo (incluidos los nuevos)
  → los nuevos aparecen en sección "Nuevos Tickers Agregados" del reporte
```

**Punto de inyección en código:** `src/universe.ts` ya tiene `expandUniverse()`. El CLI en `src/index.ts` necesita la flag `--expand` que la invoque y dispare el fetch previo.

---

## 4. Integración Xpoz — Lógica condicional S2

Xpoz se activa **únicamente** cuando hay al menos una señal S2 activa en el radar. Es un enrichment de segunda capa — no es una herramienta de descubrimiento primario.

### Lógica condicional (pseudocódigo)

```typescript
// En src/index.ts, después de runScan():

const s2Active = scanResults.filter(r => r.signalLevel === "S2");

if (s2Active.length > 0) {
  for (const result of s2Active) {
    const redditSignal = await xpozEnrich(result.ticker);
    xpozResults.push(redditSignal);
  }
  reportParams.xpozActivated = true;
  reportParams.xpozResults = xpozResults;
} else {
  reportParams.xpozActivated = false;
  // El reporte anota: "Xpoz: no activado (0 señales S2 esta semana)"
}
```

### Qué busca Xpoz cuando se activa

Para cada ticker con S2 activo, Xpoz consulta Reddit:
- **Subreddits:** `r/stocks`, `r/investing`, `r/dividends`, `r/SecurityAnalysis`
- **Ventana:** últimos 7-14 días
- **Señales:** menciones, sentimiento (positivo/neutral/negativo), tendencia vs semana anterior

### Tabla de interpretación de confluencia

| Señal técnica | Señal Reddit | Lectura operativa |
|---------------|--------------|-------------------|
| S2 activo | Menciones crecientes + sentimiento positivo | Alta confluencia — prioridad máxima, revisar con detalle |
| S2 activo | Neutral / sin actividad relevante | Señal técnica pura — válida, sin catalizador conocido |
| S2 activo | Sentimiento negativo o menciones de riesgo específico | Señal de cautela — investigar fundamentos antes de actuar |

### Módulo a crear: `src/xpoz-enrich.ts`

```typescript
export async function xpozEnrich(ticker: string): Promise<XpozResult>

export interface XpozResult {
  ticker: string;
  mentionsCount: number;
  sentiment: "positive" | "neutral" | "negative";
  mentionsTrend: "up" | "stable" | "down";
  topPost?: string;
  subreddits: string[];
}
```

---

## 5. Cambios requeridos en archivos existentes

### `src/cache.ts` — CRÍTICO: mover caché a path persistente

El caché actual vive en `/tmp/` — se pierde con cada reinicio del servidor.

```typescript
// Actual (problemático):
const CACHE_DIR = "/tmp/williams-entry-radar/cache";

// Correcto:
const CACHE_DIR = process.env.RADAR_CACHE_DIR
  ?? "/root/claude/williams-entry-radar/data/cache";
```

Agregar `RADAR_CACHE_DIR` a `.env.example`.

### `src/weekly-report.ts` — Agregar 2 secciones

1. **"Nuevos Tickers Agregados":** parámetro `newTickers: TickerMeta[]` → tabla en consola y en CSV
2. **"Estado de Señal S2 / Xpoz":** parámetro `xpozActivated: boolean, xpozResults?: XpozResult[]` → tabla de confluencia si Xpoz corrió

### `src/index.ts` — Tres cambios

1. **Flag `--expand`** → invoca `expandUniverse()` + fetch previo antes del scan principal
2. **Condicional Xpoz** → después de `runScan()`, si `s2Active.length > 0` → importar y llamar `xpoz-enrich.ts`
3. **Pasar nuevos parámetros** a `printReport()` y `saveCSV()` (newTickers, xpozActivated, xpozResults)

### `src/universe.ts` — Minor

Verificar que `expandUniverse()` retorna la lista de tickers recién incorporados (para pasarla al reporte como "nuevos esta semana").

---

## 6. Tabla resumen de archivos

| Archivo | Acción | Prioridad |
|---------|--------|-----------|
| `src/cache.ts` | Cambiar `CACHE_DIR` a path persistente | **CRÍTICO** |
| `src/weekly-report.ts` | Agregar secciones "Nuevos Tickers" y "Estado S2/Xpoz" | Alta |
| `src/index.ts` | Flag `--expand`, condicional Xpoz, nuevos params al reporte | Alta |
| `src/universe.ts` | Verificar return de `expandUniverse()` | Media |
| `src/xpoz-enrich.ts` | Crear módulo Xpoz | Media — implementar en Fase 4 |

---

## 7. Fuera de scope de Fase 4

- Notificaciones automáticas vía Telegram/WhatsApp → Fase 5
- Backtesting de nuevos tickers incorporados → batch mensual manual
- Análisis fundamental automatizado → siempre manual
- Expansión a S&P 500 completo → requiere Xpoz como vector principal, Fase 5+
