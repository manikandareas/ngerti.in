# Harness-first application server

Bun 1.3.10, TypeScript 7.0.2, Elysia 1.4.30 and Zod 4.4.3. Run `make dev` from the repository root. See the [root guide](../../README.md), [ADR](../../docs/architecture/adr-0001-harness-first-foundation.md) and [domain/API contract](../../docs/architecture/harness-first-contract.md).

- `contracts.ts`: versioned runtime schemas and domain types.
- `store.ts`: SQLite transactions, installation ownership, command receipts, projections and event cursor.
- `lifecycle.ts`: identity/scope, admission, queue/dispatch fencing, cancellation, basic Routine occurrences and conservative recovery.
- `conversations.ts`, `agent-instructions.ts`: atomic Tobi/DM/welcome setup, consistent conversation reads and native profile context. See the [agent/conversation API and examples](../../docs/architecture/agent-conversation-api.md).
- `workspaces.ts`, `workspace-files.ts`, `workspace-posix.ts`: scoped project binding and descriptor-relative file access; Bun compiles the fixed `workspace-openat.c` ABI wrapper.
- `artifacts.ts`: immutable bytes, explicit sharing and durable native publication. See the [workspace/artifact API](../../docs/architecture/workspace-artifact-api.md).
- `background.ts`: scheduler and bounded concurrent dispatcher; injectable executor port, explicitly registered Codex and Muse adapters.
- `harness/`: broker/client contracts, host version detection, isolated credential/process context, connection projections and scoped MCP product tools. See the [broker contract](../../docs/architecture/harness-broker-contract.md).
- `api.ts`: Elysia HTTP validation, local authentication, commands, reads and replay.
- `config.ts`, `setup.ts`, `main.ts`: development state/bootstrap and process lifetime.

Providers cannot write projections directly. They return native observations through the application lifecycle. The [Codex adapter](../../docs/architecture/codex-adapter.md) implements native login/model discovery, scoped product tools, settings, resume, steer and cancellation; the [Muse adapter](../../docs/architecture/muse-adapter.md) uses the official SDK/MSP with isolated account/process/session state and native interactions. Both are registered explicitly. [Conversation controls, SSE and receipt recovery](../../docs/architecture/conversation-control-api.md) are implemented by NMA-053. Muse steering remains unknown after live mapping evidence; its ordinary queue is preserved. Muse subscription and live permission-decision acceptance remain open on NMA-050. Automatic goals, full scheduling policies and quiet behavior remain on their owning ticket.

NMA-054 enables confined native coding on Codex. Muse uses scoped product file tools; direct native file/shell/code/Git capabilities are unsupported in that adapter configuration. See the [verification and platform limits](../../docs/verification/nma-054/README.md).
