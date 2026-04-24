# Fase 2 — Análisis Cualitativo de Outliers

**Fecha:** 2026-04-24  
**Universo:** Top 15 outliers robustos (≥20 señales, HR ≥ 65%, score > 1.10)

## Los Top 15 Outliers

| Rank | Ticker | Sector | Señales | HR 8W | Ret 8W | Max DD | Lag AO | Subsector |
|------|--------|--------|---------|-------|--------|--------|--------|-----------|
| 1 | **SO** | XLU | 40 | **85.0%** | +6.60% | -1.69% | 11.8W | Electric Utility (SE) |
| 2 | **WEC** | XLU | 51 | **80.4%** | +4.13% | -2.98% | 12.4W | Electric Utility (Midwest) |
| 3 | **DUK** | XLU | 48 | 79.2% | +3.42% | -4.90% | 18.4W | Electric Utility (SE) |
| 4 | **SRE** | XLU | 39 | 79.5% | +4.89% | -3.02% | 15.6W | Electric Utility (multi-region) |
| 5 | **AEE** | XLU | 50 | 78.0% | +4.12% | -3.11% | 14.7W | Electric Utility (Midwest) |
| 6 | **NEE** | XLU | 48 | 77.1% | +3.82% | -4.21% | 14.6W | Renewable Energy Utility |
| 7 | **BKR** | XLE | 17* | 76.5% | +11.26% | -7.74% | 12.9W | Oilfield Services |
| 8 | **ED** | XLU | 55 | 76.4% | +4.00% | -2.44% | 10.8W | Electric Utility (NY) |
| 9 | **HON** | XLI | 44 | 75.0% | +4.93% | -5.74% | 13.0W | Industrial Conglomerate |
| 10 | **DE** | XLI | 51 | 74.5% | +6.09% | -4.29% | 11.7W | Agricultural Machinery |
| 11 | **COST** | XLP | 43 | 74.4% | +4.39% | -4.15% | 11.6W | Wholesale/Retail |
| 12 | **PEP** | XLP | 53 | 73.6% | +3.11% | -2.78% | 11.5W | Beverages/Snacks |
| 13 | **ETN** | XLI | 45 | 73.3% | +6.37% | -5.87% | 12.8W | Electrical Equipment |
| 14 | **LMT** | XLI | 45 | 66.7% | +5.88% | -3.30% | 13.3W | Defense Contractor |
| 15 | **CTAS** | XLI | 44 | 65.9% | +6.18% | -4.80% | 12.7W | Business Services |

*BKR con solo 17 señales — estadísticamente menos robusto.

---

## Patrones Comunes

| Característica | Presencia en Top 15 | Interpretación |
|----------------|---------------------|----------------|
| Beta < 0.70 | 9/15 (60%) | Acciones defensivas dominan |
| Dividendo ≥ 2.5% | 10/15 (67%) | Yield atrae compradores sistemáticos |
| Max DD < 4% | 7/15 (47%) | Los mejores tienen cushion reducido |
| Lag 10-15W | 13/15 (87%) | Sweet spot operativo del sistema |
| XLU (Utilities) | 7/15 (47%) | Sector claramente dominante |

---

## 5 Hipótesis Cualitativas

### 1. Regulación = Predecibilidad de la señal

XLU lidera con 7 de los 15 mejores outliers. Las utilities son negocios regulados con flujos de caja predecibles, tarifas aprobadas por reguladores, y demanda inelástica. Cuando la señal Williams aparece, **no hay sorpresas exógenas** que rompan el patrón técnico. La recuperación es estructural, no especulativa.

### 2. Dividendo alto = "Piso natural" detectado por AC

Los inversores institucionales y de ingreso regresan sistemáticamente cuando el precio cae lo suficiente para que el **dividend yield** sea atractivo vs. los bonos del Tesoro. Este comportamiento mecánico crea el piso que la señal AC está detectando. No es señal técnica pura — es el sistema de Williams capturando un fenómeno **fundamentalmente anclado**.

Los 10 tickers con dividendo ≥ 2.5% tienen HR promedio de **77.5%** vs 68.3% para los que no. El dividendo no es cosmético — es parte del mecanismo.

### 3. Beta bajo no significa retorno bajo

Contraintuitivo: SO (beta 0.52) entrega +6.6% promedio a 8W. LMT (beta 0.52) entrega +5.88%. Los industriales de calidad como DE (beta 1.05) o ETN (beta 1.12) tienen beta más alto pero su retorno refleja eso (+6.09% y +6.37%).

La señal funciona con cualquier beta siempre que el negocio sea **predecible**. Beta bajo simplifica la lectura porque reduce el ruido externo; pero lo que realmente importa es la **visibilidad del flujo de caja del negocio**.

### 4. Lag 10-15W es el sweet spot operativo

13 de 15 outliers tienen lag entre 10 y 15 semanas. Los que están fuera de este rango:
- **DUK** (18.4W): lento pero muy alto HR (79.2%) — válido, pero el capital está inmovilizado más tiempo
- **SRE** (15.6W): en el límite superior — aceptable

Implicación operativa: cuando la señal AC aparece en un ticker de este perfil, el AO va a cruzar a verde **entre 10 y 15 semanas después**. Ese es el momento de entrada confirmada si sigues la jerarquía AC → AO → Precio.

### 5. Los "quasi-utilities" industriales son la segunda capa

DE, LMT, ETN, HON, CTAS — todos tienen algo en común: **backlog de largo plazo, contratos gobierno/infraestructura, y demanda estructural predecible**. No son utilities per se, pero se comportan como tal en correcciones porque el mercado sabe que el negocio no se va a evaporar.

Esto sugiere que el criterio de selección para el radar live no es "sector = utilities" sino **"visibilidad de flujo de caja ≥ 3 años"**.

---

## Los que NO funcionan — y por qué

| Ticker | HR | Problema |
|--------|-----|---------|
| **WMB** | 59.6% | Gas midstream: muy sensible a precio del gas, ciclos cortos y violentos |
| **FANG** | 46.7% | E&P: puro commodity play, sin floor defensivo |
| **KHC** | 44.8% | Fundamentales deteriorados (crisis de 2019 permanente) — señal técnica irrelevante cuando el negocio está roto |
| **HRL** | 54.7% | Presión competitiva estructural — la señal no puede compensar headwinds de largo plazo |

**Patrón del fracaso:** la señal Williams falla cuando el negocio tiene problemas **estructurales** (no cíclicos). La señal detecta agotamiento de un ciclo bajista, pero no puede distinguir entre "corrección cíclica" y "deterioro permanente".

---

## Conclusión: El Perfil del Ticker Ideal para el Radar

El mejor ticker para la señal Williams en weekly tiene estas características:

1. **Negocio regulado o con backlog predecible** (utility, defensa, infraestructura, consumo básico)
2. **Dividendo ≥ 2.5%** — crea el piso natural que la señal detecta
3. **Beta < 0.85** preferible — reduce ruido externo
4. **Sin deterioro fundamental** — el negocio core debe estar sano
5. **AO lag histórico 10-15W** — permite planear la entrada con confirmación

El perfil opuesto (FANG, WMB, HAL) son candidatos a **falsos positivos** que deben excluirse del radar automático aunque disparen la señal.

---

## Implicaciones para la Fase 3 (Radar Live)

1. **Universo del radar**: enfocarse en XLU completo + los industrials y staples identificados como quasi-utilities. Excluir E&P puro (FANG, DVN, HAL).

2. **Score de calidad de ticker**: antes de emitir alerta, verificar que el ticker no tiene deterioro fundamental (proxy: score histórico < 0.90 = flag de advertencia).

3. **Frecuencia de polling**: semanal, jueves o viernes después del cierre. Alpha Vantage Premium permite 75 req/min — escanear 80 tickers toma < 2 minutos.

4. **Alertas en dos niveles**:
   - **Nivel 1 (Observación)**: señal AC rojo→verde con ambos negativos — iniciar reloj
   - **Nivel 2 (Candidato de entrada)**: AO también empieza a subir (aunque siga negativo) + confirmación de 2 semanas en AC verde

5. **Integración futura con Xpoz (Reddit)**: cuando el radar emite alerta Nivel 1, lanzar búsqueda en Xpoz del ticker para detectar narrativa emergente. Si el mercado retail está empezando a notar el ticker, la señal se fortalece.
