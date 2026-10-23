# Agent identity and capability closure

Date: 2026-10-23. Authority: live NMA-007, NMA-008, product document 02,
ADR-03 and the Definition of Done. The DM and group downstream tickets were
also read to distinguish identity/configuration acceptance from later messaging.
NMA-006 is Done following the foundation packaging closure at `5fee5b9`.

## NMA-007: shared identity consumers

Migration 3 adds owner-bound typed threads and memberships while preserving
migrations 1/2, agents, command receipts and native history. DM creation references
one active agent; group creation references 2–6 distinct active agents in stored
order. The authenticated owner is the sole implicit human. Foreign/unknown agents,
duplicate members, invalid cardinalities and inactive agents are rejected.
Creation uses the same native fenced transaction writer, with durable accepted
and rejected command receipts. Exact retry does not duplicate the thread.

`thread.read` resolves authoritative agent IDs and current configurations through
the agent store. No per-channel profile is created. A name/soul/model/configuration
change is visible to both DM and group consumers; archive retains identity on
existing rosters while preventing new execution. Registered runtime bindings
validate the member and context generation before admission. Public HTTP still
cannot invoke private runtime commands or select an owner partition.

The authenticated thread create/read/list endpoints are consumed by `/agents`:
prepare a DM or group, reopen its roster, and edit the shared agent profile from
either channel. Lists have continuation cursors. Detail failure is rendered in
the dialog with an explicit failure state and close/reopen recovery.

The runtime integration test creates real typed DM/group records, executes the
same persistent agent through both thread bindings, verifies identical agent
attribution and separate native contexts, edits its profile, restarts the engine,
then verifies current configuration and archive denial. A private DM marker is
absent from the group's model requests. This is a concrete identity-consumer
test, not a claim of full group transcript or private-memory isolation.

The earlier unchecked stable-DM/group-identity criterion now has API, UI,
persistence and native execution evidence. The unchanged downstream scopes are:
NMA-009 memory/context sharing; NMA-011 DM streaming/replay/interrupt; NMA-017
membership mutation, multi-author transcript and queued membership revocation.
The UI accurately states that message sending is not available there yet.

## NMA-008: capability isolation and discovery secrets

The existing assignment implementation is retained: immutable capability
snapshots, server-resolved private HTTP connector definitions, native per-session
tool scopes, instruction-text skills, live authorization before execution/tool
dispatch, and durable generation/run fences when grants are removed. Adding a
grant cannot broaden an existing run. Existing deny/revoke/restart/error tests
remain passing on the foundation dependency profile.

The independent review reproduced a credential leak through a tool description,
which bypassed result/log redaction and entered native `editor_mcp_json` storage.
The integration now wraps pinned `gateway.session_local_mcp._borrowed`, the shared
discovery boundary used by staging, refreeze and execution. It remembers the
private server header values and rejects schemas containing those exact values
before yielding them to the caller. Native fingerprints and callable schemas
are not silently rewritten. Discovery failure maps to `CONNECTOR_UNAVAILABLE`;
the connector must correct its metadata before use.

The new regression uses a real local HTTP MCP server and a synthetic bearer
token in its description. Initial discovery and exact retry are denied without
any model request or durable raw credential. A clean connector then succeeds;
after restarting both connector and engine with secret-bearing metadata,
execution fails before a model request. Assertions scan SQLite and WAL, logs,
provider requests and connector invocation receipts. No real credentials are used.

Supported capability paths remain native **todo**, **HTTP MCP**, and bounded
**instruction-text skills**. Host/file/browser executors, MCP stdio/SSE, executable
skill assets and full credential administration remain their documented slices.
Known-value protection does not promise detection of maliciously transformed or
encoded credentials. Grant removal is the durable revocation workflow; raw file
deletion/restoration alone is not equivalent to durable credential revocation.

## Verification and review

Evidence manifest: [verification.json](evidence/nma-007-008-closure/verification.json).

- **25/25** real-runtime integration tests passed on macOS arm64 and Linux
  aarch64, using the foundation interpreter: Python 3.14.9, SQLite 3.53.1/WAL.
  Linux runs as UID 10001; one harmless pytest-cache warning remains.
- **7/7** HTTP tests passed, including authenticated thread forwarding, input
  validation and refusal of public runtime/owner injection.
- Full `make check`, `make build`, explicit engine Ruff checks, documentation
  validation and diff checks passed.
- Browser with real development Clerk authentication: create Researcher and
  Writer; create a Researcher DM and a two-agent group; edit Researcher from the
  group; reload and observe its updated identity in both channels; assign all
  three capability categories; reload and revoke MCP/skill while retaining todo;
  Writer remains unchanged. After engine restart, authenticated API JSON is
  byte-equivalent in meaning for agents and both threads.
- Desktop 1440×1100 and mobile 390×844 screenshots and accessibility snapshots
  are retained. The API-read error dialog was exercised by stopping the disposable
  engine, then reopening after recovery. The UI connector is intentionally
  unavailable; real MCP execution is tested separately by the runtime suite.
- Standards review: no hard rule violation; one optional transactional-command
  duplication heuristic. Its P2 dialog error-state finding was fixed and verified
  by source review and browser evidence. Spec review: no remaining blocking
  finding within the documented ticket scopes.

Native Hermes remains the single execution/recovery owner. No upstream source
is patched. The reviewed native discovery/dispatch files are hash-pinned. The
foundation package still has 76 installed distributions and zero missing notices.

## Operations and evidence boundaries

The engine README documents schema-3 backup, upgrade and rollback. Older binaries
refuse the newer schema; rollback requires a consistent pre-upgrade backup after
fencing the current owner, not dropping domain tables. No production migration,
deployment or push occurred. Models are deterministic loopback fixtures, not
live-provider acceptance. Historical failure evidence remains in
`evidence/nma-006-008-review/`; the new discovery test supersedes that defect.

Local implementation/evidence commits are recorded on the Notion tickets. Both
tasks can close in dependency order after this evidence is attached, without
claiming the remaining product messaging, goals, orchestration or release gates.
