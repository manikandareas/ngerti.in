# NMA-008 — per-agent capabilities

Date: 2026-10-23. Status: **Review**, not Done.

Authority: [NMA-008](https://app.notion.com/p/402abdd6187381c092b6fb6bbed3971f),
[agent/context decisions](https://app.notion.com/p/402abdd618738113aa55c1bd18e53144),
[ADR-03](https://app.notion.com/p/402abdd61873818abd30d42ac276b671), and
[definition of done](https://app.notion.com/p/402abdd61873812a97a9f41032dd854f).
The live direct dependency NMA-007 remains Review, including its NMA-006 dependency
and downstream DM/group consumer acceptance. Work proceeded under the user's
explicit instruction to implement this task; dependency status is not overwritten.

## Delivered behavior

- Immutable agent config revisions accept tool/MCP/skill catalog references. A private
  owner catalog resolves native toolsets, HTTP MCP specifications and bounded skill
  instructions. Only catalog IDs/labels and assigned IDs reach the public API/UI.
- Each binding carries its agent ID, access generation, grants and catalog fingerprints
  into the native policy. MCP registration uses Hermes's existing session scope,
  generated names, frozen manifest, transport and registry. There is no new executor,
  scheduler, lifecycle owner or connector model loop.
- Assignment removal atomically advances access generation and fences unfinished runs
  before native cancellation. Grant addition never broadens an existing run. Live
  authorization runs before model execution and at final native tool dispatch. A queued
  run whose private credential disappears is durably fenced without a model request.
- Missing/changed private credentials and disabled/changed catalog definitions cannot
  authorize a frozen snapshot. Discovery failure is explicit. Known header values are
  scrubbed from tool results and native logs, including connector exceptions.
- The existing agent editor has a progressive capability section. It preserves selections
  across unrelated edits, exposes unavailable selected IDs for removal, and allows
  independent choices for two agents. Secrets are never entered into this form.

The implementation reuses migration 2's config JSON and agent/run fences. It does not
change historical migration checksums, touch legacy execution, or migrate production
accounts. [Operations and provisioning](../../apps/engine/README.md#per-agent-capabilities-nma-008)
include private file examples, revocation/rotation order, backup and rollback boundaries.

## Explicit support and remaining boundaries

This slice supports native `todo`, HTTP MCP, and instruction-text skills. It does not
expose unrestricted host tools, MCP stdio/SSE or executable skill assets. This avoids
claiming executor isolation from a profile; additional host/file/browser capability
coverage belongs with NMA-022/023. It is an implementation support matrix, not a new
product approval requirement or a limit on autonomous goal capture.

Revoke assignments through `agent.configure` before removing/rotating the private
credential; that commits the durable generation fence. File absence/changes additionally
fail closed at resolution. Reintroducing an identical private file alone is not a durable
credential-revocation protocol. External credential administration/revocation tombstones,
full group/memory isolation, causal descendant recovery and external-effect reconciliation
remain the stated NMA-010/023 gates. Already dispatched effects cannot be recalled.

Native discovery's bounded preflight can time out on a server returning HEAD 405 and
an unending GET SSE stream. The actual fixture exposes a bounded HEAD response; an
unavailable endpoint is separately tested and never silently dropped. This is an upstream
compatibility limitation, not evidence that every MCP server works. Known-value redaction
is not a guarantee against a malicious connector encoding or transforming a secret.

## Provenance

Hermes remains at `7489b22af47ce91b366dde81d5831ea422577498`, root MIT. No source
is patched or copied. Reviewed source files are hash-pinned in
[runtime-pin.json](../../apps/engine/src/ngertiin_engine/runtime-pin.json): native
session MCP binding/restore, tool registration, final dispatch, registry and turn runner.
Ngertiin's runner subclass and dispatch wrapper are explicit local adaptations, not
claims of a stable upstream extension API. Skills use the already reviewed frozen
`skills_prompt` seam; they do not grant native global skill-library access.

The runtime now installs upstream-locked `acp` and `mcp` extras. The local environment
is separate from prior verification environments; the Linux verification Dockerfile
uses the same extras and source locks. Installed inventories are retained. The previous
missing-notice and bundled-codec clearance gate is not closed by these tests. No image
was pushed or deployed.

## Verification

Real pinned Hermes processes, real SQLite/WAL and a real local HTTP MCP server are
used. The model is a deterministic OpenAI-compatible loopback fixture, not a paid/live
provider. Connector receipts prove actual tool invocation, including after restart,
and distinguish denied cross-agent calls from success cached in transcript history.

The runtime suite covers the prior 17 contracts plus capability assignment/deny/revoke,
MCP credential scope/restart/error/deletion, addition-only snapshot behavior and failed
connector discovery. It checks private skill isolation, generation advancement, no
model execution for revoked queued work, stable exact retries, and no raw synthetic
credential in provider requests, native database or engine logs. HTTP tests cover owner
binding and capability-error status mapping. Browser checks use real development Clerk
authentication and a disposable engine partition.

Final results: **21/21 runtime tests on macOS arm64 and Linux aarch64**, **6/6 HTTP
tests**, full `make check` and `make build` passed. Linux retains one non-failing
pytest-cache permission warning. Inventories contain 90 macOS and 91 Linux distributions;
missing packaged notices remain `fetch-use` and `firecrawl-anydoc`. The existing
`pillow-heif` bundled-codec review remains open. Browser config JSON is identical
before and after restarting the engine.

Evidence is in [verification.json](evidence/nma-008/verification.json). Browser screenshots
and accessibility snapshots show desktop assignment, mobile controls, persisted selections,
and removal of MCP/skill while retaining the native tool. The browser fixture configures
an intentionally unavailable MCP endpoint; real MCP execution is proven separately by
the runtime suite. No browser chat/DM/group E2E claim is made.

Author self-review checked snapshot semantics, deny-before-dispatch behavior, native
receipt boundaries, secret projection, additive storage, and preservation of earlier code.
No independent review is claimed. The initial working tree was clean. Changes remain
local and uncommitted; no push, production migration, release or deployment was performed.

## Corrections encountered during verification

Initial fixture assertions confused an attempted tool argument with a successful tool
result; assertions now inspect denial and actual connector receipts. The installed MCP
SDK is 2.x and uses `MCPServer`, not `FastMCP`; native session MCP additionally needs ACP
schema types. These requirements are now explicit in packaging. The first HTTP fixture
exposed the native HEAD/GET preflight limitation above.

A pre-execution rejection initially avoided the model but left the native outer receipt
looking completed. The runner now records the durable run fence before returning; queued
credential-revoke assertions verify cancelled status and zero queued model requests.
The first browser server launch did not load Clerk's secret environment; using the
repository's normal Bun workspace launch fixed it. Backend tests use unittest, not an
uninstalled pytest executable. These unsuccessful probes are not counted as passing evidence.
