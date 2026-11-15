# NMA-083 integrated organizations acceptance

Status: **Done** for the focused server-organizations scope; the final evidence gate passes. This report covers the server-organizations delta on web-client and the actual macOS ARM64 Tauri development client. NMA-063 retains full-product acceptance; NMA-064 retains fresh-device distribution.

## Targets and declared actors

The controlled actor matrix uses disposable PostgreSQL 18.1 and real loopback HTTP/HTTPS: First organization has Owner, Alice/Member in Engineering and Bob/Admin in Operations; Second organization has Bob/Owner and Alice/Admin. An outsider belongs to neither. Five organization/user defaults remain distinct. Three people use one Team agent with separate conversations, memory and uploaded bytes. Explicit published knowledge and a pinned Team skill are shared only inside their organization.

Browser desktop is 1440 × 1000 and mobile is 390 × 844. Each viewport runs in a separate disposable process/database. The isolated native bundle uses an explicit HTTPS profile and the existing mkcert CA, actual system-browser PKCE, native renewal/Keychain storage and WKWebView. Email, harness and machine transports in this actor fixture are controlled; they are not provider or native Cua evidence.

The deployed target is the retained owner-operated Ubuntu 24.04 AMD64 server at `https://demo.ngerti.in`, selected in NMA-082. Actual Owner admissions pass through the real authenticated Tauri gateway. The selected providers remain Codex `gpt-6.1-sol` with subscription billing and Muse `muse-spark-1.3` with API-key billing. Three separately approved source patches have verified file backups and restart receipts. No schema, credential ownership or billing selection was changed by deployment.

## Executed cohorts

Overlapping cohorts are kept separate; their counts are not added into a synthetic total. The [manifest](manifest.json) records final source/dependency/configuration hashes and executed denominators.

| Cohort | Evidence | Scope |
| --- | --- | --- |
| Ten integrated actor cases | [Actor matrix](actor-matrix.json) | Roles/Workgroups, outsider denial, five private defaults, same-Team chat/memory/uploads/artifacts, explicit publication, connection privacy, concurrent reads, lost acknowledgement, removal/rejoin and retained work |
| Desktop browser, six cases | [Desktop](browser-desktop.json), [final log](browser-desktop-final.log) | Three authenticated people, private conversations, foreground reconciliation, organization drafts/reload, removal and remaining membership |
| Mobile browser, six cases | [Mobile](browser-mobile.json), [final log](browser-mobile-final.log) | Same API-backed actor journey at the mobile viewport; rendered overflow checks and [screenshots](screenshots/) |
| Actual isolated Tauri, nine cases | [Native journeys](tauri-journeys.json) | PKCE, private Team task, organization switching, drafts/reload/Quit/relaunch, removal on resume and device revocation |
| Actual deployed Tauri, six cases | [Deployed native journeys](deployed-tauri-journeys.json) | Visible provider results, decoded desktop, human input transfer/handback and responsibility survival after Quit |
| Existing affected backend cohort, 109/109 | [Backend log](backend.log) | Organization/provider/app scope, private events, queue/controls/HITL, native-stop/unknown receipts, recovery and device/viewer boundaries |
| Attachment regression, 27/27 | [Attachment cohort](attachment-regression.log) | Scoped staged materialization plus upload/derived-document/replay/RLS regression |
| Preparation regression, 17/17 | [Preparation cohort](preparation-regression.log) | HTTP preparation retry/receipt replay, conversation preparation and scoped attachments |
| Muse catalog regression, 13/13 | [Catalog cohort](muse-catalog-regression.log) | Cold scoped admission, retained account catalog, native reasoning validation and broker isolation/revocation |
| Final API cohort, 21/21 | [API log](api-gate.log), [authentication matrix](api/authentication-matrix.json), [surface cases](api/access-cases.json) | Installed contract 2.2.0 inventory and scoped consumer behavior; fixture adapters remain explicit |
| Final integrated regression | [Final matrix log](matrix-final.log) | Actor matrix/workload and the three focused regression files on the final local runtime |
| Final deployed provider workflows, 2/2 | [Native report](deployed-native.json), [audit](deployed-audit.log) | Completed native inference, selected account/billing, file/immutable-artifact bytes, actual Computer operation and original command replay |
| Public transport, 13/13 | [Public transport](deployed-transport.json) | Certificate-validated HTTPS/SSE/WSS, issuing-device media, another-device denial, viewer revocation and private-route denial |
| Deployed isolation, 13/13 | [Isolation](deployed-isolation.json) | Retained actual Owner and separate synthetic organization, private transcript/workspace/artifact denial, exact bytes and distinct Cua domains |

The final Codex file run recovered from one recorded `CONFLICT` tool result and completed exact file/artifact verification. It used `read_file`; its initial attachment observation was context preview only. A separate [explicit attachment-read follow-up](deployed-codex-read.log) successfully read the same immutable artifact/hash and returned the current marker without including that marker in the request. The report preserves this distinction instead of relabeling a preview as a successful attachment read. Muse's successful read receipt is in its original final file run.

## Controls, recovery and retained evidence

The backend cohorts exercise private queue/edit/delete/steer/stop/HITL, scheduled principals, authority replacement, unknown external-effect holds, revocation during asynchronous authorization/dispatch, late settlement without private publication, and SSE closure. These controlled outcomes remain separate from real provider inference. A rejoining person can read their own retained history, while prior membership command receipts and suspended work cannot resume implicitly.

The actual [client Quit](deployed-client-quit.json) occurred before the one-time Routine was due; the native gateway was unreachable and the central service remained active. A read-only [server observation while the client was closed](responsibility-while-client-closed.json) records admission at 11:19:53 UTC and successful settlement at 11:20:10 UTC, before relaunch. The run completed native Codex inference and `read_run_context` on the selected subscription. Relaunch displayed its result and restored the unsent draft; that synthetic draft was then cleared.

Actual human takeover and handback retain [human control](tauri-human-control.json) and [returned control](tauri-returned-control.json) receipts. The former interactive viewer was denied after handback. Device revocation returned the isolated native app to sign-in and its [gateway session](tauri-revoked-session-status.log) to 401. A [metadata-only Keychain lookup](tauri-keychain-after-revocation.json) confirmed the renewal entry was absent without reading credential bytes.

The [NMA-079 native account-mode lanes](../nma-079/native/report.json), [NMA-078 app/skill proof](../nma-078/README.md), [NMA-080 browser scope](../nma-080/README.md), [NMA-081 secure native scope](../nma-081/README.md) and [NMA-082 deployed refresh/restore proof](../nma-082/README.md) retain their original dates, denominators and limitations. NMA-083 adds the integrated journeys and fresh restart/native/transport/isolation checks above. It does not relabel those retained cohorts as fresh runs. The manifest verifies the retained deployment's runtime bytes against the current checkout: only `artifacts.ts`, `lifecycle.ts` and `harness/broker.ts` differ. Credential authority/refresh, private execution-domain and native secure-store implementation bytes remain unchanged. Actual provider-token rotation and the full cold off-host restore are inherited NMA-082 evidence, not newly repeated drills.

## Corrections and preserved failed iterations

1. Scoped staged uploads skipped machine materialization because an old pre-domain guard returned early. [The failing regression](attachment-regression-initial.log) reaches the normal dispatcher; the [patch](attachment-fix.patch) allows only an authorized private machine-bound workspace and preserves revalidation. A scoped legacy host workspace remains denied.
2. HTTP preparation retry returned 500 because an optional property retained `undefined` inside a canonical JSON command receipt. [The failure](preparation-regression-initial.log) and [patch](preparation-fix.patch) demonstrate removing that property, preserving the original run/input and exact receipt replay.
3. Muse MSP reports its pinned startup model, while account inspection reports an account-wide catalog. Replacing the latter with the former advanced connection generation and fenced the already-frozen choice. [The failing test](muse-catalog-initial.log) and [patch](muse-catalog-fix.patch) retain the account catalog, cache the native model projection separately and validate reasoning against that native projection. The stale queued probe was [explicitly cancelled](deployed-muse-stale-choice.json) before a new deliberate probe; its frozen provider choice was not rewritten.
4. The initial workspace-access assertion still pinned contract 2.1.0; it now checks the installed contract constant and its route semantics. [Initial backend result](backend-initial.log) is retained.

Earlier actor-test iterations also used an unsupported connection-list path and incorrectly expected rejoin to hide the same person's retained history. Those assertions were corrected to the existing entity route and documented history-versus-receipt/work-suspension behavior; no privacy policy was changed to satisfy a test.

5. Early browser attempts used a 100-ms fixture scheduler cadence and included timeouts. Query samples show repeated authorization reads and event-clock contention rather than a permanently held SQL lock. The final browser fixture uses the production 1,000-ms cadence from `main.ts`; its original timeout/assertions remain. Journeys submit concurrently, confirm backend completion, activate each person's page and assert its reconciled private presentation. Initial logs, query waits, visibility observations and final per-run timings are retained. The dense browser workload is not a model-latency or production-capacity guarantee.
6. The first restart helper probed the server's own public URL, which returned 403 while the Mac's public request returned 200. It automatically restored the previous file. [The correction](deployment-initial.json) separates namespace-local readiness and the Mac's certificate-validated public health. The final [attachment](deployment-patch.json), [retry](deployment-preparation-patch.json) and [catalog](deployment-catalog-patch.json) deployments verify backup/source hashes and new service PIDs. A fixture startup initially omitted its CA bundle; rerunning with the existing CA preserved TLS verification.

After a deliberate server restart, one preview retaining an older viewer ticket displayed a re-attach error. Opening the full Computer viewer obtained a fresh ticket and visibly decoded the desktop. Automatic recovery of an inactive preview is not claimed. No failed native attempt, blocked choice, recoverable tool error or initial timeout is counted as an uninterrupted successful run.

## Declared workload and limits

The [workload](workload.json) is three concurrent authenticated clients, six unique queued admissions per client and one private SSE stream per client: 18 commands and 18 matching event deliveries, with no foreign-user delivery. It measures command round trip and command-start-to-SSE delivery, rather than an inferred model latency. Fixture adapters do not execute native inference in this cohort. The manifest records exact observed p95 values and local RSS.

The separate [deployed resource sample](deployed-resources.jsonl) observed two retained Cua domains at approximately 306/210 MiB, with 1.5 GiB limits; PostgreSQL and ingress are recorded independently. These are point samples during bounded verification, not peaks or production/user-count capacity. The retained two-domain admission policy remains unchanged. Broader concurrency, automatic capacity expansion, replacement-VPS recovery, Muse subscription and unsupported/unknown native capabilities retain their existing limits. The last NMA-082 off-host snapshot predates this verification's new test records; snapshot RPO remains explicit.

The full [documentation check](docs-check.log) retains eight broken links in three unchanged imported GPUI reference files. The [bounded documentation check](docs-scoped.log) verifies their exact HEAD hashes before excluding only those files; all remaining links and backlog invariants pass. The exclusions are retained in [their manifest](docs-scoped-exclusions.json). No GPUI implementation or imported-guide repair was included in this milestone.

## Reproduction and provenance

Use Bun 1.3.10 and Docker. `scripts/verification/nma072/run-tests.ts` creates and removes only its disposable PostgreSQL container. Run each browser viewport in its own process:

```sh
bun run build:web-client
bun scripts/verification/nma072/run-tests.ts ../../scripts/verification/nma083/acceptance.test.ts ../../scripts/verification/nma083/workload.test.ts
bun scripts/verification/nma072/run-tests.ts ../../scripts/verification/nma083/browser.test.ts -t desktop
bun scripts/verification/nma072/run-tests.ts ../../scripts/verification/nma083/browser.test.ts -t mobile
bun scripts/verification/nma072/run-tests.ts tests/organizations/attachments.test.ts tests/organizations/preparation.test.ts tests/organizations/muse-catalog.test.ts
bun scripts/verification/nma083/report.ts
```

The disposable native fixture uses `scripts/verification/nma083/run-native.ts`, the retained private TLS certificate, `NODE_EXTRA_CA_CERTS` pointing to its existing CA, and an isolated remote Tauri profile. Its operator control listener is loopback-only and is never application code. The fixture was stopped and its disposable database removed after the observed journeys.

Deployed probes require the explicit `NGERTIIN_NMA083_DEPLOYED=demo.ngerti.in` selector, the retained intended Owner native session and private operator fixture metadata. They preserve operation IDs and refuse blindly repeating an existing native outcome. `--audit` only verifies retained runs and replays original command receipts; `--codex-read` observes its retained read probe after its first explicit admission. New probes and deployment require their stated scope. Never reconstruct provider/native credentials from this report.

The actor fixture adapts `readiness-helpers.ts`; the isolation/transport probes and native launcher adapt the NMA-082 modules. Exact revisions/hashes are in the manifest. No new external dependency or upstream feature was adopted. On dependency upgrades, repeat the declared role matrix, private SSE/receipt/revocation cases, both actual native file/Computer lanes, Muse account-versus-process model catalog/variant checks, Tauri PKCE/secure-store/Quit journeys and the bounded workload.
