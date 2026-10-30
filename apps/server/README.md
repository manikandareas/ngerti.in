# Harness-first application server

Bun 1.3.10, TypeScript 7.0.2, Elysia 1.4.30 and Zod 4.4.3. Run `make dev` from the repository root. See the [root guide](../../README.md), [ADR](../../docs/architecture/adr-0001-harness-first-foundation.md) and [domain/API contract](../../docs/architecture/harness-first-contract.md).

- `contracts.ts`: versioned runtime schemas and domain types.
- `store.ts`: SQLite transactions, installation ownership, command receipts, projections and event cursor.
- `lifecycle.ts`: identity/scope, admission, queue/dispatch fencing, cancellation, basic Routine occurrences and conservative recovery.
- `background.ts`: scheduler and bounded concurrent dispatcher; injectable executor port, no default native executor.
- `api.ts`: Elysia HTTP validation, local authentication, commands, reads and replay.
- `config.ts`, `setup.ts`, `main.ts`: development state/bootstrap and process lifetime.

Providers cannot write projections directly. They must return native observations through the application lifecycle. Protocol/account/capability handling and structured product-tools belong to NMA-048–050. Automatic goals, full scheduling policies, conversational controls and quiet behavior are completed by their owning tickets.
