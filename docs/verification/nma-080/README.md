# NMA-080 web organizations verification

Date: 2026-11-15. Status: **Done for the web-client milestone**. Scope: the existing web-client conversation workspace, account onboarding, organization administration and private connection selection. This is development evidence on loopback HTTP, not deployed HTTPS, Tauri remote-session storage, installation or capacity acceptance.

## Implemented behavior

- Verified-email sign-in, registration, password recovery, guarded first-owner claim, creation-policy-aware organizations and email-bound invitation review/acceptance. Provisioning materializes the default agent, primary DM and welcome without requiring an AI connection or personalization wizard.
- A compact organization picker and My agents/Team agents sections retain conversation navigation, drafts, Focus, contextual panels, queue/stop/HITL and responsibilities. Organization administration is progressively disclosed in Settings; Members, Workgroups and Team-agent controls follow server capabilities. Repeated headings and unnecessary Computer setup prose are omitted.
- AI connection ownership is explicit. Personal/organization connections, actual account/model/billing, private conversation choices and personal defaults use the server contract. Marketplace owns app installation and grants; organization installs remain explicit across authorization-generation refreshes.
- Immutable request contexts bind the selected server, user, organization and device. Scope changes abort pending transports and replace mounted projections. Drafts, preferences, pending command journals, upload IndexedDB records, catalog entries, highlighter caches, viewer sessions and cursor contexts have their own scoped lifecycle. Logout clears private browser storage and closes this client's surfaces while server responsibilities retain their independent principal.
- Signed snapshot contexts accompany header-capable SSE and history requests. Retried commands retain their original body, organization and idempotency key. Private file previews, images and downloads use scoped fetches; browser links do not bypass organization headers.

## API delta before UI consumption

Contract **2.1.0** adds `GET /v1/data/access`, with an explicit executable response schema. It returns only `invocable_team_agent_ids` and `allowed_organization_connection_ids` from the current server-derived data context. An administrator's ability to read/manage a Team agent or organization connection does not make it invocable. The sidebar and model picker consume those allowed choices; dispatch continues to validate current grants independently.

[API delta evidence](api-delta.log): **1/1 test**, 12 assertions, covering management visibility versus invocation, positive membership, outsider/missing credentials/missing or foreign organization, signed response context, executable contract inventory and membership removal. [Changed gate](api-gate.log): **12/12 tests**, 656 assertions, including the delta and the complete affected readiness cohort. The retained [2.1.0 export](../../contracts/2.1.0.json) is separate from historical 2.0.0. NMA-079's native/provider evidence remains its captured evidence; this read projection does not claim new provider inference.

## Verification matrix

The broad real-API browser matrix passes **26/26** scenarios (13 desktop and 13 mobile); the separate actual-Cua browser cohort passes **2/2**, including decoded media, human takeover/handback and logout on desktop/mobile. Browser journeys run the real HTTP API, Better Auth, PostgreSQL, lifecycle, command receipts, scoped events, upload/artifact storage and grant enforcement. External provider adapters, email delivery and Composio authorization are controlled fixtures in the broad browser cohort. Native Cua, when selected explicitly, has its own separate cohort and screenshots.

- [Broad browser report](browser-report.json), [run log](browser-final.log), [screenshots](screenshots/): 26/26, zero skips/flaky cases.
- [Actual Cua browser report](native-browser-report.json), [native run log](native-browser.log): 2/2. These runs use fresh isolated Linux domains from the pinned image, with real viewer RPC/media and device sessions; model/provider and email adapters remain fixtures.
- [Viewer session/transport/domain gate](viewer-gate.log): 21/21 tests, 77 assertions. The upstream viewer now includes the issuing HttpOnly cookie only for RPCs in its own same-origin opaque viewer path; unrelated destinations retain their original credentials policy. Viewer authorization continues to require the issuing live device and current grants.
- [Connection/default and keyboard/dark follow-up](connections-report.json), [log](connections-ui.log): 4/4 after the final layout refinement. The broad matrix remains its own 26/26 report.
- [Affected unit checks](affected-unit.log): 25/25 tests, 91 assertions.
- [Broad unit checks](unit.log): 83/84 pass. The existing Markdown reference render test omits `PreferencesProvider`; the same failure is independently reproduced from untouched Git HEAD in [the baseline log](baseline-markdown.log). It is not relabeled as a passing test or fixed as unrelated work.
- [Backend regression](backend-regression.log): 57/57 tests, 1,005 assertions for authentication, organization HTTP, provider and readiness behavior before the additive access delta; the affected current gate is the separate 12/12 cohort above.
- [Production build](build.log), [server typecheck](server-typecheck.log), [web lint](web-lint.log), [server lint](server-lint.log), [design detector](design-detector.json) (55 changed source targets, no findings). Existing large-chunk and PostgreSQL-client deprecation observations remain explicit.

Source/dependency identities and content hashes are retained in `manifest.json`. PostgreSQL uses the pinned disposable 18.1 Alpine image. Browser versions and viewport configuration are retained in each Playwright report. Controlled email capture proves application handling, not delivery by a real email provider. Provider identity fixtures prove UI routing and application isolation, not subscription eligibility, billing or new native model execution. Tauri remote operation belongs to NMA-081; deployed transport/restore and integrated acceptance remain NMA-082/083.

## Iterations and limitations

Retained `browser-iteration-*.log` files include failed iterations. Early failures exposed a premature fixture readiness response, test selectors matching sidebar previews or duplicate headings, recovery retaining its reset route, a UI refresh race after Team-agent creation and organization installation ownership resetting on remount. Those results are not counted as passes. Native Cua iterations additionally exposed missing device cookies in upstream viewer RPCs, delayed control-state presentation and a mobile test that attempted Settings navigation before closing its modal side panel. The corrected viewer adapter preserves session enforcement; control UI applies the authoritative response and does not treat an expired viewer grant as a new account logout. One fixture inference observation exceeded the earlier 25-second assertion while backend regression ran concurrently; the final bounded cohort is recorded independently.

An existing PostgreSQL warning reports concurrent queries on one client; no PostgreSQL major upgrade or unrelated repository cleanup is included. Full documentation checking retains eight unchanged imported GPUI link failures. The [bounded checker](../../../scripts/verification/nma080/docs-check.ts) verifies that the three excluded imports are byte-identical to HEAD, then checks every remaining Markdown link and all backlog/decision/contract invariants; [result](docs-scoped.log), [exclusions](docs-scoped-exclusions.json). The native runner now uses graceful SIGTERM shutdown to retire only its test domains. Two domains left by early interrupted fixture shutdowns were explicitly identified and removed; [cleanup record](native-iteration-cleanup.json). No source-only, fixture, screenshot or development bundle result is presented as deployed production or fresh-device readiness.

## Reproduce

```sh
cd apps/web-client
bun run build
bun test verification/client-scope.test.ts verification/request.test.ts verification/event-connection.test.ts verification/workspace-sync.test.ts verification/conversation-preparation.test.ts verification/settings-preferences.test.ts
cd ../..
bun scripts/verification/nma080/run-browser.ts
NGERTIIN_NMA080_NATIVE_CUA=1 bun scripts/verification/nma080/run-browser.ts
bun scripts/verification/nma072/run-tests.ts tests/organizations/workspace-access.test.ts tests/organizations/readiness.test.ts
```

The browser runner owns only its disposable PostgreSQL container. The optional native cohort owns isolated test Cua domains and tears down those domains and their test home volumes. It does not attach to or reset the retained development installation.
