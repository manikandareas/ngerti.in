# Isolated Hermes adapter

This package implements the runtime boundary specified by [NMA-006](https://app.notion.com/p/402abdd6187381d899d0c98b4bf081d7), following ADR-01 and ADR-03. It is an internal integration foundation, **not enabled in the product API or production**. Agent configuration CRUD, domain run fencing, durable event replay, goals and group routing remain their ordered downstream slices.

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

The Dockerfile is a **verification image** including upstream's dev/test groups. It is not a cleared distributable production image. Use an owner-specific container, mount only its volume and authorized workspace, do not publish native gateway ports, and keep the Unix socket accessible only to the trusted forwarding API. Full executor/credential isolation is still NMA-023; a profile directory is not a sandbox. Do not use shared network SQLite volumes or concurrent active replicas. Move a partition only after fencing and proving exclusive volume ownership.

```sh
python3 apps/engine/fetch_runtime.py apps/engine/.runtime/source.tar.gz
docker build --target runtime -t ngertiin-engine:nma-006 apps/engine
docker run --rm --entrypoint /opt/runtime/bin/python ngertiin-engine:nma-006 \
  -m pytest /opt/ngertiin/tests -q
```

To verify Linux without exporting/unpacking an image twice on a constrained Docker disk:

```sh
docker build --target evidence --output type=local,dest=.dev/nma-006-linux apps/engine
```

The evidence target runs the same runtime filesystem as a non-root user and exports the test log and installed-distribution inventory. It does not deploy a service.

## Internal command boundary

One newline-delimited JSON request/response per connection to `$HERMES_HOME/nma.sock`, mode `0600`. `contracts.sign` creates the internal HMAC-SHA256 envelope. It binds owner, actor, audience, expiration, canonical body and digest; wrong owner, signature, expiry and unsupported schema fail closed. Signer keys must be unique per partition. This is private service authentication, not browser authentication or the public HTTP implementation.

Body fields are `schema_version: nma.v1`, UUID `command_id`, `type`, `expected_revision: null`, `payload`. The currently negotiated internal capabilities are:

- `runtime.describe`: empty payload; reports authority epoch and `production_ready: false`.
- `runtime.submit`: agent/thread UUIDs, decimal-string config/context revisions and text. Only provisioned bindings are accepted. Returns product run identity and a durable admission receipt, not model success.
- `runtime.read`: run ID; maps native queued/started/unknown/terminal receipts to queued/running/indeterminate/succeeded/failed/cancelled.
- `run.cancel`: run ID; native queued cancellation or generation-specific interrupt, including queued-to-claimed races. It does not stop unrelated goals.
- `runtime.events`: run ID, nullable replay epoch and decimal-string last sequence. Filters native frames by admission identity, maps message/tool/error events, and emits decimal-string sequence values. The native ring is bounded and volatile: an epoch change or gap requires a snapshot. This is **not** the durable partition SSE implementation of NMA-010.

Mutations store canonical command digest and pending outbox identity before native dispatch, then mark applied and append a domain receipt event in one extension transaction. Native admission uses the same operation ID on retry. Identical retries return the stored receipt; changed bodies conflict. An acknowledgement timeout is unknown, so retry the **same** command ID. Pending outbox rows are retained; no background semantic retry loop is introduced. NMA-010 implements complete crash reconciliation and domain run/descendant fencing.

The gateway's writer owns all `nma_*` mutations and checks the native epoch and partition. Migration 1 is additive, checksum-versioned and transactionally applied. Foreign keys are required. `nma_adapter_bindings/runs` are temporary integration mappings, not replacements for the full domain tables assigned to later slices. Public agent/thread APIs and PostgreSQL projections are untouched.

## Operations, provenance and upgrade

Upstream: [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent/tree/7489b22af47ce91b366dde81d5831ea422577498), commit `7489b22af47ce91b366dde81d5831ea422577498`, root MIT. Archive SHA-256 and integration module hashes are in `src/ngertiin_engine/runtime-pin.json`. The archive fetcher verifies its hash before extraction. The [retained MIT notice](../../docs/research/evidence/nma-001/HERMES-LICENSE.txt) also covers imported upstream test helpers. No upstream code is vendored here. Local source patches: none. Runtime adaptation: runner subclass plus calls to the pinned session/store APIs.

Upgrading requires reviewing all pin hashes and the subclass seam, regenerating both upstream locks only through upstream's process, retaining source/dependency notices, testing the actual target image, rerunning adapter and native recovery suites, and reviewing any changed native wire/actor/profile contract. Never change a pin solely to make a failing test pass.

Before migration/upgrade: stop ingress, drain or quarantine runs, shut down the native owner, back up root SQLite **and** subordinate state/secret references/workspaces consistently, verify restore to a disposable partition, then start one owner. Unknown newer schema or changed migration checksum refuses startup. Rollback preserves the entire new partition; never delete extension tables or import its runs into the legacy engine. No existing application database migration or cutover occurs here.

Distribution clearance remains separate from source MIT: the prior audit found copyleft codec notices in `pillow-heif` and missing shipped notices in other dependencies. The verification image must not be presented as cleared production packaging until its actual inventory and obligations are resolved. See the NMA-006 evidence report for exact tested platforms and remaining gates.
