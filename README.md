# Ngertiin

Persistent agents collaborate with one user through private DMs and groups, capture goals from conversation, and continue work through durable schedules, events and handoffs.

The multi-agent engine is the only execution path. Hermes owns admission, sessions, scheduling, cancellation and recovery. The product API authenticates accounts and forwards commands to their isolated engine partitions. There is no legacy/pivot mode or fallback executor.

Product decisions and acceptance are maintained in [Ngertiin Multi Agent](https://app.notion.com/p/402abdd6187381e3a720f4b01d824e1a) and its [backlog](https://app.notion.com/p/116e1edcee864b5da91887466d728aac).

## Development

1. Copy `.env.example` to `.env` and configure Clerk and PostgreSQL.
2. Run `make install`, `make infra-up`, and `make setup`.
3. Provision one pinned Hermes gateway and private socket/key registry per account using [the engine guide](apps/engine/README.md). Keep engine credentials server-side.
4. Run `make dev` for the product API and web. Open `http://localhost:3000`; the home route opens agents. The gateway runs separately with its own Python/runtime environment. There is no product worker process.

`make check` runs static checks; `make build` builds the web application. Runtime acceptance, backup/restore and retirement evidence are recorded in [the acceptance and transition report](docs/research/nma-025-026-acceptance-cutover.md).

## State and rollback

PostgreSQL accounts, billing history, historical application tables and historical objects are preserved. Historical schema migrations remain immutable; their presence does not enable a retired engine. Do not drop volumes or apply migration downgrades as cleanup.

The current engine owns complete owner-scoped SQLite partitions. Backups must cover native/product stores, external workspace state and secret references. Restores are quarantined until reconciliation. Rollback uses an isolated previous Git revision and a verified backup, preserving all data written after cutover; it is not a runtime mode switch.

The original Compose project name is retained solely to keep existing named volumes attached. MinIO holds historical objects; current text artifacts live in the owner partition. Old documentation under `docs/product`, `docs/backlog` and older engineering/research reports is historical evidence, not the current product contract.
