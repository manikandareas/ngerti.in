# NMA-049 verification

Implemented native Codex/ChatGPT through App Server on 2026-10-30 UTC / 2026-10-31 Asia/Makassar. [Ticket](https://app.notion.com/p/409abdd61873813fb849e4bb010f85f7), [adapter/API guide](../../architecture/codex-adapter.md), [source provenance](provenance.json). NMA-048 and NMA-047 were fetched live and both were Done before implementation. The working tree was initially clean. No commit, push, deployment, UI edit or data reset was performed.

## Results

| Verification | Actual result | Evidence |
| --- | --- | --- |
| Server lint | Pass, no warnings | [lint.log](lint.log) |
| Server typecheck | Pass | [typecheck.log](typecheck.log) |
| Backend suite | **68/68 pass, 0 fail, 0 skip; 253 assertions** | [tests.log](tests.log) |
| Foundation process/HTTP regression | **8/8 pass, 0 fail, 0 skip** | [foundation-regression.json](foundation-regression.json) |
| Broker HTTP/process regression | **5/5 pass, 0 fail, 0 skip** | [broker-http-regression.json](broker-http-regression.json) |
| Native subscription login/catalog, completed request, useful product tool and separate bindings | **4/4 pass** | [native-initial.json](native-initial.json) |
| Native DM/group history and tool restoration after actual backend/native-process restart | **2/2 pass** | [native-resume.json](native-resume.json) |
| Native cancellation and steering | **2/2 pass** | [native-controls.json](native-controls.json) |
| Explicit invalid API key is rejected without subscription fallback | **1/1 pass**, inference rejection expected | [native-key.json](native-key.json) |
| Final native history/tool recheck after account/process hardening | **2/2 pass**, repeats the two resume cases | [native-final-resume.json](native-final-resume.json) |
| All native API run outcomes | **12 turns: 10 succeeded, 1 confirmed cancelled, 1 expected invalid-key failure, 0 unknown** | [native-outcomes.json](native-outcomes.json) |
| Server-side HTTP product-tool completion | Two retained post-restart read-tool events, matching exact run/thread/agent IDs | [native-tool-events.jsonl](native-tool-events.jsonl) |
| Whitespace / UI preservation | `git diff --check` and `git diff --exit-code HEAD -- apps/web` pass | Final local checks |

The 9 primary native checks and 2 final repeat checks are not 11 distinct scenarios. Login, eight-model discovery, inference and useful product-tool invocation are separate observations. The invalid-key native run is deliberately counted as a failed inference, while its no-fallback assertion passes. Successful inference using a valid API key was **not attempted: no valid key was supplied**. No such result is inferred from the fixture key-success case.

## Commands and setup

Stack: Bun 1.3.10, TypeScript 7.0.2, Elysia 1.4.30, Zod 4.4.3. Codex minimum and tested CLI are 0.165.0; no Codex SDK is installed. Application contract is 1.2.0, broker contract 1.1.0, MCP bridge protocol 2025-06-18. Openbot source revision and exact file/protocol/documentation hashes are recorded in provenance.

```sh
bun run --filter @ngertiin/server lint
bun run --filter @ngertiin/server typecheck
bun run test:server
bun scripts/verification/nma047/foundation.ts
bun scripts/verification/nma048/http.ts

NGERTIIN_STATE_DIR=.dev/nma049-native NGERTIIN_PORT=0 bun apps/server/src/main.ts
bun scripts/verification/nma049/native.ts <loopback URL> .dev/nma049-native initial
# Stop/restart the service with the same state directory, then use its new URL.
bun scripts/verification/nma049/native.ts <loopback URL> .dev/nma049-native resume
bun scripts/verification/nma049/native.ts <loopback URL> .dev/nma049-native controls
bun scripts/verification/nma049/native.ts <loopback URL> .dev/nma049-native key
# Final hardening recheck used another real service/process restart and phase resume.
```

The equivalent workspace-local `bunx biome check .`, `bun run typecheck` and `bun test tests` produced the retained final check logs. The existing foundation/broker scripts now expect one **explicitly registered** Codex executor; their historical evidence files were preserved. Missing bindings still prevent dispatch, and no other executor/fallback is registered.

The native setup created one connection through HTTP, observed `login:required`, then started native browser login using `/v1/connections/:id/login`. The user explicitly completed login in this conversation. Inspection separately established authenticated native subscription mode and model discovery with `inference:not_attempted`. Probes selected `gpt-6.1-sol` with low reasoning, created one agent with separate DM/group threads, and admitted requests through HTTP. No adapter imports or direct provider calls are used by the native verification client. Native session IDs are retained in the binding evidence.

The product-tool probe requests `ngertiin.read_run_context`; the adapter routes native structured calls through the real Ngertiin HTTP MCP endpoint with a private scoped run lease. Exact returned run/thread IDs appear in the model's answer, and post-restart server events independently confirm successful tool execution. Bearers, OAuth payloads, email/account details and provider credentials are excluded from retained evidence.

DM/group probes stored different synthetic markers, stopped both the backend and owned App Server children, restarted with the same state, and asked each conversation to recall its previous marker without supplying that marker in the new prompt. Both native binding IDs stayed unchanged and neither answer contained the other marker. This proves ordinary native restart/history binding; full active-crash receipt reconciliation remains NMA-053.

The cancellation probe observed application intent before matching native interruption confirmed cancellation. Steering used the active turn precondition and changed that same run's answer. Key testing provisioned one intentionally invalid key in a new private credential file, selected only its connection, observed native inference rejection with billing still `api_key`, revoked that connection, and removed only that probe-created credential file. The real subscription credential remains in the isolated, ignored `.dev/nma049-native` connection home. The verification service was stopped after evidence collection.

## Contract/fixture evidence and limits

Ten new Codex tests use actual Bun child processes speaking a labeled protocol fixture plus a real local HTTP tool server. They cover useful owned output, restart with separate histories, explicit key mode, interrupt acknowledgement vs native confirmation, active-turn steer, permission denial, cross-thread tool refusal, lost-process partial output/unknown blocking, mismatched terminal identity, and secret-free rejection. The other 58 tests cover the shared broker/domain/API boundaries, concurrent agents/connections, capability/grant changes, version floors, fragmented-secret redaction and lifecycle fencing. Fixture key success is not native key inference.

Resume, settings, structured product tools, steer and cancel are supported. Permission escalation, media input and compaction are explicitly unsupported by this adapter surface. Native shell/computer/browser/temporary-subagent tools are disabled until their owning scoped features are implemented. The only advertised product handler is the existing useful read tool; mutating domain tools remain with their owning tickets. Application messages persist with native binding and partial/complete state; complete UI streaming and transcript synchronization remain later work.

The active NMA-049 acceptance is satisfied at the backend/native adapter boundary. Muse, conversational queue/control, crash reconciliation, workspace coding, browser/Composio, full product features, NMA-060, UI, installer and production readiness are not claimed. Root/UI checks were not rerun because the web tree was unchanged.

Initial local checks exposed formatting, fixture typing and workspace Biome invocation issues; those were corrected before the final passing checks. Native probes had no unexpected failed or unknown outcomes. The responsibility manifest includes final source, tests, probe, documentation and evidence; historical manifests/evidence are unchanged.

## Follow-up code organization

At the user's request, Codex code was grouped under `apps/server/src/harness/codex/` as `adapter.ts`, `client.ts`, `accounts.ts` and `rpc.ts`. Existing consumers now import those explicit modules. An exact comparison after removing import declarations confirmed that all executable module bodies were preserved; only imports and file boundaries changed. Workspace lint and typecheck passed, and the complete backend suite passed again: **68/68 tests, 0 fail, 0 skip, 253 assertions**. Existing native/process evidence and check logs were retained unchanged; native provider probes were not repeated for this structural change. The current responsibility manifest contains 39 files. No commit was created.
