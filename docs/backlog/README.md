# Local backlog and delivery status

This backlog is the authority for milestone scope, acceptance, dependencies and status. Read [PRODUCT.md](../../PRODUCT.md), [feature decisions](../product/feature-decisions.md), [architecture](../architecture/overview.md) and [acceptance gates](../development/acceptance.md) before changing the relevant boundary. [The workflow](../development/workflow.md) defines how to maintain these records locally.

Status was initially reconciled on 2026-11-06 and updated on 2026-11-08 for owner acceptance of NMA-066/NMA-067. Sixteen active milestones and two Desktop Rust milestones are Done; NMA-063/NMA-064 remain Backlog. NMA-051 is a separate deferred reference, not an active prerequisite. Recorded Done covers its accepted scope only. Later Cua, semantic-routing, Tauri and conversation refinements retain their dedicated evidence; they do not complete product-wide acceptance or fresh-device distribution.

The six [Desktop Rust milestones below](#desktop-rust-parity-plan) have NMA-066–068 **Done** and NMA-069–071 Backlog. The [2026-11-08 owner decision](../development/nma-066-067-closure-2026-11-08.md) accepts the implemented foundation and native avatar, composer and rich-content components, with remaining technical verification non-blocking. [Foundation](../verification/nma-066/README.md) and [component evidence](../verification/nma-067/README.md) retain actual executed results, failures and optional unexecuted checks. Tauri remains active; integrated parity and host replacement retain their separate decisions/gates.

The [2026-11-07 sidebar loading refinement](../verification/sidebar-loading-2026-11-07/README.md) adds focused desktop/mobile evidence under NMA-061. Milestone statuses and dependencies are unchanged.

The [2026-11-07 conversation chronology refinement](../verification/conversation-chronology-2026-11-07/README.md) adds centered day groups and consistent message/card clocks, with Goal/Routine event bars remaining without clocks. It retains NMA-061's status and the open product/distribution gates.

The [2026-11-07 Focus content viewer amendment](NMA-062.md#focus-content-viewer-amendment--2026-11-07) implements the selected conversation file/table composition, with later PDF preview and conversation-style header refinements under the same milestone. Its focused verification and limitations are retained separately; milestone statuses and open product/distribution gates are unchanged.

The [2026-11-07 Working files/source viewer amendment](../verification/working-files-tree-2026-11-07/README.md) separates shared machine browsing from Library and adds a lazy file tree, local format icons and a read-only source view. Its focused desktop/mobile and native read-only evidence preserves the open product/distribution gates.

## Active milestones

| Order | Milestone | Status | Layer | Depends on |
| --- | --- | --- | --- | --- |
| 1 | [NMA-047 · Fondasi harness-first, kontrak domain dan pensiun runtime lama](NMA-047.md) | Done | Engine / Backend | None |
| 2 | [NMA-048 · Broker harness, minimum version dan kontrak koneksi/tools](NMA-048.md) | Done | Engine / Backend | [NMA-047](NMA-047.md) |
| 3 | [NMA-049 · Adapter native Codex / ChatGPT](NMA-049.md) | Done | Engine / Backend | [NMA-048](NMA-048.md) |
| 4 | [NMA-050 · Adapter Muse Code melalui SDK/MSP](NMA-050.md) | Done | Engine / Backend | [NMA-048](NMA-048.md) |
| 6 | [NMA-052 · Agent persisten, Tobi, DM dan conversational configuration API](NMA-052.md) | Done | Engine / Backend | [NMA-048](NMA-048.md), [NMA-049](NMA-049.md), [NMA-050](NMA-050.md) |
| 7 | [NMA-053 · Antrean, steer, conversational stop dan durable recovery API](NMA-053.md) | Done | Engine / Backend | [NMA-052](NMA-052.md) |
| 8 | [NMA-054 · Workspace, lampiran, artifact dan native coding tools API](NMA-054.md) | Done | Engine / Backend | [NMA-053](NMA-053.md) |
| 9 | [NMA-055 · Memory, inherited skills dan app-owned learning tools/API](NMA-055.md) | Done | Engine / Backend | [NMA-054](NMA-054.md) |
| 10 | [NMA-056 · Grup, model-based routing, handoff dan HITL API](NMA-056.md) | Done | Engine / Backend | [NMA-053](NMA-053.md), [NMA-055](NMA-055.md) |
| 11 | [NMA-057 · Automatic goals, Routine dan proactive continuation API](NMA-057.md) | Done | Engine / Backend | [NMA-053](NMA-053.md), [NMA-055](NMA-055.md), [NMA-056](NMA-056.md) |
| 12 | [NMA-058 · Browser-use MCP, VNC dan browser-session API](NMA-058.md) | Done | Engine / Backend | [NMA-053](NMA-053.md), [NMA-054](NMA-054.md) |
| 13 | [NMA-059 · Composio, riset web dan multimodal capability API](NMA-059.md) | Done | Engine / Backend | [NMA-048](NMA-048.md), [NMA-053](NMA-053.md), [NMA-054](NMA-054.md), [NMA-055](NMA-055.md), [NMA-058](NMA-058.md) |
| 13.5 | [NMA-065 · Agent/group creation and conversational personalization API](NMA-065.md) | Done | Engine / Backend | [NMA-052](NMA-052.md), [NMA-053](NMA-053.md), [NMA-055](NMA-055.md), [NMA-056](NMA-056.md), [NMA-057](NMA-057.md) |
| 14 | [NMA-060 · Gate engine/backend dan kontrak API siap untuk UI](NMA-060.md) | Done | Engine / Backend | [NMA-049](NMA-049.md), [NMA-050](NMA-050.md), [NMA-052](NMA-052.md), [NMA-053](NMA-053.md), [NMA-054](NMA-054.md), [NMA-055](NMA-055.md), [NMA-056](NMA-056.md), [NMA-057](NMA-057.md), [NMA-058](NMA-058.md), [NMA-059](NMA-059.md), [NMA-065](NMA-065.md) |
| 15 | [NMA-061 · UI percakapan, agent dan koneksi berbasis API siap](NMA-061.md) | Done | UI | [NMA-060](NMA-060.md) |
| 16 | [NMA-062 · UI grup, goals/Routine, workspace dan browser VNC](NMA-062.md) | Done | UI | [NMA-060](NMA-060.md), [NMA-061](NMA-061.md) |
| 17 | [NMA-063 · Acceptance UI dan alur produk wajib harness-first](NMA-063.md) | Backlog | UI | [NMA-061](NMA-061.md), [NMA-062](NMA-062.md) |
| 18 | [NMA-064 · Instalasi lokal dan distribusi setelah produk siap](NMA-064.md) | Backlog | Distribusi | [NMA-063](NMA-063.md) |

## Desktop Rust parity plan

The [observation, architecture and parity contract](../architecture/desktop-rs-plan-2026-11-07.md) maps the current host/client and retained evidence to six ordered implementation slices. Orders 16.1–16.6 insert this separate plan after the NMA-061/062 reference; existing NMA-063/064 dependencies are unchanged. Initial verification targets the current macOS ARM64 development host. Other platforms, fresh-device installation and active-host replacement retain their separate decisions/gates.

| Order | Milestone | Status | Layer | Depends on |
| --- | --- | --- | --- | --- |
| 16.1 | [NMA-066 · Desktop Rust foundation, reference baseline and reusable components](NMA-066.md) | Done | Desktop / UI foundation | [NMA-060](NMA-060.md), [NMA-061](NMA-061.md), [NMA-062](NMA-062.md) |
| 16.2 | [NMA-067 · Rust avatar, composer and rich-content components](NMA-067.md) | Done | Desktop / UI components | [NMA-066](NMA-066.md) |
| 16.3 | [NMA-068 · API-backed workspace and conversation parity](NMA-068.md) | Done | Desktop / Conversation | [NMA-060](NMA-060.md), [NMA-065](NMA-065.md), [NMA-067](NMA-067.md) |
| 16.4 | [NMA-069 · Context panels, Settings and Focus workflows](NMA-069.md) | Backlog | Desktop / Contextual work | [NMA-068](NMA-068.md) |
| 16.5 | [NMA-070 · Computer, native host and lifecycle parity](NMA-070.md) | Backlog | Desktop / Native integration | [NMA-069](NMA-069.md) |
| 16.6 | [NMA-071 · Desktop parity acceptance and development bundle](NMA-071.md) | Backlog | Desktop / Verification | [NMA-070](NMA-070.md) |

The intended sequence is foundation/gallery and high-risk renderer paths → full avatar/composer/content components → actual API conversation → contextual work/settings/files → Computer/native lifecycle → integrated parity and local development bundle. The first two slices are accepted under the recorded owner decision; their remaining technical checks are optional. Later slices retain their own acceptance, without silently inheriting those checks as mandatory work.

Each milestone has six ordered internal subtasks with deliverables/evidence; no additional milestone IDs are introduced. The [native rendering contract](../architecture/desktop-rs-plan-2026-11-07.md#rendering-ownership-contract) requires Rust/GPUI application UI, including native PDF controls/rendering. WebViews are limited to HTML document content and the scoped Computer viewer; forwarding the existing React client does not satisfy the plan.

The [NMA-068 implementation handoff](../verification/nma-068/README.md) adds the native API workspace, conversation controls and durable journal. The owner requested implementation with bounded checks; focused native/API journeys and recovery receipts are retained. NMA-068 is Done for its implemented workspace/conversation scope and bounded native/API evidence and does not promote later milestones.

## Next gates

NMA-063 validates the full current product with real API desktop/mobile journeys and both required harnesses after NMA-060/061/062. It remains Backlog; this documentation handoff does not run that acceptance or promote it automatically. NMA-064 follows NMA-063 for fresh-device local installation. A macOS ARM64 Tauri development bundle does not satisfy the fresh-device gate.

Delivery remains engine/backend → API readiness → UI → product acceptance → installation. Reverify affected API deltas before UI consumption. Optional/deferred features are not hidden dependencies. IDs are stable; NMA-065 order 13.5 is an inserted backend amendment, not work after installation.

## Deferred reference

[NMA-051](NMA-051.md) is Backlog under the Deferred plan: Claude Code and additional harnesses/ACP integrations. Its technical prerequisite would be NMA-048 if promoted. No active milestone depends on it.

## Coverage and maintenance

[Feature ownership](feature-coverage.md) accounts for all 83 product/runtime/foundation decision identities. [status.json](status.json) provides the same milestone metadata for validation. Individual milestone files carry exact scope and checklists; current product/architecture amendments explain how historical browser/file/native-client wording is interpreted today.

Update the individual record, this table, status metadata, affected specifications and traceable evidence together. Done requires completed acceptance and dependencies. Historical NMA-001–046 belong to their former scope and are available through [Git history](../development/history.md); they are not an execution queue or a prerequisite for the current architecture.
