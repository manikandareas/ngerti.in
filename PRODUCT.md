# Ngertiin product scope

This repository is the authority for Ngertiin product decisions, implementation scope, acceptance and delivery status. Start with [the documentation index](docs/README.md), [feature decisions](docs/product/feature-decisions.md), and [the local backlog](docs/backlog/README.md). Explicit user decisions take precedence and must be recorded locally when they change scope.

Ngertiin is a persistent agent workspace for one human owner, private DMs and groups. Agents can use tools, collaborate, retain scoped memory, and continue durable responsibilities through Goals and Routine while the backend and harness host remain alive. Closing a tab does not stop work; a sleeping or powered-off host cannot execute.

## Product behavior

- Tobi, its primary DM and an authored welcome are created idempotently. Reopening a conversation reads history without model inference.
- One conversation workspace is the main interface. The left sidebar lists agents/groups and their chats. Detail contains contextual profile/member, Goals and Routine views; Library contains scoped saved artifacts and contextual memory/skills; Computer shows the shared machine. A folder action beside the contextual panel's Close opens shared Working files as a file tree. Files use the Focus viewer, including a read-only source-code view. Settings opens in place. See [interface behavior](docs/product/interface.md).
- Create agent immediately creates an owner-unique library-generated name, default avatar and DM using the selected connection/model/billing defaults. Create group asks for a name and valid owned agents. Each intentional creation has one durable human-authored automatic opener and admission; retry, reconnect or restart does not repeat it.
- Personalization follows useful work. Ask one necessary question, accept a clear task immediately, and update profiles or shared group directions through scoped tools. Name, role, persona, Goals and working style are examples, not a required checklist. Failed opening preserves the created entity and conversation.
- Agent identity persists across DM/group use. Native sessions, transcript, private memory and saved-artifact metadata retain their logical scope. Group updates do not rewrite every member's private profile.
- Groups contain one human owner and their agents. Valid explicit mentions select the target; semantic routing otherwise chooses the first member asked to act. Only the selected member speaks. Handoff/review transfers real work without requiring the human to relay instructions. See [conversation behavior](docs/product/conversations.md).
- Busy conversations retain FIFO input with edit/delete before dispatch. Contextual steer uses native capability; cancellation through agent-selected tools and the direct control endpoint has separate receipt semantics. Stop intent differs from native confirmation; stop run differs from stopping a Goal or Routine.
- Goals preserve outcomes needing durable ownership, progress and follow-through, or explicit Goal tracking. An ordinary request, many steps, file output, research or temporary wait alone does not require a Goal. Standalone reminders/checks may use Routine without a Goal. See [responsibilities](docs/product/goals-routine.md).

## Runtime and machine

Ngertiin owns one application lifecycle: identity, admission, queue, persistence, events, scheduling, stop intent and recovery. Codex/ChatGPT App Server and Muse Code SDK/MSP own their inner model/tool loops. Bun + TypeScript + Elysia + SQLite is the implemented foundation. ACP is an optional transport, not a requirement for a generic runtime registry. Hermes and additional harnesses remain deferred; there is no legacy runtime fallback.

Subscription and API-key billing remain distinct. Use only the selected connection; never silently switch billing. The accepted NMA-050/NMA-060 scope verifies ChatGPT subscription and explicitly selected Muse API-key billing. Muse subscription remains unverified. Missing or unsupported capability is represented honestly, with actionable errors and redacted diagnostics.

One persistent local Linux desktop per installation/owner is shared by all agents through Cua SDK → cua-spacesd → Driver. Browser, terminal, working files and attachment copies use that same machine. Foreground input has one agent-or-human lease; terminal processes may run concurrently. Private history, memory, provider credentials and immutable artifact bytes remain in the backend. The shared working root is a cooperative device, not adversarial OS isolation between authorized agents. See [architecture and trust boundaries](docs/architecture/overview.md).

Composio supplies app connections. Application skills and inherited harness skills are separate: agents create/repair only app-owned packages. Source availability does not promote an upstream feature into scope.

## Optional and deferred work

The [83-row decision register](docs/product/feature-decisions.md) retains every selected decision and note. Optional work requires an explicit promotion before becoming an acceptance commitment: VPS, advanced CLI editor, managed harness updates, full connection/usage dashboards, context meter/search/fork UI, temporary subagents, webhooks, image/document generation and app previews.

Deferred work includes additional runtimes, full web login/pairing, local model endpoints/managers, agent import/export, marketplace, voice, external messaging channels, multiple humans/RBAC, remote/multi-host enrollment and platform hosting/billing services. Basic resource authorization and secret protection remain required independently of deferred account login.

The Tauri macOS ARM64 host is the active implemented development desktop application. A separately authorized GPUI visual/interactivity experiment lives in `apps/gpui-experiment`; it has fixture-only conversation state and no application lifecycle authority. The user-requested [NMA-066–071 desktop-rs plan](docs/architecture/desktop-rs-plan-2026-11-07.md) targets the current desktop's visual and behavioral parity. [NMA-066](docs/backlog/NMA-066.md) and [NMA-067](docs/backlog/NMA-067.md) are **Done** for the implemented native foundation, avatar, composer, messages and rich-content/document components. The [2026-11-08 owner decision](docs/development/nma-066-067-closure-2026-11-08.md) accepts remaining technical verification as non-blocking; [foundation](docs/verification/nma-066/README.md) and [component evidence](docs/verification/nma-067/README.md) preserve actual results and limitations. NMA-068 is Done for the implemented native workspace/conversation with bounded native/API evidence; NMA-069 is Done for native Detail/Library, in-place Settings, Working files and Focus with [bounded native/API evidence](docs/verification/nma-069/README.md); NMA-070 is Done for native Computer/host lifecycle with [bounded evidence](docs/verification/nma-070/README.md); NMA-071 remains Backlog. The backend keeps application lifecycle authority. General native-client distribution, other platforms, fresh-device installation and production readiness retain their separate gates; this closure does not complete NMA-063/NMA-064 or authorize removing the existing host.

The desktop-rs UI is to be authored natively in Rust + GPUI, including the workspace, composer, messages, avatar, panels, Settings, tree and content controls. WebView use is limited to isolated static HTML document content and the existing scoped Computer viewer. PDF uses a native rendering adapter with GPUI controls. The existing React web-client is a reference rather than the new desktop's rendering implementation.

## Delivery and data

Delivery order remains engine/backend → NMA-060 API gate → NMA-061/062 UI → NMA-063 product acceptance → NMA-064 installation. The local backlog records 16 completed active milestones, NMA-063/NMA-064 Backlog, and NMA-051 deferred. A later API delta must be verified before UI consumption; prior acceptance covers its captured scope only.

Historical development data may be reset when needed without a compatibility migration. Limit any reset to the authorized development scope and preserve unrelated work. New-runtime persistence, crash recovery and isolation remain mandatory during ordinary operation. Unknown external outcomes require reconciliation before replay. Rollback uses Git and verified backups.
