# NMA-001 — Hermes runtime and adoption provenance audit

Date: 2026-10-23. Scope: reproducible discovery spike, two profiles, canonical hosted-room
execution, simple restart, module/dependency/license inventory, and explicit runtime gaps.
This report supports [NMA-001](https://app.notion.com/p/402abdd61873811295d3fddfc040d720).
Product authority is [Ngertiin Multi Agent](https://app.notion.com/p/402abdd6187381e3a720f4b01d824e1a),
especially documents 01–08. NMA-001 has no ticket dependency. Integration selection remains NMA-004.

## Result and acceptance

The pinned, unmodified Hermes native gateway executed a two-profile room with a real model.
Researcher calculated 120 / 1500 × 100 = 8 litres/100 km and handed the work to Writer,
which produced a usable short report. Killing and restarting the processes preserved the room
transcript; resending the original event returned an idempotent receipt; a same-thread follow-up
completed without repeating the original work. This establishes the scoped spike behavior,
not production integration or release readiness.

| Acceptance | Evidence | Outcome |
| --- | --- | --- |
| Repeatable setup | [Setup and commands](../../scripts/spikes/hermes_runtime/README.md), pinned archive hash, upstream PM build | Verified in isolated environments |
| Two profiles and hosted-room run | [Live receipt](evidence/nma-001/live-result.json), [transcript](evidence/nma-001/restart-transcript.json), [report](evidence/nma-001/fleet-report.md) | Researcher/default and named Writer, distinct SOUL markers; 2 initial turns and 1 follow-up settled |
| Module/license/notice/dependency map | Tables below, [machine inventory](evidence/nma-001/inventory.json), retained notices | 26 selected modules, 20 source notice files, 89 installed distributions inventoried |
| Runtime gaps recorded | Observed gaps below, [verification](evidence/nma-001/verification.json), daemon logs | Schema mismatch and SQLite fallback reproduced; untested product areas explicitly bounded |
| Real example, simple restart and logs | Native gateway PIDs and authority epochs in live receipt; first/restart transcripts | Epoch 1 → 2, transcript equality, idempotent resend, follow-up succeeds |

## Reproduction and source identity

- Upstream: [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent/tree/7489b22af47ce91b366dde81d5831ea422577498).
- Commit: `7489b22af47ce91b366dde81d5831ea422577498` (the revision pinned by Notion).
- Archive SHA-256: `8bb5bc691b509caa847b4e388258be2adec297f06b1ee01f56c9a742eb043d95`.
- `pyproject.toml` SHA-256: `68325d6717bd4ebc3a7b015c5150bea4d5600c612259b9b7393e964caa828761`.
- `uv.lock` SHA-256: `f1609519f30dac8886b03e60693e36fa75e033fa3e7259c8c8befe8fb6e34460`.
- Host: macOS arm64; CPython 3.14.3; SQLite 3.50.4. The linked SQLite version matters to the journal-mode finding below.
- Live provider: the existing project's OpenAI endpoint, model `gpt-6.1-sol`; three actual conversation turns per successful run, six across the initial run and clean setup reproduction. Inputs were synthetic and contained no user/customer records.
- No upstream behavior patch. The 26 mapped source files plus project, lock and root license were byte-checked against the pinned Git object. Full tracked-source comparison is recorded in the evidence manifest.

Use the [harness README](../../scripts/spikes/hermes_runtime/README.md) for exact commands.
The initial exploratory environment used `uv sync --frozen --group dev`; the final reproducible
setup uses the documented upstream `pm.build_env --group dev --group test`. The selected suite
was rerun in that PM-built environment, and the live probe passed again after running the complete
setup script from an empty directory. Checked-in live evidence is from this clean reproduction.
This distinction avoids presenting the exploratory
bootstrap as upstream's recommended installation path.

## What actually ran

The real-model probe used two ordinary `python -m gateway.run` processes, with the named Writer
configured `gateway.standalone: true`. The root profile declared Writer in `hosted_rooms.profiles`.
Each profile retained its own authority, state database and credentials; the room coordinator
used canonical transport to the exact profile owner. This is a local upstream topology, not a
decision to use one process per agent in production. The default multiplex topology was not
benchmarked by the real-model probe.

The initial client connection was closed immediately after admission. Subsequent observation
used a fresh authenticated connection. The driver continued server-side. The initial transcript
contained one user event, Researcher and Writer contributions, and settlement events. After
restart, the old event did not add another user event or model contribution; a fresh event targeted
Writer and produced the third settled turn. The generated report is preserved verbatim.

The selected upstream suite ran through `scripts/run_tests.sh`, not direct pytest:
**324 passed, 0 failed, 6 skipped across 10 files**. The PM-built run completed in 60.8 seconds.
The skips are host-specific Linux/Windows cases on macOS. [Full runner log](evidence/nma-001/upstream-tests.log).

| Executed suite | What the result establishes |
| --- | --- |
| `tests/hermes_cli/test_profiles.py` | Profile filesystem/configuration contracts; 105 passed, 6 platform skips |
| `tests/gateway/test_hosted_rooms.py` | Durable room log and identity contracts; 48 passed |
| `tests/gateway/test_hosted_room_driver.py` | Task admission, leases/generations, cancellation and recovery; 44 passed |
| `tests/gateway/test_hosted_room_discussion.py` | Mention routing, watermark, next-turn and bounded discussion behavior; 46 passed |
| `tests/gateway/test_session_hosted_service.py` | Canonical ownership, admission and member checks; 6 passed |
| `tests/gateway/test_session_hosted_rpc.py` | Canonical member session/receipt behavior; 24 passed |
| `tests/gateway/test_session_hosted_transport.py` | Owner transport contracts; 9 passed |
| `tests/gateway/test_session_hosted_controls.py` | Exact control identity contract; 1 passed |
| `tests/tui_gateway/test_hosted_room_service.py` | Shared coordinator behavior with fixture transports; 39 passed |
| `tests/gateway/test_session_hosted_daemon.py` | Two real native-daemon tests with a loopback model: restart/dedup/attachment round-trip, and kill during blocked inference with unknown-result recovery and exact discard controls; 2 passed |

Most unit/service tests use test doubles. The daemon tests use actual processes, sockets and
SQLite but a deterministic local model. Only the separately recorded live probe used the external
model. The rest of the upstream test suite was not run. No Ngertiin UI/browser acceptance is claimed.

## Module and dependency boundary

Each row below refers to the pinned commit. Exact paths, SHA-256 values and direct Python import
names for individual files are in [inventory.json](evidence/nma-001/inventory.json).

| Boundary | Source modules | Adoption implications |
| --- | --- | --- |
| Agent/model loop | `run_agent.py`, `agent/turn_facade.py`, `agent/prompt_builder.py` | AIAgent delegates into sibling modules; copying the facade alone is not a standalone engine. |
| Profile identity/config | `hermes_cli/profiles.py`, profile SOUL and home | Persistent profile works in the live run. Home separation is not OS/tenant isolation. |
| Session authority/storage | `gateway/run.py`, `gateway/session_authority.py`, `hermes_state.py`, `hermes_state_runtime.py` | Keep admission, execution, session history and epoch ownership together. |
| Canonical groups | `gateway/session_hosted_service.py`, `session_hosted_members.py`, `session_hosted_rpc.py`, `session_hosted_transport.py` | Canonical service is bound to durable authority and exact member owner; this is the live path exercised. |
| Room state/policy | `gateway/hosted_rooms.py`, `hosted_room_driver.py`, `hosted_room_discussion.py` | Durable events, deterministic routing, leases and recovery are a coupled contract. |
| Shared coordinator/worker | `tui_gateway/hosted_room_service.py`, `hosted_room_driver.py` | Native canonical service reuses this base; a `tui_gateway` path does not imply renderer ownership. |
| Legacy session adapter | `tui_gateway/hosted_room_server_rpc.py` | Separate in-process adapter; do not mistake its session semantics for canonical authority. |
| Capability edge | `tools/skills_tool.py`, `tools/mcp_tool_registration.py` | Source inspected, imports inventoried; actual skill/MCP execution not covered by this spike. |
| Proactivity | `hermes_cli/goals.py`, `gateway/run_goals.py`, `cron/scheduler.py` | Source pointers only. Automatic capture, heartbeat and webhook reliability remain unproven here. |
| Probe utilities | `tests/gateway/fixtures/local_recovery_probe.py`, `test_normal_runtime_boot.py` | Imported for process/control-socket/WebSocket setup; MIT attribution retained. |

The installed core includes OpenAI/httpx, pydantic, SQLite from Python, YAML/config utilities,
FastAPI/uvicorn/websockets, browser/document dependencies, and runtime telemetry packages.
The test environment also includes pytest, MCP test support, Anthropic SDK and development tools.
All 89 names, exact versions, `Requires-Dist`, declared core requirements, optional extras,
dev/test groups, license metadata and license-file hashes are captured. The inventory does not
claim that every installed package was imported during the live turns, or that every optional extra
was installed. The upstream lock's override rules, including Pillow and cryptography, must travel
with a whole-runtime install rather than being silently re-resolved in Ngertiin's backend venv.

## License and notice findings

The root [LICENSE](evidence/nma-001/HERMES-LICENSE.txt) is MIT, copyright 2025 Nous Research.
Selected engine/profile/room files and imported test helpers use that root notice; no separate
license file was found in those selected module directories. Keep the notice with any copied or
distributed portions. This spike does not vendor engine code or distribute an upstream binary.

The source tree has 20 explicit license/notice files in the inventory. Examples include separate
MIT notices in Desktop bot code and document skills, plus an Apache-2.0 license and attribution
NOTICE for the security-guidance plugin's imported Anthropic patterns. These components were not
adopted into the Ngertiin application. A whole-tree distribution must account for them separately.

Installed dependency metadata spans MIT, BSD variants, Apache-2.0, MPL-2.0, ISC, PSF-2.0 and
MIT-CMU; root MIT is not a blanket statement about the installed environment. Specific findings:

- `pillow_heif==1.6.0` advertises BSD-3-Clause for its Python source, but its installed
  [bundled-library notice](evidence/nma-001/pillow-heif-bundled-licenses.txt) explicitly labels the
  binary wheels GPLv2 and lists libheif/libde265 as LGPLv3 and x265 as GPLv2. This dependency arrives
  through the core document-extraction chain. Packaging/adoption must evaluate the actual binary
  payload; reading only the Python package's top-level license field misses this distinction.
- `certifi` and `pathspec` advertise MPL-2.0; `tqdm` advertises MPL-2.0 AND MIT.
- `resvg_py` lacks a license metadata field in this environment, but its packaged LICENSE contains
  the MIT permission text. The file hash is recorded rather than leaving the metadata omission hidden.
- `fetch-use` and `firecrawl-anydoc` advertise MIT but provide no matching license/notice file in
  their installed distribution file lists. Obtain and retain their corresponding source notices
  before shipping those packages as part of an adopted runtime artifact.

These are observed package contents and attribution requirements to carry into packaging review;
this inventory is not a legal clearance for a future distribution. Optional extras and binary
bundles for other operating systems require a separate inventory when selected.

## Observed runtime gaps and limits

1. **Canonical group wire schema mismatch.** Live `groups.log` returns member actors containing
   `profile`; `tui_gateway/contracts/groups_bot_relay.py::RoomActor` declares only `kind` and `id`
   with extra fields forbidden. `gateway/hosted_room_discussion.py` produces the additional field.
   Production logs a validation error while returning the transcript. Validating the saved response
   through upstream `GroupsLogResult` reproduces three `extra_forbidden` errors (one per member
   contribution). [Verification](evidence/nma-001/verification.json) and
   [daemon log](evidence/nma-001/first-researcher.log) preserve the evidence. This needs contract
   reconciliation before a strict Ngertiin adapter is accepted; no upstream patch was made here.
2. **SQLite runtime fallback.** This Python build links SQLite 3.50.4. Hermes's own safeguard
   selects `journal_mode=DELETE` and logs that its WAL implementation needs a fixed runtime.
   Both profile databases actually report `delete`; after the processes stopped, read-only
   `PRAGMA quick_check` returned `ok`. The spike therefore proves recovery with rollback journaling,
   not WAL-mode concurrency/performance. Choose and retest the production Python/SQLite build.
3. **Local authority is not SaaS tenancy.** The test uses one synthetic local owner and two
   profiles on one machine. No cross-tenant credentials/files/MCP isolation is proven. The snapshot
   exposes useful owner/member checks, but those do not replace a hosted isolation design.
4. **Live recovery scope is bounded.** The external-model probe kills processes after settlement.
   In-flight crash/unknown-side-effect handling is exercised only by the deterministic upstream
   native-daemon test. Exactly-once external side effects are not claimed.
5. **Capabilities and proactivity remain separate evidence.** No E2B/browser, real MCP, skill
   script, automatic goal capture, recurring schedule, heartbeat, webhook, or cross-room goal
   ownership was exercised. NMA-002 and later tickets remain necessary.
6. **Resource and deployment fit are open.** The upstream Python 3.14 lock is incompatible with
   assuming the current Ngertiin backend's Python range is the target. Multiple hosted tenants,
   process/memory cost, Linux deployment, throughput and operational SLOs were not benchmarked.

## Input to NMA-004, not a final ADR

| Integration option | Evidence now available | Work still required |
| --- | --- | --- |
| Separate pinned upstream service | Native gateway, profile ownership and canonical room path worked without source patches; simplest baseline for the next integration experiment | Authenticated Ngertiin boundary, tenant isolation, deployment/runtime packaging, schema mismatch, mapping domain IDs and artifacts |
| Embed upstream in the existing backend process | Core imports are Python and boundaries are inspectable | Resolve Python/dependency compatibility, global/context/thread ownership, shutdown and scheduler lifecycle; no embed acceptance was performed |
| Adapt selected modules | Room policy/state/driver sources and import dependencies are mapped | Preserve transactions, authority, receipts, stop and recovery together; establish patch/upgrade discipline and equivalence tests; module copying alone has not been validated |

Recommendation for the ADR experiment: begin from the tested separate-service canonical path,
then compare actual integration cost with embedding or selective adaptation. This is a technical
proposal, not a user decision or permission to add competing lifecycle owners. Each future adoption
must retain commit/license provenance and list local patches; replay this same suite and live probe
on upgrades, including the schema and journal-mode findings.

## Evidence review

Acceptance was checked against the original four checklist items and the ticket's real-example /
restart requirement. Source hashes, final artifacts, test counts, transcript sequence, duplicate
receipt and database checks were reviewed. This was an author self-review; no independent reviewer
was assigned or claimed. Runtime/provenance gaps above are outputs of this audit; they are not
hidden release blockers declared solved. All four discovery acceptance items and the required
real-example/restart evidence are complete. No production code, data migration, cutover or
upstream fix is included. Final integration decisions remain with NMA-004.
