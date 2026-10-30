# NMA-038 fresh browser recheck

Date: 2026-10-30. Current working-tree implementation; no product code changes.

- Core browser: 7 passed, 0 failed; no uncaught page errors.
- Integrated browser: 7 passed, 0 failed.
- Group archive viewer/download: 1 passed, 0 failed.
- 35 automated accessibility/reflow snapshots passed, desktop/mobile, light/dark and 320px long content.

Actual disposable Clerk development sessions, production account authentication/API, isolated PostgreSQL and two actual Hermes gateways. Controlled loopback inference; this is not paid-provider or release-SLO validation. Fixture driver used Python 3.13.12, gateway interpreter used the configured Python 3.14 production runtime.

Existing repository browser scripts were copied to a private temporary directory with only private-state and output paths adjusted. Original evidence was preserved. Initial setup failures: missing web Clerk secret environment, incompatible psycopg interpreter, and missing pytest in backend environment. Explicit environment loading and an isolated uv dependency environment resolved setup; no authentication bypass was introduced.

Browser checks cover history search/name/usage/branch, selected bundle download bytes, conflict preview, dropped import response and reload deduplication, owner isolation, personality persistence, two-tab clarification and cancellation, offline draft/reconnect, group attribution and private-file isolation, capability panels and long content. The import preview mobile screenshot was also inspected visually.
