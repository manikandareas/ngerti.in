# Harness-first application server

Bun 1.3.10, TypeScript 7.0.2, Elysia 1.4.30 and Zod 4.4.3. Run `make dev` from the repository root. See the [root guide](../../README.md), [ADR](../../docs/architecture/adr-0001-harness-first-foundation.md) and [domain/API contract](../../docs/architecture/harness-first-contract.md).

- `contracts.ts`: versioned schema registry, domain types and contract publication. Entity schemas live in each domain's `contracts.ts`; `contracts/base.ts` and `contracts/errors.ts` hold shared fields and errors.
- `store.ts`: SQLite transactions, installation ownership, command receipts, projections and event cursor.
- `lifecycle.ts`: identity/scope, admission, queue/dispatch fencing, cancellation, Routine occurrence admission, goal controls and conservative recovery.
- `conversations.ts`, `agent-instructions.ts`: atomic Tobi/DM/welcome setup, consistent conversation reads and native profile context. See the [agent/conversation API and examples](../../docs/architecture/agent-conversation-api.md).
- `workspaces/`: scoped project binding (`service.ts`), descriptor-relative access (`files.ts`, `posix.ts`), schemas and product-tool handlers. Bun compiles the adjacent fixed `openat.c` ABI wrapper.
- `agents/`: agent profile schemas and configuration product-tool handlers.
- `artifacts.ts`: immutable bytes, explicit sharing and durable native publication. See the [workspace/artifact API](../../docs/architecture/workspace-artifact-api.md).
- `learning/`: scoped facts/tombstones, immutable application skill packages, pinned assignments and trusted learning-tool handlers. See the [memory/skills API](../../docs/architecture/memory-skills-api.md).
- `groups/`: context-based model routing, authored peer tasks, durable owner requests and transactional continuation. See the [group collaboration API](../../docs/architecture/group-collaboration-api.md) and [native/fixture evidence](../../docs/verification/nma-056/README.md).
- `goals/`: conversational responsibilities, evidence-checked completion, durable continuation and timezone-aware Routine scheduling. See the [goal/Routine API](../../docs/architecture/goals-routines-api.md) and [verification evidence](../../docs/verification/nma-057/README.md).
- `harness/inherited-skills.ts`: read-only native catalogs and confined inherited package snapshots, separate from app packages.
- `background.ts`: scheduler and bounded concurrent dispatcher; injectable executor port, explicitly registered Codex and Muse adapters.
- `harness/`: broker orchestration, client interfaces (`client.ts`), prompt/context construction (`instructions.ts`), host version detection, isolated credential/process context and connection projections. `tools.ts` owns scoped leases and authorization; `mcp.ts` handles MCP negotiation and envelopes, while domain modules register their handlers. See the [broker contract](../../docs/architecture/harness-broker-contract.md).
- `api.ts`, `api/`: HTTP composition and routes grouped by domain, with shared authentication, errors and durable-command handling in `api/http.ts`.
- `config.ts`, `setup.ts`, `main.ts`: development state/bootstrap and process lifetime.

Providers cannot write projections directly. They return native observations through the application lifecycle. The [Codex adapter](../../docs/architecture/codex-adapter.md) implements native login/model discovery, scoped product tools, settings, resume, steer and cancellation; the [Muse adapter](../../docs/architecture/muse-adapter.md) uses the official SDK/MSP with isolated account/process/session state and native interactions. Both are registered explicitly. [Conversation controls, SSE and receipt recovery](../../docs/architecture/conversation-control-api.md) are implemented by NMA-053. Muse steering remains unknown after live mapping evidence; its ordinary queue is preserved. Muse subscription and live permission-decision acceptance remain open on NMA-050. Conversational goals, durable Routine scheduling and quiet publication use the same lifecycle; see the [goal/Routine contract](../../docs/architecture/goals-routines-api.md).

NMA-054 enables confined native coding on Codex. Muse uses scoped product file tools; direct native file/shell/code/Git capabilities are unsupported in that adapter configuration. See the [verification and platform limits](../../docs/verification/nma-054/README.md).

Browser resources use direct browser-use MCP on a backend-owned headful Linux host with private profiles and view-only VNC. Build the explicit development image before using a granted profile. See the [browser API and host contract](../../docs/architecture/browser-session-api.md) and [verification evidence](../../docs/verification/nma-058/README.md). This does not advance the API-wide/UI/installer gates.
