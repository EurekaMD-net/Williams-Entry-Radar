# Learnings — 2026-W37 Journal re-issue (2026-09-11 → 2026-09-12)

The W37 edition published on Friday 2026-09-11 at 20:58 MX was wrong and was re-issued on
Saturday 2026-09-12. Two separate things failed: the **pipeline** produced a scan of last week's
bars, and **Jarvis** (the analyst/publisher agent) added fabricated claims on top and bypassed the
fact-check gate. This file records both, with the evidence, so neither repeats. The pipeline fixes
are in commit `9795361`; the Journal re-issue is `e29d163` + commentary `c1d975b` + audit `83bc382`.

## 1. What the pipeline did wrong (not Jarvis's fault)

| # | Defect | Evidence | Fix |
|---|--------|----------|-----|
| P1 | Scan ran on **last week's bars** for 385/387 tickers. Polygon's free tier caps an `sort=asc` response at 104 rows; the 2-year window held 105 weeks and the row dropped was the **newest**. | radar.db after the Friday fetch: `2026-09-04` = 368 rows, `2026-09-11` = 2 rows (PARA, ONC). Live probe: `sort=asc` → last bar 2026-08-30-keyed; `sort=desc` → 105 rows incl. 2026-09-06-keyed. | `fetch-polygon.ts` requests `sort=desc` (`buildPolygonAggsUrl`, test pinned). |
| P2 | Nothing checked that fetched bars belonged to the scan week; `fetchAll` "succeeded". | Log stopped at `[1/8] Fetching data...` then scanned. | `src/coverage.ts` + `ensureBarCoverage()`: <90% → wait/refetch lagging (cache bypass) ×2 → Telegram + ABORT before scan/push/publish; lagging tickers excluded from the scan. `--refetch` flag. |
| P3 | Scorecard measured each ticker's last two bars, so 385 rows reported the **W35→W36** move labelled **W36→W37** (SMMT "+28.2%", MLM "−3.1%"). | Bars: SMMT 08-28 13.73 → 09-04 17.605; real W37 move −0.3%. | Rows whose last bar ≠ run date, or whose ticker left the universe, print `— \| — \| —` "not measured" and are excluded from the summary and exit analysis. |
| P4 | 20 dead tickers still scored weekly. PARA resolved to **Banzai International** ($1, 100× discontinuity) and headlined S1 at p0% for two weeks; K sat in the pre-radar on a June bar. | Polygon reference: PARA = Banzai; K/EA/AVB/EQR/NUVL/IAC/SATS NOT_FOUND; 12 series stopped 2024-10 … 2026-05. | Removed from `universe.ts` (387 → 367), `discarded` in `ticker_registry`, data preserved. |
| P5 | SPY never refreshed after the 07-14 Polygon cutover → `SPY: —` since W30 (the two weeks showing a SPY number were hand-typed). | `MAX(date)` for SPY = 2026-07-17. | SPY fetched every week with its own refetch when it lags alone. |
| P6 | AV-era wording ("Thursday close", "Alpha Vantage"), Exit Analysis in Spanish (hand-translated two weeks running), "Tickers at structural lows (≤p30)" counted signal rows only. | W36/W37 pages. | Fixed in `journal-generator.ts`. |
| P7 | The commentary verifier flagged acronyms (PD, VEGF, PFS, NSCLC, EU, FDA) as fabricated tickers — the false positives that invited the bypass in J3. | `verify-commentary w37-2026` → 6 HARD before the fix. | Unknown token is HARD only within ±40 chars of ticker context or written as a symbol; otherwise SOFT. |

## 2. What Jarvis did wrong

Four tasks: `96286ef0` (scheduled publish, 02:00 UTC), `bd680654` (commentary, 02:50), `c37dd11f`
(translate exits, 02:57), `7ab38110` (commentary on the re-issued page, 07:59).

| # | Error | Evidence | Rule it broke |
|---|-------|----------|---------------|
| J1 | **Fabricated a trend**: "Three weeks of compression (22→21→22) gave way to an expansion week." | Page titles: W34 27 · W35 23 · W36 22 · W37 25 (stale). `grep -h '^title' pages/w3*.md`. | Every number cites a source. Prior totals are in the titles. |
| J2 | **Fabricated a record**: "the strongest single-week scorecard performance since we started tracking" (+3.7%). | `grep -o 'Avg Δ: …' pages/*.md`: W21 = +3.9%. And the +3.7% itself was last week's interval (P3). | Same. "Best/worst since X" needs the grep pasted. |
| J3 | **Bypassed the fact-check gate** with `--skip-verify` on his own judgement, against SOP §"do not bypass it". | Task `bd680654` output: "Publico con `--skip-verify` — el contenido es correcto." | The gate is operator-owned. A false positive is reported, not bypassed. |
| J4 | **Published a figure he had marked unverified**: his own report said "95% (sin verificar) retention rate"; the page states "That's a 95% retention rate — unusually high" as fact. | Task output vs `da55b14` page. | Unverified stays out of the page, or is labelled. |
| J5 | **Invented a roster history**: "recovered FMC and HAL to the S2D roster". Neither had ever been S2D (S1 in W35, filtered in W36). | `grep -E '^(FMC\|HAL),' results/radar_2026-W3[456].csv`. | Check prior CSVs before asserting a ticker's history. |
| J6 | **Did not sanity-check the input**: a +28.2% "this week" on SMMT, 21/22 names held, 3 net adds — all tells of a re-scan of the same bars. He reasoned from them ("the setup is broadening"). | Deep dive + Number of the Week, `da55b14`. | A generated page is a CLAIM. "Unusually high" is a prompt to verify, not a headline. |
| J7 | **Sector mislabel**: "the XLP cluster: K, TSN, STZ, MCD, NKE, LOW …" — MCD, NKE, LOW are XLY. Repeated in the Telegram report (MCD/NKE/LOW/NCLH listed under XLP). | Pre-radar table sector column. | Read the sector column; do not group by feel. |
| J8 | **Telegram report miscount**: "S1 activas (18)" followed by 19 names including HAL, which was S2D. | Task `96286ef0` output. | Counts and lists come from the same grep. |
| J9 | **Patched a symptom instead of reporting the bug**: hand-translated the Spanish Exit Analysis in W36 and again in W37 without flagging that the generator emits Spanish. | Commits `6fd9fae`, `da55b14`. | A repeat manual fix = a generator bug; report it. |
| J10 | **Re-issued commentary (07:59): three table-derived claims wrong** — "eleven are still holding at structural lows" (11 hold; 5 at lows), "four broke down" (3 breakdowns + 1 false technical tick), pre-radar "weighted toward XLP, XLV, XLY and XLRE" (order is XLP 11, XLY 7, XLC 6, XLV 5, XLRE 5). Sourced figures were all correct; derived counts were not. | Scorecard notes column; Exit Analysis table; pre-radar sector column. Corrected in `83bc382`. | Any count or ordering over a table gets a `grep -c` / sort in the report, like the totals. |

Not Jarvis's fault, for the record: P1–P7. He could not have known about the Polygon cap. J6 is the
part that was his: the numbers he was handed were implausible and he built a story on them.

## 3. What changed for him

- KB card `projects/williams-radar/README.md` (via `upsertFile`, 2026-09-12): five new anti-patterns —
  stale-bar scan check (`[coverage]` line; date histogram query), "not measured" rows stay, no
  `--skip-verify` without operator approval in the same task, every number cited from page/CSV/prior
  titles, dead tickers are retired not scored. Plus this retrospective as `knowledge/retro_williams_w37_2026-09-12.md`.
- `publish-journal.mjs` records any bypass in the commit (`Verify-Gate: SKIPPED`).
- The 07:59 task showed the sourcing discipline works when demanded: 20+ figures each with
  file:line or command, zero fabricated totals. The residual error class (J10) is derived counts.

## 4. Open

- APGE carried no W37 bar at scan time (excluded). Check W38.
- `radar.ts` (legacy CLI) has no coverage guard — use `scheduler.ts --run-now [--refetch]`.
- `EXPANSION_SCHEDULE`, `get-components.ts`, `fetch-biotech.ts` still list retired symbols (off the weekly path).
- Friday W38: expect a `[coverage]` line in `journalctl -u williams-radar`; an abort means the operator re-runs with `--refetch` on Saturday.
