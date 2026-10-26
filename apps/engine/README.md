# Ngertiin agent engine

This is the only product execution engine. The pinned Hermes gateway owns admission, sessions, scheduling, cancellation, handoffs and recovery; the backend is an authenticated transport and trusted E2B actuator. There is no legacy runtime switch or fallback executor.

## Runtime and provenance

Use Python 3.14.9 and the pinned [Hermes source](https://github.com/NousResearch/hermes-agent/tree/7489b22af47ce91b366dde81d5831ea422577498), commit `7489b22af47ce91b366dde81d5831ea422577498`, MIT. Startup verifies `src/ngertiin_engine/runtime-pin.json`. The adapter subclasses the native gateway at bootstrap without patching upstream source. Keep one process and an exclusively owned local state volume per account; do not share SQLite across replicas or network filesystems.

`fetch_runtime.py` verifies the source archive. `build_runtime.py` builds the foundation profile from upstream locks. The Docker `foundation` target is the application environment; `verify`/`evidence` are separate test environments. The foundation excludes pillow-heif and fetch-use/browser-harness for the recorded packaging/license reasons; it includes the supplemental firecrawl-anydoc notice. The trusted E2B actuator has a separately provisioned environment. See [packaging evidence](../../docs/research/nma-006-packaging-closure.md) and `notices/provenance.json`. Never imply excluded native capabilities are shipped.

## Local development

Apply `make migrate` before starting the updated API. `make dev` starts the durable backend account provisioner through `scripts/dev_engine.py`, alongside API/web. First authenticated access upserts the account and enqueues setup transactionally. No `NMA_DEV_OWNER_IDS` list is needed. Configure `NMA_PARTITIONS_FILE`, `HERMES_SOURCE` and `NMA_RUNTIME_PYTHON` from `.env.example`. The provisioner prepares an owner partition, starts the pinned gateway, verifies its signed transport and commits Tobi plus a primary DM and authored welcome. Keys/state survive retries and restarts; missing previously registered state is an operator error, never permission to recreate an empty partition. Hermes remains the only run/session/goal scheduler.

For a fresh machine, install the pinned source and runtime:

```sh
python3 apps/engine/fetch_runtime.py .dev/hermes.tar.gz --extract .dev/nma-001/source
uv run --python 3.14.9 python apps/engine/build_runtime.py --source .dev/nma-001/source --out .dev/nma-040/production
```

Restart `make dev` after `.env` changes. Production uses the isolated partition-driver contract below.

The local capability catalog includes Task list (`todo`), Files, and Browser when E2B is configured.
New Tobi instances receive Task list and Files, plus Browser when configured. Catalog availability does not silently change an
existing agent's grants. MCP connections and instruction skills require an operator-provided catalog.

## Provision one account partition

Server-controlled environment:

- `HERMES_SOURCE`: verified source directory.
- `HERMES_HOME`: short, exclusive account directory, for example `/state/account`.
- `NMA_OWNER_ID`: authenticated PostgreSQL account UUID.
- `NMA_SERVICE_KEY_FILE`: private file containing at least 32 random bytes.
- `NMA_MODELS_FILE`: private JSON catalog mapping model IDs to label/model/provider/base_url/cwd.
- `NMA_CAPABILITIES_FILE`: private tool, MCP and skill catalog; omitted grants confer no capability.
- Provider credentials: private process environment, never browser fields or model instructions.
- `NMA_WEBHOOK_ROUTES_FILE`: optional private route/credential bindings for durable event ingress.
- `NMA_COMPUTER_COMMAND`: optional JSON argv for the trusted one-shot actuator, such as an absolute backend Python path followed by `-m`, `ngertiin.agent_engine.computer_bridge`.

The backend's `NMA_PARTITIONS_FILE` maps account UUIDs to `{ "socket": "/state/account/nma.sock", "key_file": "/secrets/account-key" }`. No account-provided owner/path is trusted. Unprovisioned accounts return `ENGINE_UNAVAILABLE`. The optional `NMA_BINDINGS_FILE` remains a contract-test bootstrap fixture; production agent identity/configuration uses the gateway's durable domain API.

Example model catalog:

```json
{"research":{"label":"Research model","model":"configured-model","provider":"custom","base_url":"https://provider.example/v1","cwd":"/workspace"}}
```

Example capabilities:

```json
{"tool_grants":{"files":{"enabled":true,"label":"Files","toolset":"nma_workspace"},"browser":{"enabled":true,"label":"Browser","toolset":"nma_computer"}},"mcp_grants":{},"skill_refs":{}}
```

Start with the pinned runtime interpreter and `apps/engine/src` on `PYTHONPATH`:

```sh
python -m ngertiin_engine.service
```

Profiles/owner IDs are not OS sandboxes. Isolate state and credentials at the host/container boundary. The container recipe uses UID 10001; it does not bundle the backend actuator interpreter. E2B ingress remains private. No arbitrary shell or host path tool is enabled by these grants.

## Current product contracts

The authenticated namespace is `/api/agent-engine/v1`. Public commands include agent lifecycle/configuration, DM/group creation, membership, message send, run cancel, goal pause/stop/resume/reopen and explicit artifact share/revoke. Agent configuration is revision-checked and shared across DM/group identities; histories, context and private memory remain scoped. Model/capability catalog IDs resolve server-side.

Stable command IDs and canonical bodies provide retry identity. Retry an uncertain acknowledgment using the same command ID; changing the body conflicts. Counters and cursors are decimal strings. Snapshot plus durable SSE replay never re-admits model work. Completed messages replace drafts by stable identity.

Goals are captured and revised by the ordinary agent responsibility tools. Durable generations fence paused/stopped goals, stale triggers and descendants. Native room policy handles group mentions and handoffs. Schedules, heartbeat and webhook ingress continue offline under the same gateway authority. Intentional `[SILENT]` background responses settle without notification; they do not pause goals.

External effects distinguish known receipts from indeterminate outcomes. Unknown effects are never blindly retried. Capability/member/context revocation rechecks queued and in-flight boundaries. Run diagnostics correlate trigger, goal, handoff, transcript, effects and provider token/cost receipts; unknown cost is not invented.

Artifacts are immutable UTF-8 files up to 1 MiB in the owner SQLite partition, with producing run/agent/thread, hash and explicit scope. Downloads are authenticated. Computer workspaces are owner/thread scoped; E2B pause persists filesystem state, not RAM/CDP/tabs. `/tmp` is scratch; re-observe after restore. Explicit resource delete is terminal for that workspace. Tool effects settle once their outcome is known: refused dispatches record error receipts and their runs answer normally, while unknown actuator outcomes keep their dispatching evidence and are never replayed. `computer.reconcile` queries durable dispatch receipts without repeating actions. Only a matching provider receipt proving completed execution or a guarded no-input rejection resolves an unknown mutation; missing or unrelated receipts leave it blocked. Safe observation remains available, and an observation failure does not undo an already completed action.


## Native session fidelity and recovery

The integration boundary and ordered wrappers live in `integration.py`; startup verifies the exact pin and required signatures before installation. The gateway installs product epoch/readiness fences before recovered turns can execute. Native admission, claim gates, event streams and shutdown remain authoritative. Accepted socket requests are shielded from client disconnect; command IDs and native mutation receipts reconcile lost acknowledgements.

Native typed history, including tool/result metadata and compression markers, is canonical. Product context adds scoped persona/memory/artifacts, explicit instructions and peer updates; it does not rebuild history from visible message text. Each owner/agent/thread has a stable logical session ID. A changed configuration starts a new native binding and seeds its authorized native lineage once. Revoked context generations never become its parent. A reset advances native lineage while preserving product identity, completed history and goals.

Optional agent `config.session` accepts `max_turns` (`null` or `0` means native unlimited), `compression` (`enabled`, `threshold`, `threshold_tokens`, `micro_compact`, `micro_compact_every_n_turns`, `micro_compact_defrag_threshold_tokens`) and `context_engine: "compressor"`. Positive finite turn limits expose `turn_exit_reason` and `continuation_required` instead of silently truncating work. Context-engine import paths and uninstalled plugins are refused. The task-local frozen policy feeds the native config-reader snapshot for both in-process main turns and auxiliary compression. No model loop or compressor is implemented here.

Authenticated `GET /threads/{thread_id}/session?agent_id=...` inspects native revision/generation and product lineage. `session.compress` and `session.reset` require that native session ID, revision and execution generation, plus an unchanged command ID on retry. They use native mutation receipts and per-session mutation gates; a summary LLM never holds the product-wide command lock. The conversation UI exposes both operations and retains the exact pending command in owner/thread-scoped session storage across uncertain responses, page reloads and transient authentication failures.

Context references use the pinned pure parser but never expand on the gateway host. Relative paths, HTTPS egress, generation checks, symlink containment and project-instruction precedence form the workspace resolver contract. Until NMA-031 connects that resolver, references return `WORKSPACE_REFERENCE_UNAVAILABLE`; composer completion remains NMA-038. Product persona/explicit instructions precede workspace instructions, and attached bytes remain data.

Schema 15 adds logical lineage, effect outcome receipts and goal work-unit outcomes without changing historical migration checksums. Unknown historical computer errors are inventoried as unresolved while their receipt bytes remain intact. Effect evidence separates intent, dispatch, completed/rejected/unknown execution and subsequent observation. Known receipts are reused; unknown mutations block further writes while explicitly safe reads remain available. Arbitrary shell/browser batches have mutation semantics and are never automatically replayed. Browser code receives a pure Python syntax check before dispatch; compilation never executes it. Invalid synchronous syntax is a repairable pre-dispatch refusal with useful line/error context. A runtime exception, including a raised SyntaxError after earlier work, remains unknown. Goal unit outcomes retain verdict, receipt references and continuation children; stop/pause fences survive recovery.

See [runtime/session/recovery acceptance](../../docs/research/nma-029-runtime-session-recovery.md) for verification, failed attempts, scope boundaries and disposable migration/rollback evidence.

## Native capabilities and inference routing

See [native capability/routing acceptance and operator procedures](../../docs/research/nma-030-native-capabilities-routing.md) for the exact pin, deployment boundaries, real-provider results and failed attempts. The [version-2 catalog template](config/capabilities-v2.example.json) publishes conservative new-agent grants; apply them through `NMA_DEFAULT_GRANTS`. Existing agents are never retemplated. Native registry bundles expose dependency/schema/readiness diagnostics. Agent grants remain explicit; installed images and plugins confer no access by themselves.

Native shell/browser handlers require a verified immutable `scoped_linux` image. Build `native-tools.Dockerfile` over the recorded NMA-028 base and notices, configure its exact image ID, then enable only reviewed bundles. These secret-free capsules are isolated native tool actuators; Hermes still owns all execution and recovery. Reviewed gateway plugins use the separate `trusted_plugin` surface and the offline `python -m ngertiin_engine.plugins inspect/install/enable/disable` workflow. Updates require a stopped, drained gateway. Live catalog revocation fences new effects first.

Optional `config.inference.version: 1` adds validated generation parameters, ordered `fallback_models`, `auxiliary` compression/vision/review selections, OpenRouter `provider_routing`, compatible `credential_pool` selections and native `moa` references. All selections are NMA-040 owner-local connection/model IDs. Admission freezes configuration and connection generations; credentials stay in the vault. Native fallback/pool/MoA behavior uses the same scoped transport and attributes each participating connection/model. Unsupported parameters return `INVALID_INFERENCE_CONFIGURATION` with a field/reason rather than being dropped. The Agents editor exposes the supported progressive controls.

For real native isolation verification, set `NMA_TEST_NATIVE_IMAGE` to the built immutable image ID when running `pytest apps/engine/tests/test_native_isolation.py`. The regular full suite explicitly skips that test without the opt-in. Provider-live and Clerk walkthrough evidence are separate from fixture counts and release SLOs.

## Backup, migration and rollback

Current extension schema is 15. Migrations are additive and checksum-versioned; incompatible versions fail closed. Stop ingress and the gateway before backup. The backup tool holds native profile locks, copies the complete partition, normalizes copied WAL stores, checks integrity/foreign keys and records file hashes and table counts:

```sh
python -m ngertiin_engine.backup backup /state/account /backup/account-snapshot
python -m ngertiin_engine.backup restore /backup/account-snapshot /state/restored --owner ACCOUNT_UUID
```

Restore requires a new directory, verifies the owner/inventory/hash, and writes `nma-restore-quarantine.json`. The service refuses to start while this marker exists. An operator must reconcile active work, pending triggers, effect receipts, external resources and exclusive ownership before removing the marker. Backup external files/objects and secrets separately. Keep backup directories private.

The API package provides an explicit account-persona migration plan and idempotent default-agent creation. Historical transcripts/goals/files/checkpoints remain in their original archive; no old proposal or queued effect is activated. Full procedure, data mapping and rollback are in [ADR-06 and acceptance](../../docs/research/nma-025-026-acceptance-cutover.md). Rollback uses a separate prior Git revision and verified backup while preserving all post-cutover state. Never drop extension tables or share one partition between versions.

## Verification

Run `pytest apps/engine/tests` in the test environment with `HERMES_SOURCE`, `PYTHONPATH` and `NMA_TEST_RUNTIME_PYTHON` pointing to the pinned source and foundation interpreter. Live model, E2B and Chromium cases are explicit opt-ins. Do not run multiple native gateway suites concurrently on the same host lock namespace.

The [acceptance report](../../docs/research/nma-025-026-acceptance-cutover.md) distinguishes deterministic gateway tests, real provider tests, browser harness evidence and deployment limits. Runtime `production_ready: false` is a release-readiness declaration pending operational release gates, not an alternate execution mode.

## Automatic account setup and conversation APIs

See [the Tobi delivery report](../../docs/research/tobi-account-conversations.md) for contracts, migration, validation and limitations. Run the production backend process with:

```sh
uv run --project apps/backend python -m ngertiin.agent_engine.provisioner
```

The production `NMA_PARTITION_DRIVER` is a trusted absolute JSON argv. The provisioner appends only the verified account UUID. The driver must idempotently start or locate an isolated gateway under a supervisor, preserve existing volumes/keys and restore quarantine, and output one JSON object with absolute `socket` and `key_file` paths. It must not leave the gateway dependent on the short-lived driver's stdout pipe, replace existing state, or start a second lifecycle owner. Shared-UID development processes are not a production tenant sandbox. Deployment-specific driver/isolation/capacity verification remains a release gate; the application deliberately refuses local process spawning in production.

Gateway template settings: `NMA_DEFAULT_MODEL` is an explicit public catalog ID (default `default`); `NMA_DEFAULT_GRANTS` is a JSON object containing `tool_grants`, `mcp_grants` and/or `skill_refs`. Existing agents are never retemplated during login. Missing model/capability configuration is retryable after correction. `Tobi` is the initial display name; conflicting owner-local handles get a suffix. The welcome is an English authored template with `origin=welcome_template`, not a model-generated result, and does not create a run or goal.

Optionally configure Clerk `user.created` events at `/api/accounts/webhooks/clerk` with `CLERK_WEBHOOK_SIGNING_SECRET`. The signature and timestamp are verified by Svix; duplicate deliveries and concurrent first login share one account/setup intent. Webhooks are asynchronous, so first authenticated access remains the repair path. See [Clerk webhook semantics](https://clerk.com/docs/guides/development/webhooks/overview).

Use `GET/POST /api/agent-engine/v1/bootstrap` to read/request setup; POST returns 202 with Retry-After while pending. Engine reads do not create agents. `GET /conversations` supplies compact summaries and an owner-bound `through_cursor`; finish pagination while retaining that watermark, then replay `/conversations/events` and deduplicate by thread ID. A secondary historical DM has `is_primary=false`; retain history access through existing `/threads` APIs. Snapshot/SSE reads do not mark messages read. `thread.mark_read` advances a decimal message watermark; `thread.open` requires the navigation revision (initial `1`). `POST /agents/{agent_id}/dm` accepts a versioned `thread.ensure_dm` command. Existing `thread.create` for DM resolves to the primary thread. UI consumption is deferred.

For an ambiguous existing primary/default, save an inventory using `ngertiin.agent_engine.conversation_migration inventory --owner UUID --output inventory.json`. Create a frozen `account.reconcile` command with `inventory_digest`, `default_agent_id` (or null) and `primary_dms` mapping; apply with `conversation_migration apply --owner UUID --plan plan.json --output receipt.json`. Inspect the stored receipt before retrying. The operation changes only mappings, never transcripts, sessions, goals or active runs. After resolving an operator error, use `ngertiin.agent_engine.provisioner --retry UUID`. Restore quarantine still requires the existing backup reconciliation procedure.


## Provider connections

See [the provider connection report](../../docs/research/nma-040-provider-connections.md) for schema 14, the native credential boundary, API/UI, exact provider contracts and the open real-provider acceptance matrix. The production profile now selects the native `anthropic` extra as well as `acp` and `mcp` from the unchanged Hermes lock. Rebuild into a new runtime directory and point `NMA_RUNTIME_PYTHON` there before using Anthropic wire models. Lazy installation remains disabled.

Existing owner catalogs are imported once, with their model aliases retained. A new local account does not inherit an operator's global API key unless its internal UUID equals `NMA_BOOTSTRAP_OWNER_ID`. Accounts/Tobi/DM setup work without any provider; connect an account at `/connections`, refresh its catalog, then select it in agent settings.

Browser OAuth currently requires the browser and gateway on the same host. Enable `NMA_CHATGPT_LOCAL_OSS=1` only for an eligible local OSS installation. Hosted ChatGPT access and remote callback deployment are separate, unverified release gates.
