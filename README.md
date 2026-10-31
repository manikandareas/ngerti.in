# Ngertiin

Ngertiin is a persistent agent workspace for one human owner, private DMs, groups, automatic goals and Routine. The active product scope and acceptance are maintained in [Ngertiin Multi Agent](https://app.notion.com/p/402abdd6187381e3a720f4b01d824e1a) and its [backlog](https://app.notion.com/p/116e1edcee864b5da91887466d728aac).

The harness-first backend uses **Bun, TypeScript, Elysia and SQLite**. One application authority owns identity, admission, queue state, events, stop intent and recovery. Background scheduler and dispatcher modules run in that service. Codex App Server and the Muse SDK/MSP adapter supply native execution. Muse subscription and native permission acceptance remain open on NMA-050. No Hermes executor or fallback is started.

## Development

Requirements: Bun **1.3.10** and `make`. PostgreSQL, Docker, Python, provider credentials and a browser are not required for foundation startup.

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

The default bootstrap registers **two native executors: Codex and Muse**. Select a connection, complete its own login, inspect models, then open the agent/thread session before admitting work. See the [Codex adapter guide](docs/architecture/codex-adapter.md) and [Muse adapter guide](docs/architecture/muse-adapter.md). Codex 0.165.0 has completed subscription-backed inference, scoped product-tool calls, resume after restart, steer and cancellation through the application API. Muse Code 1.4.14 has completed API-key/dev-credit inference, scoped product-tool round trips, native history after restart, question/answer and cancellation through the application API. Muse subscription and live permission-decision acceptance remain open. [Automatic goals and Routine](docs/architecture/goals-routines-api.md) have backend evidence. The [NMA-060 API readiness gate](docs/verification/nma-060/README.md) remains pending; exporting a contract does not open the UI phase.

## Verification

```sh
make check
bun run verify:foundation
make build
```

`make check` checks the active backend and retained web source, then runs backend contract/integration tests. The process probe starts `make dev` in temporary state, checks HTTP and scheduling, kills and restarts it, and removes only its own temporary directory. `make build` checks the retained web build; it is not new UI acceptance.

The [implementation ADR](docs/architecture/adr-0001-harness-first-foundation.md) records source provenance, runtime compatibility, storage choices and phase boundaries. [NMA-047 verification](docs/verification/nma-047/README.md) records foundation results. The [broker contract](docs/architecture/harness-broker-contract.md) and [NMA-048 verification](docs/verification/nma-048/README.md) describe executable policies, connection isolation and scoped product tools, with native adapter limitations.

## Historical source and data

`apps/engine` and the Python `apps/backend` retain historical implementations for targeted audit and later reuse. Their Hermes API, engine and provisioner entry points are retired and reject startup. They are not dependencies of the active server, installation or CI checks. Historical Compose volumes, `.env`, old runtime state and evidence are untouched. Do not treat older guides or Done records as current acceptance.

Development data does not require a migration from the historical runtime. A different `NGERTIIN_STATE_DIR` creates a fresh development installation. Existing new-runtime state must survive normal restarts; incompatible or foreign-owner databases are refused. Rollback uses a previous Git revision and verified backup, rather than a runtime fallback switch. UI work waits for NMA-060; installation on other devices waits for NMA-064.
