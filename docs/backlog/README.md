# Local backlog and delivery status

Latest ACP follow-up: [Pi context and native API 2.4](../verification/acp-2026-11-16/pi-context/README.md) verifies changed instructions, scoped DM/group context and skill packages, plus actual Tauri generic configuration import and key-free OpenCode Free creation. Concurrent tool journal updates now preserve every completion without serializing handlers. The [native harness credentials and failure handling](../verification/acp-2026-11-16/native-harnesses/README.md) capture retains useful Pi turns/reload, controls, rejection and private work for two app users with distinct Cua domains. Sumopod remains a Pi test input, not a registered product provider. OpenCode Free successful inference, full native parity, distinct provider identities and actual renewal/expiry stay open; Claude remains unverified by owner choice. Earlier captures remain unchanged.

Free-form owner scope, November 16: [ACP harness migration](../architecture/acp-harnesses.md) is **In Progress**, with [initial evidence](../verification/acp-2026-11-16/README.md), the [profile/API follow-up](../verification/acp-2026-11-16/profiles/README.md) and [source cutover/shared-picker capture](../verification/acp-2026-11-16/cutover/README.md). Codex/Claude/OpenCode/Pi execution uses ACP, Muse retains SDK/MSP, and the replaced Codex execution paths are retired. The app and onboarding share one current-harness model picker; desktop/mobile browser and native Tauri fixture-backed journeys pass. Native Claude remains unverified by owner choice, and the remaining multi-profile inference/account-isolation cohort stays open. Historical milestone statuses retain their captured scope.

This backlog is the authority for milestone scope, acceptance, dependencies and status. Read [PRODUCT.md](../../PRODUCT.md), [feature decisions](../product/feature-decisions.md), [architecture](../architecture/overview.md) and [acceptance gates](../development/acceptance.md) before changing the relevant boundary. [The workflow](../development/workflow.md) defines how to maintain these records locally.

Status was initially reconciled on 2026-11-06, updated on 2026-11-09 for focused completion of NMA-071, and expanded on 2026-11-12 with the server-organizations plan. Sixteen earlier active milestones and six Desktop Rust milestones are Done; NMA-072 is Done for its verified PostgreSQL/import scope; NMA-073 is Done for its [verified backend authentication/headless native scope](../verification/nma-073/README.md); NMA-074 is Done for its [verified organization-administration scope](../verification/nma-074/README.md); NMA-075 is Done for scoped application data; NMA-076 is Done for execution-domain isolation; NMA-077 is Done for its verified provider-connection scope; NMA-078 is Done for [scoped app accounts and Team skills](../verification/nma-078/README.md); NMA-079 is Done for its verified API/isolation gate; NMA-080 is Done for its verified web-client scope; NMA-081 is Done for its [verified Tauri remote scope](../verification/nma-081/README.md); NMA-082 is Done for its deployment/recovery scope; NMA-083 is Done for its focused integrated acceptance; NMA-063/NMA-064 remain Backlog. NMA-051 is a separate deferred reference, not an active prerequisite. Recorded Done covers its accepted scope only. Later Cua, semantic-routing, Tauri and conversation refinements retain their dedicated evidence; they do not complete product-wide acceptance or fresh-device distribution.

The six [Desktop Rust milestones below](#desktop-rust-parity-plan) have NMA-066–071 **Done**. The [2026-11-08 owner decision](../development/nma-066-067-closure-2026-11-08.md) accepts the implemented foundation and native avatar, composer and rich-content components, with remaining technical verification non-blocking. [Foundation](../verification/nma-066/README.md) and [component evidence](../verification/nma-067/README.md) retain actual executed results, failures and optional unexecuted checks. Tauri remains active; integrated parity and host replacement retain their separate decisions/gates.

The November 9 [NMA-071 completion](../verification/nma-071/README.md) delivers the requested UI/table/bubble/width refinements, complete component source coverage, focused native/API journeys and a verified local bundle under the [owner's bounded completion scope](../development/nma-071-closure-scope-2026-11-09.md). Exhaustive captures and paired 1:1 performance are not closure prerequisites; Muse remains a separate follow-up.

The later [native conversation presentation amendment](../verification/nma-071/conversation-layout-2026-11-09.md) refines the header gradient, message bounds, tables that fill their bubble, attachment chips and hover actions. NMA-071 remains Done for its accepted scope; the retained bundle and provider evidence keep their original revisions.

The [2026-11-07 sidebar loading refinement](../verification/sidebar-loading-2026-11-07/README.md) adds focused desktop/mobile evidence under NMA-061. Milestone statuses and dependencies are unchanged.

The [2026-11-07 conversation chronology refinement](../verification/conversation-chronology-2026-11-07/README.md) adds centered day groups and consistent message/card clocks, with Goal/Routine event bars remaining without clocks. It retains NMA-061's status and the open product/distribution gates.

The [2026-11-07 Focus content viewer amendment](NMA-062.md#focus-content-viewer-amendment--2026-11-07) implements the selected conversation file/table composition, with later PDF preview and conversation-style header refinements under the same milestone. Its focused verification and limitations are retained separately; milestone statuses and open product/distribution gates are unchanged.

The [2026-11-07 Working files/source viewer amendment](../verification/working-files-tree-2026-11-07/README.md) separates shared machine browsing from Library and adds a lazy file tree, local format icons and a read-only source view. Its focused desktop/mobile and native read-only evidence preserves the open product/distribution gates.

The [2026-11-11 Settings screen/preferences amendment](../verification/settings-screen-2026-11-11/README.md) replaces the web/Tauri modal with a full screen, expands its functional sections and adds the permanent compact icon rail with borderless contextual sidebars while preserving conversation continuity. It is a scoped NMA-061 presentation/preference amendment; native Rust and all milestone statuses/dependencies retain their recorded scope.

## Active milestones

The [2026-11-11 Marketplace screen amendment](../verification/marketplace-screen-2026-11-11/README.md) adds the requested web/Tauri Plugins/Skills catalog and detail screens, with a lower `Store02Icon` rail entry, direct plugin installation/account management and scoped available skills. The [management follow-up](../verification/marketplace-screen-2026-11-11/plugin-management/README.md) removes app management from Settings and uses one `rounded-sm` `Install plugin` detail action. The [sidebar refinement](../verification/marketplace-screen-2026-11-11/sidebar/README.md) shares Settings menu presentation and agent-list surfaces. The [catalog/authorization hardening](../verification/marketplace-screen-2026-11-11/catalog-and-authorization/README.md) adds provider metadata and automatic pagination, English plugin-only Installed navigation, category sections, URL logos, skeleton/toast feedback, install progress and the native browser handoff under contract 1.32.0. The [category navigation follow-up](../verification/marketplace-screen-2026-11-11/category-navigation/README.md) adds Title Case six-item category previews, full category pages and atomic/cached catalog rendering. It is a bounded presentation/discovery promotion under NMA-061; public package installation/publishing and native Rust parity are separate. Milestone statuses and dependencies are unchanged.

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
| 17 | [NMA-063 · Acceptance UI dan alur produk wajib harness-first](NMA-063.md) | Backlog | UI | [NMA-061](NMA-061.md), [NMA-062](NMA-062.md), [NMA-083](NMA-083.md) |
| 18 | [NMA-064 · Instalasi lokal dan distribusi setelah produk siap](NMA-064.md) | Backlog | Distribusi | [NMA-063](NMA-063.md) |

## Server organizations plan

The owner requested this [main implementation plan](../architecture/server-organizations-plan-2026-11-12.md) on 2026-11-12, after selecting PostgreSQL and web/Tauri as the implementation focus. It promotes account authentication, multiple organizations, Owner/Admin/Member, Workgroups, personal/Team agents, private context, explicit personal/organization provider and app connections, enforced execution domains and a central HTTPS server. NMA-072 is Done for its [single-owner PostgreSQL and disposable import/rollback scope](../verification/nma-072/README.md); NMA-073 is Done for its [backend authentication/headless native scope](../verification/nma-073/README.md); NMA-074 is Done for its [organization-administration scope](../verification/nma-074/README.md), and NMA-075 is Done for scoped application data; NMA-076 is Done for [execution-domain isolation](../verification/nma-076/README.md); NMA-077 is Done for its verified provider-connection scope; NMA-078 is Done for [scoped app accounts and Team skills](../verification/nma-078/README.md); NMA-079 is Done for its verified API/isolation gate; NMA-080 is Done for its verified web-client scope; NMA-081 is Done for its [verified Tauri remote scope](../verification/nma-081/README.md); NMA-082 is Done for its deployment/recovery profile; NMA-083 is Done for its focused integrated acceptance. The backend API and web-client journeys have their own verified scope; Integrated product journeys retain NMA-083; the deployed NMA-082 report defines its bounded client/provider/recovery proof. Assigned people and dates remain unset. Orders 16.7–16.81 insert this sequence before the expanded NMA-063 gate.

| Order | Milestone | Status | Layer | Depends on |
| --- | --- | --- | --- | --- |
| 16.7 | [NMA-072 · PostgreSQL persistence and controlled SQLite cutover](NMA-072.md) | Done | Engine / Backend | [NMA-060](NMA-060.md) |
| 16.71 | [NMA-073 · User authentication, device sessions and owner bootstrap](NMA-073.md) | Done | Engine / Backend | [NMA-072](NMA-072.md) |
| 16.72 | [NMA-074 · Organizations, administrative roles and Workgroups](NMA-074.md) | Done | Engine / Backend | [NMA-073](NMA-073.md) |
| 16.73 | [NMA-075 · Private and Team agents with scoped data and events](NMA-075.md) | Done | Engine / Backend | [NMA-074](NMA-074.md) |
| 16.74 | [NMA-076 · Execution domains, browser files and viewer isolation](NMA-076.md) | Done | Engine / Backend | [NMA-075](NMA-075.md) |
| 16.75 | [NMA-077 · Personal and organization AI connections on server harnesses](NMA-077.md) | Done | Engine / Backend | [NMA-076](NMA-076.md) |
| 16.76 | [NMA-078 · Scoped MCP accounts and published agent skills](NMA-078.md) | Done | Engine / Backend | [NMA-077](NMA-077.md) |
| 16.77 | [NMA-079 · Server organizations API and isolation readiness gate](NMA-079.md) | Done | Engine / Backend | [NMA-072](NMA-072.md), [NMA-073](NMA-073.md), [NMA-074](NMA-074.md), [NMA-075](NMA-075.md), [NMA-076](NMA-076.md), [NMA-077](NMA-077.md), [NMA-078](NMA-078.md) |
| 16.78 | [NMA-080 · Web onboarding, organization management and agent access UI](NMA-080.md) | Done | UI | [NMA-079](NMA-079.md) |
| 16.79 | [NMA-081 · Tauri remote profiles and secure user sessions](NMA-081.md) | Done | Desktop / Web client host | [NMA-079](NMA-079.md), [NMA-080](NMA-080.md) |
| 16.8 | [NMA-082 · Single-server HTTPS deployment and recovery runbook](NMA-082.md) | Done | Deployment / Operations | [NMA-079](NMA-079.md), [NMA-081](NMA-081.md) |
| 16.81 | [NMA-083 · Integrated multi-organization web and Tauri acceptance](NMA-083.md) | Done | Product / Verification | [NMA-080](NMA-080.md), [NMA-081](NMA-081.md), [NMA-082](NMA-082.md) |

The dependency diagram, implementation defaults, migration approach and evidence matrix live in the main plan. A personal interaction remains private even when another person uses the same Team agent. Separate users/organizations cannot rely on a common sudo-capable desktop for private working files.

## Desktop Rust parity plan (historical)

The November 15 owner cleanup removed both GPUI implementations and their dedicated tooling, superseding the November 12 pause. The six Done milestones below retain historical acceptance and are not active work or dependencies of the web/Tauri organization plan. See [source recovery](../development/history.md#retired-gpui-clients--2026-11-15) and the [retirement report](../verification/desktop-retirement-2026-11-15/README.md).

The [observation, architecture and parity contract](../architecture/desktop-rs-plan-2026-11-07.md) maps the current host/client and retained evidence to six ordered implementation slices. Orders 16.1–16.6 insert this separate plan after the NMA-061/062 reference; existing NMA-063/064 dependencies are unchanged. Initial verification targets the current macOS ARM64 development host. Other platforms, fresh-device installation and active-host replacement retain their separate decisions/gates.

| Order | Milestone | Status | Layer | Depends on |
| --- | --- | --- | --- | --- |
| 16.1 | [NMA-066 · Desktop Rust foundation, reference baseline and reusable components](NMA-066.md) | Done | Desktop / UI foundation | [NMA-060](NMA-060.md), [NMA-061](NMA-061.md), [NMA-062](NMA-062.md) |
| 16.2 | [NMA-067 · Rust avatar, composer and rich-content components](NMA-067.md) | Done | Desktop / UI components | [NMA-066](NMA-066.md) |
| 16.3 | [NMA-068 · API-backed workspace and conversation parity](NMA-068.md) | Done | Desktop / Conversation | [NMA-060](NMA-060.md), [NMA-065](NMA-065.md), [NMA-067](NMA-067.md) |
| 16.4 | [NMA-069 · Context panels, Settings and Focus workflows](NMA-069.md) | Done | Desktop / Contextual work | [NMA-068](NMA-068.md) |
| 16.5 | [NMA-070 · Computer, native host and lifecycle parity](NMA-070.md) | Done | Desktop / Native integration | [NMA-069](NMA-069.md) |
| 16.6 | [NMA-071 · Desktop parity acceptance and development bundle](NMA-071.md) | Done | Desktop / Verification | [NMA-070](NMA-070.md) |

The intended sequence is foundation/gallery and high-risk renderer paths → full avatar/composer/content components → actual API conversation → contextual work/settings/files → Computer/native lifecycle → integrated parity and local development bundle. The first two slices are accepted under the recorded owner decision; their remaining technical checks are optional. Later slices retain their own acceptance, without silently inheriting those checks as mandatory work.

Each milestone has six ordered internal subtasks with deliverables/evidence; no additional milestone IDs are introduced. The [native rendering contract](../architecture/desktop-rs-plan-2026-11-07.md#rendering-ownership-contract) requires Rust/GPUI application UI, including native PDF controls/rendering. WebViews are limited to HTML document content and the scoped Computer viewer; forwarding the existing React client does not satisfy the plan.

The [NMA-068 implementation handoff](../verification/nma-068/README.md) adds the native API workspace, conversation controls and durable journal. The owner requested implementation with bounded checks; focused native/API journeys and recovery receipts are retained. NMA-068 is Done for its implemented workspace/conversation scope and bounded native/API evidence and does not promote later milestones.

The [November 15 account-only cleanup](../verification/accounts-only-2026-11-15/README.md) supersedes optional local account activation and Tauri backend supervision. It leaves historical milestone statuses unchanged; subsequent verification is retained separately.

## Next gates

The [server-organizations plan](../architecture/server-organizations-plan-2026-11-12.md) expands the current product target. NMA-072–078 deliver PostgreSQL/auth/scoped backend behavior, NMA-079 verifies its API, NMA-080/081 deliver web/Tauri, NMA-082 rehearses deployment and restore, and NMA-083 provides focused acceptance before NMA-063. Historical NMA-060 readiness does not certify this delta.

NMA-063 validates the full current product with real API desktop/mobile journeys and both required harnesses after the retained NMA-060/061/062 baseline and the new NMA-083 focused server-organizations acceptance. It remains Backlog; this documentation handoff does not run that acceptance or promote it automatically. NMA-064 follows NMA-063 for fresh-device installation. A macOS ARM64 Tauri development bundle does not satisfy the fresh-device gate.

Delivery remains engine/backend → API readiness → UI → product acceptance → installation. Reverify affected API deltas before UI consumption. Optional/deferred features are not hidden dependencies. IDs are stable; NMA-065 order 13.5 is an inserted backend amendment, not work after installation.

## Deferred reference

[NMA-051](NMA-051.md) is Backlog under the Deferred plan: Claude Code and additional harnesses/ACP integrations. Its technical prerequisite would be NMA-048 if promoted. No active milestone depends on it.

## Coverage and maintenance

[Feature ownership](feature-coverage.md) accounts for all 83 product/runtime/foundation decision identities. [status.json](status.json) provides the same milestone metadata for validation. Individual milestone files carry exact scope and checklists; current product/architecture amendments explain how historical browser/file/native-client wording is interpreted today.

Update the individual record, this table, status metadata, affected specifications and traceable evidence together. Done requires completed acceptance and dependencies. Historical NMA-001–046 belong to their former scope and are available through [Git history](../development/history.md); they are not an execution queue or a prerequisite for the current architecture.

The November 9 [retained native conversation-state amendment](../verification/nma-068/retained-threads-2026-11-09.md) supplements NMA-068 with the owner-requested Zed pattern. Existing milestone metadata/status and the NMA-063/NMA-064 gates are unchanged; original acceptance captures retain their original source scope.

Its subsequent [conversation transition refinement](../verification/nma-068/conversation-transitions-2026-11-09.md) fixes avatar/layout continuity, initial composer presentation and uncached conversation loading within the same native milestone scope.

The November 9 [native conversation tools follow-up](../verification/nma-071/conversation-tools-2026-11-09.md) adds scoped find, composer/queue refinements and searchable model selection. NMA-071 remains Done for its captured accepted scope; earlier bundles/provider evidence retain their original revisions.

The 2026-11-11 owner-requested Marketplace performance refinement adds a seven-day persistent metadata cache, stale background refresh and bounded initial row/logo rendering while retaining live installation status. [NMA-061](NMA-061.md#marketplace-persistent-catalog-cache-and-rendering--2026-11-11) and [focused evidence](../verification/marketplace-screen-2026-11-11/performance-cache/README.md) record the amendment; delivery statuses and dependencies are unchanged.

The November 15 owner-requested [account-entry redesign](../product/interface.md#web-and-tauri-account-entry--2026-11-15) amends [NMA-080](NMA-080.md#account-entry-visual-amendment--2026-11-15) and [NMA-081](NMA-081.md#shared-account-entry-visual-amendment--2026-11-15) with a shared design-system composition and subtly dithered office artwork. [Initial evidence](../verification/sign-in-redesign-2026-11-15/README.md) and the [gradient-button/secondary-signup/desktop-URL follow-up](../verification/button-gradient-2026-11-15/README.md) retain their captured scopes separately. Milestone statuses, dependencies and status metadata remain unchanged.
