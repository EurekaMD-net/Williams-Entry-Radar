# Polygon free-tier row cap probe — 2026-09-12 (MLM, weekly aggs, api.massive.com/v2)

Recorded from the live probes run while diagnosing the W37 stale scan (key never printed).
`t` shown as the UTC date of the bar's window start; the fetcher maps it to that week's Friday.

| sort | range | resultsCount | first | last (close) |
|------|-------|-------------:|-------|--------------|
| asc  | 2024-09-12/2026-09-12 | 104 | 2024-09-08 | 2026-08-30 (514.77) |
| asc  | 2026-08-24/2026-09-12 |   3 | 2026-08-24 | 2026-09-06 (509.96) |
| asc  | 2024-09-19/2026-09-12 | 104 | 2024-09-15 | 2026-09-06 (509.96) |
| asc  | 2024-09-12/2026-09-19 | 104 | 2024-09-08 | 2026-08-30 (514.77) |
| desc | 2024-09-12/2026-09-12 | 105 | 2024-09-08 | 2026-09-06 (509.96) |

Same result with `adjusted=false`, and identical between api.massive.com and api.polygon.io.
Reading: ascending responses are truncated at 104 rows and the NEWEST bar is the one dropped;
descending returns all 105. Hence `sort=desc` in `src/fetch-polygon.ts`.
