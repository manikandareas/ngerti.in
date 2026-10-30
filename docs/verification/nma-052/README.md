# NMA-052 implementation evidence

Persistent agent identity, atomic Tobi/primary DM setup, revisioned conversational configuration and conversation snapshot/history APIs were implemented on 2026-10-31 (Asia/Makassar). All new engine/backend text is English; user content is preserved. The working tree started clean. Verification was completed without a commit; the user subsequently requested scoped closure and a local commit after reviewing the Muse developer-credit and Codex subscription-plan results.

See [API contract and examples](../../architecture/agent-conversation-api.md) and [exact upstream provenance](provenance.json).

## Scope and dependency

Live Notion was read before implementation: main documentation, product scope, feature matrix B04/C01–C04/H01, agent/conversation flow, architecture, source guidance, roadmap, acceptance and dependencies. NMA-048 and NMA-049 were Done. NMA-050 was In Progress for subscription-backed inference/tools and a native interactive permission decision. The independent NMA-052 work proceeds on the implemented adapters; **The user explicitly directed NMA-052 to Done after reviewing these results.** This is a scoped acceptance exception: the dependency relation and NMA-050's In Progress status remain visible, and its outstanding acceptance is not declared complete. No NMA-050 implementation, UI, installer or deployment is included.

## Checks

Use the repository workspace command rather than invoking Bun fixture tests from the root directory, where Bun can autoload root `.env` into test child processes.

```sh
bun run --filter @ngertiin/server lint
bun run --filter @ngertiin/server typecheck
bun run test:server
bun scripts/verification/nma047/foundation.ts
bun scripts/verification/nma048/http.ts
```

- Backend lint and typecheck pass. The server suite has **95/95 pass, 0 fail, 0 skip; 497 assertions**, including 11 dedicated agent/conversation tests and both real SDK/JSONL child-process fixtures.
- Foundation process/HTTP regression: **8/8 pass**, including SIGKILL, restart, authority lock, command/event persistence and unknown-outcome fencing.
- Broker process/HTTP regression: **5/5 pass**, covering detection, contract, selection/idempotency, revoke and restart/event replay. Its controlled PATH reports Muse missing because the downloaded native binary is not globally installed; the separate native probe uses the explicit Muse PATH.
- Concurrent setup: 32 HTTP requests with distinct command keys in a fixture and 16 per native service all return one Tobi/DM. Repeated opening/history/snapshot calls add no messages, runs or native bindings. Setup failure rolls back identity, welcome, events and receipt before a safe retry/restart.
- Scoped tools create/update profiles through both native protocol fixtures. Tests cover exact retry receipts, stale/concurrent revisions, identity/access injection, duplicate handles, invalid connection/harness, revoked grants, forged scope and access to other agents.
- Active runs retain their profile snapshot. Future work uses a replacement native session with the new revision; old mapping/history remains. Tests cover both adapters, isolated DM/group handoff context and a live Codex-to-Muse selection change during the old run.
- Conversation pagination, author mapping, snapshot high-water cursor and restart/replay deduplication are verified through HTTP.

Fixture tests do not perform provider inference. UI/root checks are not run; `apps/web` is unchanged.

## Native HTTP probes

The probes use existing, explicitly provisioned connection-owned credentials from the earlier adapter verification directories. They never read or print provider credential contents, import a global login, or change billing modes silently. Native account inspection, catalog, completed inference and useful configuration-tool effects are recorded separately. Both services are stopped after verification; ignored credentials and their historical state remain intact.

```sh
NGERTIIN_STATE_DIR=.dev/nma049-native NGERTIIN_PORT=49953 bun apps/server/src/main.ts
bun scripts/verification/nma052/native.ts http://127.0.0.1:49953 .dev/nma049-native codex initial
# Stop the authority and native children, wait for exit, restart the service, then:
bun scripts/verification/nma052/native.ts http://127.0.0.1:49953 .dev/nma049-native codex resume

PATH="$PWD/.dev/nma050:$PATH" NGERTIIN_STATE_DIR=.dev/nma050/state NGERTIIN_PORT=49956 bun apps/server/src/main.ts
PATH="$PWD/.dev/nma050:$PATH" bun scripts/verification/nma052/native.ts http://127.0.0.1:49956 .dev/nma050/state muse initial
# Failed private-marker scenarios are retained; the clean-agent continuity probe uses its created agent:
PATH="$PWD/.dev/nma050:$PATH" bun scripts/verification/nma052/native.ts http://127.0.0.1:49956 .dev/nma050/state muse continuity
# Restart before the exact-binding resume phase:
PATH="$PWD/.dev/nma050:$PATH" bun scripts/verification/nma052/native.ts http://127.0.0.1:49956 .dev/nma050/state muse resume
```

Codex CLI 0.165.0 uses subscription billing. Muse CLI 1.4.14-R7309.1 and SDK 1.4.14 use the explicitly selected API key/dev credits; **Muse subscription is unavailable and is not claimed**. Final acceptance cohort: **9 native turns = 5 Codex subscription + 4 Muse dev-credit turns, all succeeded**, including both exact-binding restart checks. Across all retained attempts there were **15 succeeded native turns, 0 failed native turns, 0 unknown outcomes, and 2 failed recall assertions** in the earlier Muse scenarios. The server recorded 22 completed product-tool calls. A completed turn is not by itself a successful scenario assertion. Native results and server-side completion records are stored in the adjacent JSON/JSONL files. See [verification.json](verification.json) for cohort denominators.

Two Muse continuity assertions failed after the model refused a dummy marker described as private. Both cohorts' useful create/update effects and completed runs are retained, but they are not continuity passes. A separate clean-agent DM uses a benign continuity marker. [iterations.json](iterations.json) also records the schema/fixture/probe/restart issues corrected before final checks. No unknown external effect was retried.

## Limits

NMA-050's subscription and native interactive permission acceptance remain open. NMA-052 does not claim those, full active-crash recovery/queue/conversational control from NMA-053, full skills/memory behavior from NMA-054, group routing/collaboration from NMA-056, API gate NMA-060, UI, installer or production readiness. Skill source references are configuration metadata, not evidence of executed skill packages. Replacement context is bounded to 40,000 serialized entry characters and explicitly reports omitted older messages; complete product history remains persisted.

A local commit was subsequently authorized by the user. There is no push, deployment, development reset or UI edit. Historical evidence bytes remain unchanged. The local manifest covers the responsibility files and retained evidence of this ticket; earlier ticket manifests describe their historical revisions and are not rewritten to match this working tree.

Commit verification preserves the raw `tests.log` bytes, including eight runner-output lines with trailing whitespace. The staged whitespace check excludes only `docs/verification/nma-052/tests.log`; the manifest verifies its exact bytes. All other staged paths pass. The retained source/evidence hashes were checked again; tests were not rerun during the status-and-commit operation because implementation bytes were unchanged.
