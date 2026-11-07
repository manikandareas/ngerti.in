# Current architecture

[Product scope](../../PRODUCT.md) defines the intended behavior; [the local backlog](../backlog/README.md) defines milestone status and dependencies. This overview reconciles the harness-first foundation with the shared-machine amendment and the implemented Tauri development host. Detailed API guides retain their original contract-version boundaries; the [consumer contract](api-consumer-contract.md) and installed `/v1/contracts` export define executable schemas.

## Ownership

| Component | Authority |
| --- | --- |
| Ngertiin application | Agent/thread/Goal/Routine identity, admission, FIFO queue, domain persistence, command receipts, event publication, cancellation intent and recovery decisions. |
| Harness broker/adapter | Executable/version negotiation, capabilities, selected account/model/settings, native process/protocol, native-session binding and supported stop/resume/steer. |
| Codex and Muse | Their own inner agent/model/tool loops and native provider authentication. |
| Backend API | Authenticated command/query/event projections, resource authorization, product-tool gateway and file/viewer transport. |
| Web client | Conversation workspace and authoritative state/event rendering. |
| Tauri host | macOS ARM64 development WebView, same-origin gateway and local backend supervision; application lifecycle remains in the backend. |
| GPUI experiment | Separate native visual/interactivity prototype with fixture state and optional read-only Computer viewing; no domain lifecycle or active-client replacement authority. |
| Cua machine | Shared Linux browser, desktop, terminal processes and working files. |

The active workspaces are `apps/server`, `apps/web-client`, `apps/desktop`, and `packages/avatar`. Backend composition, scheduler and dispatcher run under one Bun application authority backed by owner-bound SQLite. Native operations run outside short database transactions. There is no parallel Hermes scheduler or second application model loop.

The separately planned [desktop-rs client](desktop-rs-plan-2026-11-07.md) targets GPUI presentation parity through NMA-066–071. NMA-066 is In Progress; the remaining five milestones are Backlog. Its implemented independent Cargo workspace contains `desktop`, `client` and `avatar` crates separating GPUI UI/host integration, read-only backend consumption and renderer-independent avatar logic. The [foundation report](../verification/nma-066/README.md) records native proofs and required capability gaps. The current Tauri application remains active, and a future native client consumes the existing API without becoming another domain lifecycle authority.

Desktop-rs owns native Rust/GPUI application presentation. Its browser adapter is limited to static HTML document content and scoped Computer viewing; native PDF rendering and GPUI controls remain outside that adapter. The existing React bundle is not the desktop-rs shell. The plan's [rendering ownership contract](desktop-rs-plan-2026-11-07.md#rendering-ownership-contract) defines the source/runtime checks required for acceptance.

## Harnesses, billing and tools

Only Codex/ChatGPT through App Server and Muse Code through the official SDK/MSP are required. Minimum/tested versions, capability states and credential ownership are defined per adapter, not inferred from a CLI existing on another host. Process-wide account/model configuration must not change another agent silently.

Login, model discovery, completed inference and useful product-tool execution are separate proof stages. Authentication method differs from effective billing. The accepted gate configuration is Codex ChatGPT subscription and explicitly selected Muse API key; Muse subscription remains unverified. Unsupported or unknown behavior remains visible.

Structured product tools expose configuration, Goals/Routine, memory, app-owned skills, artifacts and collaboration through the adapters. The server derives owner/connection/agent/thread/run/binding scope and rechecks current membership, grants and capabilities before dispatch. Native notifications are not equivalent to arbitrary prose commands.

## Durable data and recovery

Stable identities bind conversations, messages, native sessions, runs, Goals, Routine occurrences, interactions, handoffs, memory revisions, skill revisions and artifacts. Domain mutations, idempotency receipts and published events commit together. Repeated operation keys replay the original result; changed input conflicts.

A native acknowledgement is not completion. Cancellation intent is not native stop confirmation. Unknown side effects or lost acknowledgements block unsafe replay until authoritative receipts reconcile them. Membership/grant changes fence queued or late work. Recovery can replace a native session while retaining product identity/history.

For details use [foundation](harness-first-contract.md), [broker](harness-broker-contract.md), [conversation controls](conversation-control-api.md), [groups](group-collaboration-api.md), [Goals/Routine](goals-routines-api.md), [memory/skills](memory-skills-api.md) and [workspace/artifacts](workspace-artifact-api.md).

## Shared machine

The active path is Ngertiin → `@trycua/cua` 0.10.1 → pinned Linux image with observed spacesd 0.8.0 → bundled Driver contract 1. One retained local desktop belongs to the installation/owner and is shared by all agents. Browser, terminal, working files and the Computer viewer refer to this same machine. The former browser-use/VNC path remains an original milestone/API record, not a second active controller.

Harnesses run on the host with a private control working directory. Machine sessions use scoped product tools for actual work, with native host shell/file writes disabled as documented by adapter evidence. Private native history, credentials and immutable saved-artifact bytes remain in backend storage. Shared working files and attachment copies are visible to authorized agents on the common OS; logical workspace scope does not provide OS filesystem isolation.

Foreground mutations use a durable agent-or-human input lease. Transfer waits for in-flight input and media closure. Read-only Cua tickets enforce observation; interactive tickets bind to a lease revision, expire on disconnect and revoke on handback. Unknown outcomes hold the input gate until reconciliation. Attributed terminal processes can run concurrently; cancelling a run does not kill the machine. File I/O runs outside SQLite transactions and publication rechecks scope before persisting immutable bytes.

The tested stock Cua image is a cooperative shared device with sudo access. Its explicit unrestricted Driver startup is required by the recorded retained-profile/arbitrary-desktop limitations of bounded manifests. Gateway scoping is not adversarial isolation against shell administrators. Remote/VPS attachment and multi-machine enrollment remain unimplemented.

Use [the machine plan and trust analysis](shared-machine-cua-plan-2026-11-04.md), [setup and native evidence](../verification/shared-machine/README.md), [task-window cleanup](../verification/shared-machine/cleanup-2026-11-04.md) and [viewer transport research](../research/computer-preview-transport-2026-11-06.md).

## Current evidence and phase boundaries

The NMA-060 initial gate was accepted at contract 1.16.0. Later amendments include attachments, shared group responsibilities, semantic routing, public activity and the shared-machine API delta at 1.29.0. Contract 1.30.0 added task-owned window cleanup; the current source and regenerated full export are 1.31.0, including interaction/retry/Computer changes. Each has its own proof and limitations; the original gate does not certify every future delta.

The Tauri development host is implemented and Electron is retired; see [development setup/lifecycle](tauri-development.md) and [native verification](../verification/tauri-development/README.md). Fresh-device distribution and production are open. Later conversation interactions and Computer refinements have [implementation evidence](../verification/conversation-implementation-2026-11-06/README.md) and [follow-up evidence](../verification/conversation-followup-2026-11-06/report.html). Detailed milestones remain in [the backlog](../backlog/README.md).
