# Ngertiin

Ngertiin is a persistent agent workspace with authenticated accounts, organizations, organization-local roles and Workgroups, private and Team agents, DMs, groups, automatic goals and Routine. The current implementation uses `apps/server`, `apps/web-client`, `apps/desktop` (Tauri) and `packages/avatar`. The repository owns [product scope](PRODUCT.md), [acceptance](docs/development/acceptance.md), and [the local backlog](docs/backlog/README.md). See [the documentation index](docs/README.md).

The harness-first backend uses **Bun, TypeScript, Elysia and PostgreSQL**. One application authority owns identity, admission, queue state, events, stop intent and recovery. Background scheduler and dispatcher modules run in that service. Codex App Server and the Muse SDK/MSP adapter supply native execution. Muse native interaction acceptance is verified; subscription remains unverified and is excluded from the explicitly accepted API-key billing scope. No Hermes executor or fallback is started.

## Development

Requirements: Bun **1.3.10**, PostgreSQL **18.1**, Rust stable (minimum 1.90) and Xcode Command Line Tools for Tauri. Configure `NGERTIIN_DATABASE_URL`. `bun dev` starts the API, web, Tauri and the local email inbox together. Account authentication and organizations are always enabled. See [authentication defaults](docs/architecture/user-authentication.md) and [PostgreSQL persistence](docs/architecture/postgresql-persistence.md).

The persistent local OrbStack database uses [compose.postgres.local.yml](compose.postgres.local.yml), a dedicated volume and loopback port 55472. With its matching private credentials in `.env`, run `docker --context orbstack compose -f compose.postgres.local.yml up -d`. The separate `compose.postgres.yml` remains disposable verification infrastructure.

```sh
make install
make setup
make dev
```

The API listens on `127.0.0.1:8000`, web/auth origin on `http://127.0.0.1:3001`, and inbox on `http://127.0.0.1:8025`. Tauri uses the same web development server through its native gateway. State defaults to `.dev/harness-first/`; the development desktop has a separate `.dev/development-client` profile. See [.env.example](.env.example) for ports and state. `bun run dev:api` and `bun run dev:web-client` start individual services. Ctrl+C stops only the launcher's children; quitting Tauri leaves server and web running until Ctrl+C.

Authentication always uses verified user accounts and revocable browser/native sessions. Development creates a private persistent authentication secret and delivers verification, recovery and invitations to the local inbox at `http://127.0.0.1:8025`; no Resend credentials are required. The first verified local account becomes the initial Owner. Production requires an explicit HTTPS origin, secret and Resend credentials. The auth-mode selector and installation-token authentication are removed. See [user authentication](docs/architecture/user-authentication.md) and [Tauri account sessions](docs/architecture/tauri-remote-client.md). Domain commands retain UUID idempotency keys.

- `GET /health/live`: process liveness.
- `GET /health/ready`: foundation readiness and the number of registered executors.
- `GET /v1/contracts`: versioned entity, command, event, HTTP request and consumer projection schemas, product tools and protocol semantics.
- `GET /v1/events?after=0&limit=100`: durable event replay with a cursor.
- See the [API and lifecycle contract](docs/architecture/harness-first-contract.md) for foundation commands and invariants.

The default bootstrap registers **two native executors: Codex and Muse**. Select a connection, complete its own login and inspect models before admitting work. See the [Codex adapter guide](docs/architecture/codex-adapter.md) and [Muse adapter guide](docs/architecture/muse-adapter.md). The [NMA-060 engine/API gate](docs/development/history.md#verification-archive--2026-11-17 "Archive: docs/verification/nma-060/final-cohort/README.md at 043f7c9") is verified for Codex 0.166.0 with ChatGPT subscription and Muse 1.4.14-R7309.1 with explicitly selected API-key billing. Muse subscription remains unverified and is explicitly excluded from this accepted scope. Native interactions, scoped tools, mixed groups, restart/cancellation, [automatic goals and Routine](docs/architecture/goals-routines-api.md), the original browser/VNC path, Composio and supported image input have recorded evidence. The [shared-machine amendment](docs/development/history.md#verification-archive--2026-11-17 "Archive: docs/verification/shared-machine/README.md at 043f7c9") verifies contract 1.29.0, Cua desktop/file/process tools, human takeover and the current Computer/Library UI. API readiness remains separate from installed harness availability, remote installation and production readiness.

## Verification

For daily iterations, follow the [development loop](AGENTS.md#development-loop): implement the change, exercise the affected flow in the running app with computer use or focused API calls, and report the result. Choose the commands below individually when they help verify the change.

```sh
make check
bun run verify:foundation
make build
```

`make check` lints and typechecks the active backend and `apps/web-client`, then runs backend contract/integration tests. The foundation probes exercise PostgreSQL lifecycle, HTTP/bootstrap, commit-order races, authority loss/SIGKILL, SQLite import and verified restore. Backend tests provision and remove an isolated disposable PostgreSQL container unless `NGERTIIN_TEST_DATABASE_URL` explicitly supplies a disposable database. `make build` builds the shared web client used by Tauri; `bun run package:desktop` builds the native application.

The [implementation ADR](docs/architecture/adr-0001-harness-first-foundation.md) records source provenance, runtime compatibility, storage choices and phase boundaries. [NMA-047 verification](docs/development/history.md#verification-archive--2026-11-17 "Archive: docs/verification/nma-047/README.md at 043f7c9") records foundation results. The [broker contract](docs/architecture/harness-broker-contract.md) and [NMA-048 verification](docs/development/history.md#verification-archive--2026-11-17 "Archive: docs/verification/nma-048/README.md at 043f7c9") describe executable policies, connection isolation and scoped product tools, with native adapter limitations.

## Historical source and data

The owner removed `docs/verification` from the working tree. Its complete contents remain in [local Git history](docs/development/history.md#verification-archive--2026-11-17); required fixtures and license notices remain with the code or development guides. Verification scripts write new generated results to ignored `.dev/verification`.

The retired `apps/backend` and `apps/engine` directories, obsolete V1 product/backlog mirrors, old runtime guides and scripts, and replaced design prototypes have been removed. Retired source and the removed archive can be inspected through [historical Git recovery](docs/development/history.md). The [retirement manifest](docs/development/history.md#verification-archive--2026-11-17 "Archive: docs/verification/nma-060/completion/retirement.json at 043f7c9") records the runtime source revision and backup hashes; [historical recovery](docs/development/history.md) identifies the pre-cleanup documentation and tooling snapshot. Raw evidence, contract snapshots, databases, Docker resources, `.env`, runtime state and provenance notices are preserved. The active server has no Hermes fallback.

Development data does not require a migration from the historical runtime. A fresh development installation requires both its own `NGERTIIN_STATE_DIR` and a fresh PostgreSQL schema. Existing SQLite state requires the explicit offline import procedure above; startup does not migrate or reset it. Existing new-runtime state must survive normal restarts; incompatible or foreign-owner databases are refused. Rollback uses a previous Git revision and verified backup, rather than a runtime fallback switch. The engine/API gate is complete; UI implementation and installation on other devices remain separate phases.

## Tauri development app

The macOS ARM64 desktop uses Tauri v2 as an account-authenticated server client. It reuses the web UI and keeps renewal credentials in Keychain. The development launcher owns the local server; Tauri never reads installation credentials, supervises a backend or starts a machine. The packaged client contains UI assets without Bun or backend source.

```sh
bun dev
bun run package:desktop
```

See [desktop setup and lifecycle](docs/architecture/tauri-development.md) and [verification boundaries](docs/development/history.md#verification-archive--2026-11-17 "Archive: docs/verification/tauri-development/README.md at 043f7c9"). Tauri is the only desktop implementation. The retired Electron host and legacy `apps/web` workspace are available in Git at `6de957e7145c0367a52b10f5fd19bbd91c50e458`; historical research and verification evidence retain their original scope.

Run `bun run test:desktop`, `bun run typecheck:desktop` and `bun run lint:desktop` for native lifecycle tests, Rust checks and desktop tooling validation. See the [cleanup verification](docs/development/history.md#verification-archive--2026-11-17 "Archive: docs/verification/tauri-cleanup-2026-11-05.md at 043f7c9") for the removal scope and current checks.

Web onboarding, organization management and secure Tauri remote sessions are implemented under NMA-080/NMA-081, with [focused integrated evidence](docs/development/history.md#verification-archive--2026-11-17 "Archive: docs/verification/nma-083/README.md at 043f7c9"). GPUI/desktop-rs implementations, their local skills and dedicated build caches were removed on November 15. See [cleanup verification](docs/development/history.md#verification-archive--2026-11-17 "Archive: docs/verification/desktop-retirement-2026-11-15/README.md at 043f7c9") and [historical source recovery](docs/development/history.md); earlier evidence keeps its original scope.
