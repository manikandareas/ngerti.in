# Ngertiin

Ngertiin is a persistent agent workspace for one human owner, private DMs, groups, automatic goals and Routine. The active product scope and acceptance are maintained in [Ngertiin Multi Agent](https://app.notion.com/p/402abdd6187381e3a720f4b01d824e1a) and its [backlog](https://app.notion.com/p/116e1edcee864b5da91887466d728aac).

The harness-first backend uses **Bun, TypeScript, Elysia and SQLite**. One application authority owns identity, admission, queue state, events, stop intent and recovery. Background scheduler and dispatcher modules run in that service. Codex App Server and the Muse SDK/MSP adapter supply native execution. Muse native interaction acceptance is verified; subscription remains unverified and is excluded from the explicitly accepted API-key billing scope. No Hermes executor or fallback is started.

## Development

Requirements: Bun **1.3.10** and `make` for foundation startup. The shared Linux desktop also requires Docker. Run `bun run setup:machine` once, then `bun run dev:api` and `bun run dev:web-client`. See the [shared-machine setup and verification](docs/verification/shared-machine/README.md). PostgreSQL and Python are not required.

```sh
make install
make setup
make dev
```

The API listens on `127.0.0.1:8000`. State defaults to `.dev/harness-first/`. Override `NGERTIIN_PORT` or `NGERTIIN_STATE_DIR` when needed; see [.env.example](.env.example). `APP_ENV` must be `development`. `make api`, `bun run dev`, `bun run dev:api` and the compatibility `python3 scripts/dev.py` all start the same server.

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
```

`make check` checks the active backend and retained web source, then runs backend contract/integration tests. The process probe starts `make dev` in temporary state, checks HTTP and scheduling, kills and restarts it, and removes only its own temporary directory. `make build` checks the retained web build; it is not new UI acceptance.

The [implementation ADR](docs/architecture/adr-0001-harness-first-foundation.md) records source provenance, runtime compatibility, storage choices and phase boundaries. [NMA-047 verification](docs/verification/nma-047/README.md) records foundation results. The [broker contract](docs/architecture/harness-broker-contract.md) and [NMA-048 verification](docs/verification/nma-048/README.md) describe executable policies, connection isolation and scoped product tools, with native adapter limitations.

## Historical source and data

The retired `apps/backend` and `apps/engine` directories have been removed, including their local virtual environments, caches, bytecode and downloaded runtime archive. Remaining notices and historical READMEs are preserved in the [retired runtime archive](docs/archive/retired-python-runtime/README.md). Obsolete Python/Hermes source, dependency locks and build/configuration tooling were retired earlier. The [retirement manifest](docs/verification/nma-060/completion/retirement.json) records the exact prior Git revision, verified local archive and file hashes. Historical scripts require that separate historical checkout. Databases, Docker resources, `.env`, runtime state, provenance notices and evidence are untouched. The active server has no Hermes fallback.

Development data does not require a migration from the historical runtime. A different `NGERTIIN_STATE_DIR` creates a fresh development installation. Existing new-runtime state must survive normal restarts; incompatible or foreign-owner databases are refused. Rollback uses a previous Git revision and verified backup, rather than a runtime fallback switch. The engine/API gate is complete; UI implementation and installation on other devices remain separate phases.

## Tauri development app

The macOS ARM64 development desktop uses Tauri v2, reuses the web client, and manages the local Bun backend lifecycle. Building it requires Rust stable (minimum 1.90) and Xcode Command Line Tools in addition to Bun:

```sh
bun run setup:desktop
bun run dev:desktop
bun run package:desktop
```

See [desktop setup and lifecycle](docs/architecture/tauri-development.md) and [verification boundaries](docs/verification/tauri-development/README.md). The [Electron baseline](docs/architecture/electron-development.md) remains available through explicit `dev:electron` and `package:electron` scripts.
