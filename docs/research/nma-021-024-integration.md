# Proactive delivery, scoped workspace and run diagnostics

Implemented against the live Ngertiin Multi Agent decisions and NMA-021–024 acceptance on 2026-10-24. Hermes remains the sole execution/session/recovery owner. This change does not activate the legacy task engine, change product pricing, or add goal approval/initiative gates.

## Delivery and correlation

Background goal continuations, webhook runs and discussion turns publish into the durable originating conversation with the producing agent identity. The existing transcript receipt is committed with `delivery.settled`; reconciling or reconnecting again does not insert another message. Execution completion and user notification are separate outcomes. Background deltas wait for the terminal receipt, avoiding an empty or partial message when a run intentionally stays quiet.

Quiet recognition uses the pinned Hermes `gateway.response_filters.is_intentional_silence_response` implementation, including its exact whole-response `[SILENT]` sentinel. Its source hash is in `runtime-pin.json`. A quiet result suppresses notification only; it neither pauses a goal nor denies a continuation. Waiting remains the existing sourced responsibility/goal behavior. Ordinary user-turn responses are not silently hidden by this background policy.

`run.diagnostics` and authenticated `GET /api/agent-engine/v1/runs/{run_id}/diagnostics` expose the durable run, originating command, admission state, goal/parent-run/discussion/native-handoff/trigger IDs, transcript message IDs, effect states and the most recent 256 run events. The durable event replay API remains the complete history. Unknown external effects remain indeterminate and are not replayed automatically.

Token counters come from the native terminal receipt's **turn delta**, not cumulative session counters. Native estimated USD cost is included only when the pinned runtime supplies a known source/status; its session counter delta is captured at the existing turn-runner boundary. These are provider/native estimates, not a new billing ledger. Missing usage stays unavailable rather than being fabricated. The real configured model returned token counts but no known native cost estimate; that live trace therefore omits cost. A focused receipt test verifies the cost delta when the native source supplies it. No rate table or spending cap is introduced.

## Workspace and artifact contract

The explicit operator capability grants `nma_workspace` and `nma_computer` add narrow tools to a persistent agent. Native arbitrary shell/filesystem tools remain outside the allowed catalog. Both tools revalidate live assignments and the existing run/context/membership generation at dispatch.

`workspace` publishes immutable UTF-8 artifacts (maximum 1 MiB each), lists the latest 100 visible files, or reads an explicit authorized artifact ID. Schema 12 stores bytes in the existing owner SQLite partition alongside their immutable revision, hash, byte count, producing agent/run/thread and operation receipt. Publication commits bytes, provenance and `artifact.ready` atomically. Downloads recheck the content hash and size, use authenticated owner access, and send an attachment with `nosniff` and private/no-store headers. The DM/group interface provides a collapsed file list and actual downloads.

This is a deliberately bounded text-file implementation: it does not provide binary uploads, mutable revisions, an arbitrary host directory, a new object-store backend, or an artifact retention/deletion UI. New publications create new immutable artifacts. Backups must include the whole owner partition.

Agents in another conversation cannot read a private artifact by guessing its ID. Owner-issued `artifact.share` and `artifact.revoke` commands carry an explicit target thread, reason and source user-message provenance from the producing thread. A revoke fences active runs in the recipient thread; access already received before revocation cannot be erased from an external recipient. There is no automatic DM-to-group grant. Within a group the writer hands off an explicit artifact ID to the reviewer.

## Computer resource and cleanup contract

The engine records a deterministic owner/thread workspace identity before dispatch. The operator configures `NMA_COMPUTER_COMMAND` as a JSON argv array; the model cannot supply that command, host paths, credentials or resource IDs. The one-shot backend actuator reuses the audited E2B computer's guarded DOM, target/privacy checks and dispatch receipts. It does not import the legacy task store/controller or create another execution queue.

Supported operations are observe, guarded navigate/click/type/select/scroll, pause and delete. Browser calls serialize at the local dispatch boundary. A retained ambiguous effect in the thread prevents further browser dispatch until operator reconciliation; restarting does not turn an unknown effect into permission to repeat it. An in-flight access revoke suppresses publication while retaining confirmed resource identity for cleanup.

Running browser state remains available between adjacent operations. Idle resources use E2B's five-minute **filesystem pause**; this is a resource lifetime, not a goal or model budget. Pause/restore retains disk, not RAM, CDP target identity or an active browser tab. Re-observe after restore. An initial probe exposed the loss of live tabs when pausing after every call, so the actuator now retains the running resource between actions. The explicit restore probe verifies bytes under `/home/user` and private ingress, then deletes the disposable sandbox. A probe marker under `/tmp` did not survive filesystem restore; `/tmp` is scratch space, not the durable-file contract. Product artifacts remain in the owner SQLite partition. Explicit delete is terminal for this thread workspace; resetting a deleted workspace is not currently an API operation. Missing/ambiguous retained resources require operator diagnosis, never silent recreation or blind retry.

For operator cleanup, stop/fence the originating run, inspect the owner partition's `nma_computers` row and reconcile outstanding `nma_effects` with provider receipts. Invoke the trusted actuator's delete operation with that recorded workspace identity, confirm provider absence, and preserve the receipt. Do not edit an indeterminate effect into a successful result without evidence. The integration test demonstrates provider deletion in a `finally` block; this is not a production retention scheduler.

## Host and credential boundary review

The engine container recipe uses non-root UID 10001 and an owner `/state` partition. The reference foundation image contains the engine runtime, not the backend actuator interpreter. A computer-enabled deployment must provision an isolated, trusted actuator installation and set its absolute argv. Local acceptance uses `apps/backend/.venv/bin/python -m ngertiin.agent_engine.computer_bridge`. Deployments must mount only the intended owner's state and credential material; a Hermes profile or SQLite owner key is **not** an OS sandbox. Local test processes sharing a macOS UID are likewise not mutually isolated from a malicious host process.

The actual E2B resource is separate from the host. Creation disables public ingress; live inspection verifies this setting. Model-facing requests cannot select another resource: the gateway replaces workspace identity with its trusted owner/thread mapping. Only a small DOM action allowlist is exposed. E2B/API credentials remain in trusted operator configuration and never enter model tool arguments. The bridge suppresses raw exceptions and child stderr; transcript/events/diagnostics use the existing secret redactor. The security suite checks cross-owner denial, private conversation memory/context and files, configured-secret canaries, queued assignment changes, membership removal, active browser revocation and unknown-effect restart behavior.

| Boundary | Exercised case |
| --- | --- |
| Tenant | Signed wrong-owner artifact request returns `NOT_FOUND`; existing thread/run owner checks remain in the full suite. |
| Private memory/context | `test_scoped_memory_transcript_transfer_revocation_restart`, `test_provenance_cannot_self_grant_or_cross_source_scope`, profile-memory denial. |
| Private file | Another DM cannot read a known artifact ID; explicit group share survives restart; revoke removes visibility; path-like ID rejected. |
| Credentials | Session-scoped MCP canaries, connector errors and discovery metadata cannot reveal configured secrets before/after restart; evidence scanned for actual configured values. |
| Queued/active revoke | Capability assignment changes, `test_context_revoke_fences_active_and_queued_work`, group member removal and blocked browser-tool revocation. |
| Unknown external effect | A failed actuator receipt stays `dispatching`/run `indeterminate`; neither restart nor a new run calls the same workspace again. |
| Resource boundary | Trusted host argv and narrow action allowlist reviewed; real E2B ingress is private, `/home/user` marker survives pause, and final resource lookup confirms deletion. |

This review establishes the implemented domain and actuator boundaries. It does not claim resistance to a compromised operator/root process, production container network hardening, production deployment validation, or a penetration test of third-party provider infrastructure. No new critical issue remains in the exercised paths; the host-trust assumptions and deployment requirements are explicit rather than treating profiles as sandboxing.

## Migration and rollback

Schema 12 adds artifact, sharing, operation receipt and computer-resource tables. AST checks confirm that migration 1–11 DDL is byte-identical to the predecessor. Stop ingress and the sole owner, back up the complete native/product partition, migrate exclusively, and verify schema/checksums, SQLite integrity/foreign keys and replay before reopening. Older binaries reject schema 12. Rollback requires an isolated complete predecessor backup while preserving newly created artifact/effect receipts and cleaning up provider resources; never drop live tables to force a downgrade.

## Acceptance evidence

Evidence lives in [evidence/nma-021-024](evidence/nma-021-024). The verification manifest records final commands/results and file hashes.

| Ticket | Behavioral evidence |
| --- | --- |
| NMA-021 | Real Chromium close/reopen with schedule, webhook and peer triggers; no browser requests while work runs; receipt retry and gateway restart preserve exactly the same transcript. Quiet execution settles successfully without a user message or partial delta. |
| NMA-022 | Real E2B Researcher browse → Writer immutable file → Reviewer read; explicit private-file denial/share/revoke; hash-checked HTTP download; actual production file component on desktop/mobile; artifact restart; private-ingress filesystem restore and confirmed deletion. |
| NMA-023 | Full gateway negative authorization/context/memory/capability suite, private artifact traversal denial, active browser revoke, unknown effect across restart; source and live resource boundary review above. |
| NMA-024 | Real-model one-goal/three-agent trace and restart equality; controlled peer failure/cancellation and effect-recovery cases; native turn usage/cost capture; transcript IDs and correlated events. |

Browser evidence uses a real gateway with a controlled provider and snapshot harness for offline triggers. File UI evidence imports the real production page/components through a local auth/router harness. These prove the scoped behaviors, not production authentication/deployment. The live group test uses a real model; the E2B handoff test uses controlled model responses with the real external browser and public HTTP/gateway state. Logs retain earlier failed/interrupted runs: a concurrent local harness caused the native host-lock rejection, then all gateway checks were rerun sequentially. Earlier probe limitations are retained rather than represented as passing browser-state persistence.
