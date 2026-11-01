# Engine/backend API gate — accepted 2026-11-01

**NMA-060 is complete for engine/backend/API readiness.** All eleven prerequisites were fetched live and are Done. The user explicitly accepted Codex/ChatGPT subscription plus selected Muse API-key billing for both NMA-050 and NMA-060 closure. Muse subscription remains unavailable/unverified. There is no silent billing fallback.

Contract **1.16.0** and `/health/ready` report `api_readiness_gate: ready`. This permits the UI phase to start; it does not claim that UI, installation, other hosts or production acceptance are complete. No commit, push or deployment was performed.

## Verification

| Layer | Result |
| --- | --- |
| Backend | **246/246 pass**, zero failures/skips, 1600 assertions; lint/typecheck pass |
| Consumer HTTP/SSE/replay/restart | **6/6 pass**, actual operation examples and JSON Schema contract |
| Foundation process/controlled faults | **8/8 pass**; these are controlled process/fixture faults, not provider crashes |
| Broker HTTP | **5/5 pass** |
| Required backend coverage | **47/47** mapped requirements plus the NMA-065 creation amendment; all 82 routes have reviewed response/transport contracts |
| Final native cohort | **38 runs: 36 succeeded, 2 cancelled with native confirmation, zero terminal failures/unknowns** |
| Unsupported modality | One video request rejected with CAPABILITY_UNSUPPORTED before native dispatch; not a successful video test |
| Retained evidence | **355/355 immutable files** from eleven prerequisite manifests verified; historical source drift reported separately |

The 38 native runs comprise six DM/group/router runs, twenty goal/Routine runs, six browser runs, two cancellation runs, one supported image run, one Composio read and two post-publication tool/resume runs. They use Codex **0.166.0**, model `gpt-6.1-sol`, and Muse **1.4.14-R7309.1 / SDK 1.4.14**, model `muse-spark-1.3`, with explicit effective billing inspections. Native outcomes and exact IDs are in `native-summary.json`; fixture counts are separate.

- DM and mixed-harness groups perform useful scoped profile/group updates. Groups have one selected responder and preserve global profiles. Original admission receipts replay without new runs/events; restart preserves identity and cursors.
- Goals are captured and corrected through ordinary conversation. Both harnesses persist a future continuation, survive backend/native-host restart, read actual subtotal files and publish verified `84012` results. Routines are created and revised without changing identities. After another restart, only the edited one-shot/heartbeat occurrences execute; no-change ticks publish no chat message. Conversational goal stop disables subsequent checks. No browser tab/client is required for scheduling.
- Real browser-use MCP actions and view-only RFB observe the same managed profiles. Both harnesses sign into a local fake-account site, persist a note, restart without logging in or typing again, then observe website-session expiry. Profile-generation changes invalidate old view tickets. Native session bindings remain identical across browser/backend restart.
- Codex reads a real attached image with the expected code/colors/shapes. A separate scoped Composio `LINEAR_GET_CURRENT_USER` read succeeds with a provider log receipt; no message or external write is sent. Its temporary grant is then removed without changing existing grants.
- Native cancellation is confirmed for both harnesses. After publishing readiness, both resume the same native session and complete a useful `ngertiin.read_run_context` round trip. A submitted acknowledgement is never treated as native stop or effect completion.
- NMA-050 repair evidence is in [interactions](../../nma-050/interactions/README.md): native question, allow-once/deny and stale HTTP answer rejection, with shell/write restrictions retained. Its five-run cohort is separate from the 38 gate runs.

## Failures and boundaries retained

Two initial RFB captures disconnected; the native browser tasks had succeeded. Read-only capture retries on the same sessions passed without repeating the browser actions. Across the recorded gate capture attempts and two standalone read rechecks: **11 attempts, 9 successful captures, 2 disconnections**. The failures are in `browser-start-before-view-retry.json` and `browser-start-before-muse-view-retry.json`. No production latency/reliability or arbitrary-site guarantee is inferred from this local cohort.

An initial modality setup reused a historical workspace whose grant had been revoked: two upload requests returned SCOPE_DENIED. Its separate application probe remained queued with an earlier NATIVE_UNKNOWN startup diagnostic and was explicitly cancelled; it is retained in `native-summary.json`, not counted as a successful native case. Fresh identities and a narrowly assigned read-only tool were used for the final passing cohort. No unknown external operation was replayed.

The earlier failed question probe and seven-run gate capture remain byte-stable in [completion](../completion/README.md). The first strict verifier compilation exposed a WebSocket overload typing mismatch; the local capture helper was corrected and the final verifier check passes. Historical subscription, provider and native-feature limitations retain their original scope. Two historical Composio effects remain unknown.

## Source and publication boundary

`source-manifest.json` freezes 94 runtime/schema/dependency files for the 36-run core cohort on contract 1.15.0. `publication.json` verifies that only five readiness/version/publication files changed for 1.16.0; all other frozen files are byte-identical. No lifecycle, harness, tool, browser, goal or persistence behavior changed during publication. Full tests and consumer checks were rerun, followed by two native exact-session tool/resume checks against the published 1.16.0 API.

The earlier response review fixed empty-body workspace responses and bounded native interaction acknowledgements. This turn repaired Muse's empty-preset question regression using an explicit native tool list and preserved approval display fields. The 310 obsolete Python/Hermes tracked files were previously retired only after baseline/archive verification; [retirement evidence](../completion/retirement.json) preserves exact paths, baseline and archive hash. No development database, historical evidence, unrelated file or Docker image/volume was reset or deleted.

## Reproduction and cleanup

The isolated backend runs with `.dev/nma050` on PATH, `NGERTIIN_STATE_DIR=.dev/nma049-native`, port 49959. The local fake browser site uses port 49958. Verifiers under `scripts/verification/nma060/` cover `final-native`, `goals-native`, `browser-native`, `browser-auth-policy`, `modalities-native`, `cancel-native`, `publication-native`, `consumer`, `coverage`, `retained` and the final summary. Private proof files preserve original command/run identities. Do not re-provision an existing cohort, replay unknown outcomes or reuse revoked credentials; new verification uses fresh isolated identities. The source remains uncommitted on baseline `80f66b9786d7776138fbe001b26ef068f1132624`.

All task goals are stopped/completed and Routines inactive. Browser hosts and both verifier services are stopped. The proof Muse connection is revoked and only its copied credential removed; original ChatGPT authentication and pre-existing application grants remain. `cleanup.json`, source/retained manifests, logs and `SHA256SUMS` provide traceable evidence. Current schemas are in [1.16.0.json](../../../contracts/1.16.0.json); consumer guidance is [here](../../../architecture/api-consumer-contract.md).
