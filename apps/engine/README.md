# Isolated Hermes adapter

This package implements the runtime boundary specified by [NMA-006](https://app.notion.com/p/402abdd6187381d899d0c98b4bf081d7), following ADR-01 and ADR-03. Native execution remains private and **not enabled for production**; the configuration-only product API is documented below. Agent configuration CRUD is documented below. Complete domain run fencing, durable event replay, goals and group routing remain their ordered downstream slices.

## Ownership and deployment

One process and durable **local** volume per account partition. The entry point installs a `GatewayRunner` subclass before native bootstrap. Native bootstrap owns reservation, epoch, session execution, workers, shutdown and recovery. The subclass attaches a private Unix request socket after native startup and closes it before shutdown. It adds no scheduler and imports no legacy backend. No upstream source file is patched; this subclass seam is an explicit Ngertiin integration that upgrades must retest.

Run with the pinned Hermes environment (Python 3.14.9). `runtime-pin.json` records source and upstream dependency-lock hashes; startup checks them, Python, FTS5 and JSON support. The adapter's `uv.lock` covers its own zero-runtime-dependency package; Hermes's `uv.lock` and `pm/lock.json` remain the actual runtime dependency locks. Do not install Hermes into `apps/backend`.

Required server-controlled environment:

- `HERMES_SOURCE`: verified upstream source directory.
- `HERMES_HOME`: exclusively owned account state volume; use a short path (e.g. `/state`) for the Unix socket.
- `NMA_OWNER_ID`: account UUID, provisioned by the authenticated control plane.
- `NMA_SERVICE_KEY_FILE`: private file containing at least 32 random bytes, shared only with the API signer.
- `NMA_BINDINGS_FILE`: private JSON array of the integration bindings below. This is temporary server provisioning for this slice, not a public configuration API.
- Native provider credentials: supplied through the account's secret environment. Never put keys into bindings or command payloads.

```json
[{
  "agent_id": "11111111-1111-4111-8111-111111111111",
  "thread_id": "22222222-2222-4222-8222-222222222222",
  "config_revision": "1",
  "context_generation": "1",
  "model": "configured-model",
  "provider": "custom",
  "base_url": "https://provider.example/v1",
  "toolsets": [],
  "cwd": "/workspace"
}]
```

Bindings are persisted immutably by their agent/thread/config/context identity. Changing the same revision's model/tool selection fails startup. A new revision or thread has a distinct native session. Paths, models and capabilities come only from this server-owned manifest. Identity/soul/MCP/scoped memory provisioning is not implemented by this temporary manifest; NMA-007–009 replace it with authoritative domain configuration.

The Dockerfile separates the `foundation` runtime from the `verify` test environment. Use an owner-specific container, mount only its volume and authorized workspace, do not publish native gateway ports, and keep the Unix socket accessible only to the trusted forwarding API. Full executor/credential isolation is still NMA-023; a profile directory is not a sandbox. Do not use shared network SQLite volumes or concurrent active replicas. Move a partition only after fencing and proving exclusive volume ownership.

```sh
python3 apps/engine/fetch_runtime.py apps/engine/.runtime/source.tar.gz
docker build --target foundation -t ngertiin-engine:foundation apps/engine
```

To verify Linux without exporting/unpacking an image twice on a constrained Docker disk:

```sh
docker build --target evidence --output type=local,dest=.dev/nma-006-linux apps/engine
```

The evidence target launches the foundation interpreter as a non-root user from a separate pytest environment, and exports the test log and both installed-distribution inventories. It does not deploy a service.

### Foundation dependency profile

`build_runtime.py` exports the pinned upstream lock through Hermes PM, then builds a
fresh requirements environment with ACP/MCP extras. It neither patches upstream
source nor rewrites its lock. The explicit packaging deviations are:

- Exclude `pillow-heif`: its bundled GPL codec wheel is not part of this foundation
  artifact. HEIC/HEIF image input is outside this profile; JPEG/PNG and the tested
  text/tool/MCP paths do not require that wheel.
- Exclude `fetch-use` and its dependent `browser-harness`: the pinned fetch-use
  source/wheel lack a distributable notice and the declared repository is
  unavailable. Native Browser Use is outside this profile; do not advertise it.
- Keep `firecrawl-anydoc` and ship its exact 0.2.4 source-archive MIT notice under
  `/opt/ngertiin/notices`, with source/archive/member hashes in `provenance.json`.
- Import Hermes from its verified source tree rather than installing its full-app
  distribution metadata, which would require the deliberately excluded packages.
  The profile manifest records the upstream revision, lock hash and requirements.

The build fails if an excluded package returns or an installed distribution has
no packaged/supplemental notice. The source tree retains its upstream notices.
`HERMES_DISABLE_LAZY_INSTALLS=1` keeps the deployed dependency set fixed; changes
require rebuilding and rerunning the inventory gate. This is a packaging choice,
not an agent initiative policy. Reintroducing excluded capabilities requires their
own dependency/source-notice review and runtime acceptance.

For a local foundation environment, run `build_runtime.py --source <verified-source>
--out <new-environment>`. Add `--tests` only for a separate test runner. Set
`NMA_TEST_RUNTIME_PYTHON=<foundation-environment>/bin/python` when running pytest
from that runner to exercise the actual application interpreter.

## Internal command boundary

One newline-delimited JSON request/response per connection to `$HERMES_HOME/nma.sock`, mode `0600`. `contracts.sign` creates the internal HMAC-SHA256 envelope. It binds owner, actor, audience, expiration, canonical body and digest; wrong owner, signature, expiry and unsupported schema fail closed. Signer keys must be unique per partition. This is private service authentication, not browser authentication or the public HTTP implementation.

Body fields are `schema_version: nma.v1`, UUID `command_id`, `type`, `expected_revision: null`, `payload`. The currently negotiated internal capabilities are:

- `runtime.describe`: empty payload; reports authority epoch and `production_ready: false`.
- `runtime.submit`: agent/thread UUIDs, decimal-string config/context revisions and text. Only provisioned bindings are accepted. Returns product run identity and a durable admission receipt, not model success.
- `runtime.read`: run ID; maps native queued/started/unknown/terminal receipts to queued/running/indeterminate/succeeded/failed/cancelled.
- `run.cancel`: run ID; native queued cancellation or generation-specific interrupt, including queued-to-claimed races. It does not stop unrelated goals.
- `runtime.events`: run ID, nullable replay epoch and decimal-string last sequence. Filters native frames by admission identity, maps message/tool/error events, and emits decimal-string sequence values. The native ring is bounded and volatile: an epoch change or gap requires a snapshot. This is **not** the durable partition SSE implementation of NMA-010.

Mutations store canonical command digest and pending outbox identity before native dispatch, then mark applied and append a domain receipt event in one extension transaction. Native admission uses the same operation ID on retry. Identical retries return the stored receipt; changed bodies conflict. An acknowledgement timeout is unknown, so retry the **same** command ID. Pending outbox rows are retained; no background semantic retry loop is introduced. NMA-010 implements complete crash reconciliation and domain run/descendant fencing.

The gateway's writer owns all `nma_*` mutations and checks the native epoch and partition. Migration 1 is additive, checksum-versioned and transactionally applied. Foreign keys are required. `nma_adapter_bindings/runs` are temporary integration mappings, not replacements for the full domain tables assigned to later slices. Thread APIs and PostgreSQL projections remain downstream; the agent API is documented below.

## Operations, provenance and upgrade

Upstream: [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent/tree/7489b22af47ce91b366dde81d5831ea422577498), commit `7489b22af47ce91b366dde81d5831ea422577498`, root MIT. Archive SHA-256 and integration module hashes are in `src/ngertiin_engine/runtime-pin.json`. The archive fetcher verifies its hash before extraction. The [retained MIT notice](../../docs/research/evidence/nma-001/HERMES-LICENSE.txt) also covers imported upstream test helpers. No upstream code is vendored here. Local source patches: none. Runtime adaptation: runner subclass plus calls to the pinned session/store APIs.

Upgrading requires reviewing all pin hashes and the subclass seam, regenerating both upstream locks only through upstream's process, retaining source/dependency notices, testing the actual target image, rerunning adapter and native recovery suites, and reviewing any changed native wire/actor/profile contract. Never change a pin solely to make a failing test pass.

Before migration/upgrade: stop ingress, drain or quarantine runs, shut down the native owner, back up root SQLite **and** subordinate state/secret references/workspaces consistently, verify restore to a disposable partition, then start one owner. Unknown newer schema or changed migration checksum refuses startup. Rollback preserves the entire new partition; never delete extension tables or import its runs into the legacy engine. No existing application database migration or cutover occurs here.

The earlier full-app verification image retains its historical packaging blockers.
The foundation profile addresses those specific blockers by exclusion and the
versioned supplemental notice above. This does not clear the excluded packages,
other platforms, optional extras or the product's remaining production gates.

## Agent lifecycle and configuration (NMA-007)

Migration 2 adds `nma_agents`, append-only `nma_agent_configs`, and durable
`nma_agent_run_fences`. The gateway is still the only writer. Agent UUIDs are shared
across scoped thread bindings; no configuration is stored in legacy persona rows.
The public page is `/agents`. The authenticated API forwards `GET /api/agent-engine/v1/agents`
and `POST /api/agent-engine/v1/commands` to provisioned partitions; unprovisioned accounts
receive `503 ENGINE_UNAVAILABLE`, with no legacy fallback or API-local acceptance.

Set `NMA_PARTITIONS_FILE` on the backend to a private server-owned JSON map:

```json
{
  "<authenticated-account-uuid>": {
    "socket": "/state/account/nma.sock",
    "key_file": "/secrets/account-service-key"
  }
}
```

Set `NMA_MODELS_FILE` on each engine to a private server-owned model catalog:

```json
{
  "research": {
    "label": "Research model",
    "model": "configured-provider-model",
    "provider": "custom",
    "base_url": "https://provider.example/v1",
    "cwd": "/workspace"
  }
}
```

The browser sends only a catalog ID. Endpoints/workspace paths are resolved server-side,
frozen into each immutable configuration revision, and omitted from public responses.
Keep credentials in the existing provider secret environment. Catalog changes affect future
configuration revisions. `NMA_BINDINGS_FILE` is now optional; retain it only for adapter
contract fixtures. New agent bindings resolve from authoritative configurations. Capability
assignments remain NMA-008; new domain agents start with an empty toolset.

Agent commands use the NMA-005 envelope. Create payload is
`{display_name, handle, config: {soul, instructions, model}}`; configure adds `agent_id`
and requires the current decimal-string `expected_revision`. Disable/archive take `agent_id`;
restore also takes `status: active | disabled`. Restore retains the UUID and creates a new
configuration snapshot so revoked bindings cannot revive. Handles remain reserved while archived.
Exact retries replay their stored receipt/rejection; a different body under the same command ID
conflicts. The UI retains the same command ID while retrying an uncertain save.

Composition order is identity, soul, instructions. It is frozen through the pinned native
`stage_local_session(..., skills_prompt=...)` seam, not appended to the user's message.
`ignore_rules` disables profile-wide soul/memory/context files; the runner subclass suppresses
profile-level prompt overrides for these marked sessions. Actual model requests verify this seam.
This is not a claim that the managed-worker `ignore_user_config` path is supported: that experiment
failed native adoption and was removed. No native source is patched.

Configure affects future admissions; existing runs retain their snapshot. A fresh admission naming
an old config revision fails. Archive/disable commits generation and unfinished-run fences, then
uses native cancellation. Completed history remains readable. Unfinished fenced output is suppressed
and cancellation is redelivered on startup. Full restart-before-dispatch/tool authorization and
causal descendant fencing remain the NMA-010/023 gates; no goals or wakes exist in this slice.
Production remains disabled pending those downstream gates. Foundation packaging
and its historical full-app exclusions are documented above.

Before upgrade, stop ingress and native execution, back up the complete owner volume, then let
one gateway apply the additive checksummed migration. The predecessor-version test preserves
existing commands and passes FK checks. A checksum mismatch/newer schema refuses startup; do not
edit migration checksums in deployed databases or downgrade by dropping tables. Restore the full
consistent backup for rollback and preserve newer state for reconciliation. PostgreSQL projections
and durable SSE are deferred to their runtime/replay slices; these configuration reads go directly
to the authority and cannot lag its committed state.

Pending submit retries reconcile an existing native admission using the original stored binding
before current revision/access checks. They preserve the original run snapshot without submitting
new work. A pending command with no native receipt still obeys current admission checks.

Wire budgets apply to encoded canonical JSON: 2 MiB per signed request and 16 MiB per response.
Canonical encoding and command hashes remain stable. The API rejects oversized requests with
HTTP 413 (`REQUEST_TOO_LARGE`, `retryable=false`) before opening the engine socket. Agent listing
also caps each page at 4 MiB; a page may contain fewer rows than requested, so follow `next_cursor`.
