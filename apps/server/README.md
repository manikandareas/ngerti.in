# Harness-first application server

Bun 1.3.10, TypeScript 7.0.2, Elysia 1.4.30 and Zod 4.4.3. Run `make dev` from the repository root. See the [root guide](../../README.md), [ADR](../../docs/architecture/adr-0001-harness-first-foundation.md) and [domain/API contract](../../docs/architecture/harness-first-contract.md).

- `contracts.ts`: versioned runtime schemas and domain types.
- `store.ts`: SQLite transactions, installation ownership, command receipts, projections and event cursor.
- `lifecycle.ts`: identity/scope, admission, queue/dispatch fencing, cancellation, basic Routine occurrences and conservative recovery.
- `background.ts`: scheduler and bounded concurrent dispatcher; injectable executor port, explicitly registered Codex adapter.
- `harness/`: broker/client contracts, host version detection, isolated credential/process context, connection projections and scoped MCP product tools. See the [broker contract](../../docs/architecture/harness-broker-contract.md).
- `api.ts`: Elysia HTTP validation, local authentication, commands, reads and replay.
- `config.ts`, `setup.ts`, `main.ts`: development state/bootstrap and process lifetime.

Providers cannot write projections directly. They return native observations through the application lifecycle. The [Codex adapter](../../docs/architecture/codex-adapter.md) implements native login/model discovery, scoped product tools, settings, resume, steer and cancellation; the default bootstrap registers it explicitly. Muse remains NMA-050. Automatic goals, full scheduling policies, conversational controls and quiet behavior are completed by their owning tickets.
