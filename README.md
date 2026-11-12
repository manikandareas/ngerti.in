# Ngertiin

Ngertiin is a persistent agent workspace for one human owner, private DMs, groups, automatic goals and Routine. The repository owns [product scope](PRODUCT.md), [acceptance](docs/development/acceptance.md), and [the local backlog](docs/backlog/README.md). See [the documentation index](docs/README.md).

The harness-first backend uses **Bun, TypeScript, Elysia and PostgreSQL**. One application authority owns identity, admission, queue state, events, stop intent and recovery. Background scheduler and dispatcher modules run in that service. Codex App Server and the Muse SDK/MSP adapter supply native execution. Muse native interaction acceptance is verified; subscription remains unverified and is excluded from the explicitly accepted API-key billing scope. No Hermes executor or fallback is started.

## Development

Requirements: Bun **1.3.10**, PostgreSQL **18.1** and `make` for foundation startup. The shared Linux desktop also requires Docker. Run `bun run setup:machine` once, then `bun run dev:api` and `bun run dev:web-client`. See the [shared-machine setup and verification](docs/verification/shared-machine/README.md). Configure `NGERTIIN_DATABASE_URL` in the private environment before setup. See [PostgreSQL persistence and controlled import](docs/architecture/postgresql-persistence.md).

```sh
make install
make setup
make dev
```

The API listens on `127.0.0.1:8000`. State defaults to `.dev/harness-first/`. Override `NGERTIIN_PORT` or `NGERTIIN_STATE_DIR` when needed; see [.env.example](.env.example). `APP_ENV` must be `development`. `make api`, `bun run dev` and `bun run dev:api` all start the same server. See the [documentation index](docs/README.md) for current guides and evidence.

The bootstrap creates a stable owner UUID and private bearer token in `installation.json` with mode `0600`. Use that token in `Authorization: Bearer <token>` for API requests. Durable domain commands, including steer, also require a UUID `Idempotency-Key`. Native login/inspection/session operations have separate request semantics. The [consumer contract](docs/architecture/api-consumer-contract.md) describes these boundaries. The startup log names the credentials file without printing its token. Local bearer access is a development boundary, not the deferred full login/pairing implementation.

- `GET /health/live`: process liveness.
- `GET /health/ready`: foundation readiness and the number of registered executors.
- `GET /v1/contracts`: versioned entity, command, event, HTTP request and consumer projection schemas, product tools and protocol semantics.
- `GET /v1/events?after=0&limit=100`: durable event replay with a cursor.
- See the [API and lifecycle contract](docs/architecture/harness-first-contract.md) for foundation commands and invariants.

The default bootstrap registers **two native executors: Codex and Muse**. Select a connection, complete its own login and inspect models before admitting work. See the [Codex adapter guide](docs/architecture/codex-adapter.md) and [Muse adapter guide](docs/architecture/muse-adapter.md). The [NMA-060 engine/API gate](docs/verification/nma-060/final-cohort/README.md) is verified for Codex 0.166.0 with ChatGPT subscription and Muse 1.4.14-R7309.1 with explicitly selected API-key billing. Muse subscription remains unverified and is explicitly excluded from this accepted scope. Native interactions, scoped tools, mixed groups, restart/cancellation, [automatic goals and Routine](docs/architecture/goals-routines-api.md), the original browser/VNC path, Composio and supported image input have recorded evidence. The [shared-machine amendment](docs/verification/shared-machine/README.md) verifies contract 1.29.0, Cua desktop/file/process tools, human takeover and the current Computer/Library UI. API readiness remains separate from installed harness availability, remote installation and production readiness.

## Verification

```sh
make check
bun run verify:foundation
make build
make docs-check
```

`make check` lints and typechecks the active backend and `apps/web-client`, then runs backend contract/integration tests. The foundation probes exercise PostgreSQL lifecycle, HTTP/bootstrap, commit-order races, authority loss/SIGKILL, SQLite import and verified restore. Backend tests provision and remove an isolated disposable PostgreSQL container unless `NGERTIIN_TEST_DATABASE_URL` explicitly supplies a disposable database. `make build` builds the shared web client used by Tauri; `bun run package:desktop` builds the native application.

The [implementation ADR](docs/architecture/adr-0001-harness-first-foundation.md) records source provenance, runtime compatibility, storage choices and phase boundaries. [NMA-047 verification](docs/verification/nma-047/README.md) records foundation results. The [broker contract](docs/architecture/harness-broker-contract.md) and [NMA-048 verification](docs/verification/nma-048/README.md) describe executable policies, connection isolation and scoped product tools, with native adapter limitations.

## Historical source and data

The retired `apps/backend` and `apps/engine` directories, obsolete V1 product/backlog mirrors, old runtime guides and scripts, and replaced design prototypes have been removed. Retired source and the removed archive can be inspected through [historical Git recovery](docs/development/history.md). The [retirement manifest](docs/verification/nma-060/completion/retirement.json) records the runtime source revision and backup hashes; [historical recovery](docs/development/history.md) identifies the pre-cleanup documentation and tooling snapshot. Raw evidence, contract snapshots, databases, Docker resources, `.env`, runtime state and provenance notices are preserved. The active server has no Hermes fallback.

Development data does not require a migration from the historical runtime. A fresh development installation requires both its own `NGERTIIN_STATE_DIR` and a fresh PostgreSQL schema. Existing SQLite state requires the explicit offline import procedure above; startup does not migrate or reset it. Existing new-runtime state must survive normal restarts; incompatible or foreign-owner databases are refused. Rollback uses a previous Git revision and verified backup, rather than a runtime fallback switch. The engine/API gate is complete; UI implementation and installation on other devices remain separate phases.

## Tauri development app

The macOS ARM64 development desktop uses Tauri v2, reuses the web client, and manages the local Bun backend lifecycle. Building it requires Rust stable (minimum 1.90) and Xcode Command Line Tools in addition to Bun:

```sh
bun run setup:desktop
bun run dev:desktop
bun run package:desktop
```

See [desktop setup and lifecycle](docs/architecture/tauri-development.md) and [verification boundaries](docs/verification/tauri-development/README.md). Tauri is the only desktop implementation. The retired Electron host and legacy `apps/web` workspace are available in Git at `6de957e7145c0367a52b10f5fd19bbd91c50e458`; historical research and verification evidence retain their original scope.

Run `bun run test:desktop`, `bun run typecheck:desktop` and `bun run lint:desktop` for native lifecycle tests, Rust checks and desktop tooling validation. See the [cleanup verification](docs/verification/tauri-cleanup-2026-11-05.md) for the removal scope and current checks.
