# Current interface and product flows

The primary interface is one responsive conversation workspace. The accepted November 1 layout is implemented with later Detail, Library and Computer navigation refinements. Earlier Agent/Anggota, File, Goals and Routine tabs describe contextual content ownership; current labels and placement follow the implementation below.

The user-requested [desktop-rs plan](../architecture/desktop-rs-plan-2026-11-07.md) treats this current interface, later amendments and native Tauri host behavior as the parity reference. It introduces no new product navigation. NMA-066/NMA-067 foundation/components are Done under the [2026-11-08 owner decision](../development/nma-066-067-closure-2026-11-08.md), with remaining technical verification non-blocking. NMA-068 is Done for the implemented native workspace/conversation with bounded native/API evidence; NMA-069 is Done for native contextual workflows with [scope and parity evidence](../verification/nma-069/README.md); NMA-070 is Done for its recorded host/Computer slice; NMA-071 is Done for integrated native development acceptance under the [focused November 9 scope](../development/nma-071-closure-scope-2026-11-09.md), with exact visual/interaction evidence and retained limitations.

For desktop-rs these application surfaces are native Rust/GPUI. Only static HTML document content and the existing ticket-scoped Computer viewer may use embedded browser content; their surrounding workspace/header/composer remain native. PDF uses a native adapter with GPUI controls and selectable-text interaction. See the plan's [rendering ownership contract](../architecture/desktop-rs-plan-2026-11-07.md#rendering-ownership-contract).

## Navigation and content

| Surface | Behavior |
| --- | --- |
| Left navigation | Web/Tauri has a persistent icon rail selecting Conversation or Settings, with agents/groups or Settings sections in the contextual sidebar. The agent/group list is also the chat list; + offers Create agent and Create group. |
| Conversation | Messages, streamed answers, agent activity, authored mentions, sources, attachment/result actions and actionable human questions. |
| Detail | Selected agent/group profile, members/shared directions, contextual Goals and Routine. Advanced memory, skills and instructions stay within contextual navigation. |
| Library | Scoped saved artifacts, file information/sharing and contextual memory/skills. |
| Working files | Dedicated page opened by the folder action beside the contextual panel's Close, available from Details, Library and Computer. Its file tree browses the shared Linux working root used by agents. |
| Computer | The retained Cua desktop; view-only and human takeover observe/control the same machine as agents. |
| Settings | Web/Tauri uses a full application screen beside the persistent rail, with the shared 280px contextual sidebar, borderless content surface and URL-backed sections. The Conversation rail action returns to the retained conversation/draft. The native Rust client retains its separately accepted implementation. |

Clicking the conversation header name/avatar opens contextual detail. Goal/file actions open their relevant details/viewers. Panels can close; on mobile use a sheet/full-screen view with a clear return to chat. There are no mandatory global Agents, Workspace, Goals or Routine pages and no duplicated agent list. Keep tabs/lists legible, with progressive disclosure instead of stacks of cards or badges.

On initial sidebar opening, show row-shaped skeletons until agent/thread/preview/activity data and the visible rows' avatars are ready. Reveal names, previews and portraits together without an artificial minimum delay. Group rows wait for both displayed member portraits. Offscreen rows remain deferred and show their own skeleton until ready when scrolled into view. A failed texture settles to the shaded avatar fallback; normal live refreshes preserve the visible list. See [sidebar loading verification](../verification/sidebar-loading-2026-11-07/README.md).

## Working files

The 2026-11-07 decision separates live machine files from Library. The folder action opens Working files within the same contextual panel; its header contains Back, the title, Refresh and Close. The profile hero and tabs are hidden on this page. Back restores the previous tab/detail; Close closes the panel. The description makes owner-wide shared-machine visibility explicit.

The 2026-11-08 native refinement adopts [Zed project-panel presentation](../research/zed-file-tree-2026-11-08.md): flat full-width rows, regular filenames, aligned icon/disclosure lanes, fixed depth increments, subtle ancestor guides and separate selected/focused states. The native list is virtualized with one retained scroll owner; folder loading/retry/more rows follow their descendants. Shared-machine visibility is stated in a quiet footer. Ngertiin keeps its current Material icons, narrow-panel filename ellipsis/full-path tooltip, contextual navigation and Focus semantics. This is a scoped native tree amendment to the Tauri reference, not a new editor workspace. [Native refinement evidence](../verification/nma-069/zed-tree/README.md) records actual results.

Folders expand inline with chevrons and indentation. Load children only on expansion; append additional pages inside their folder. Loading, empty, per-folder failure/retry and refresh retain usable keyboard navigation. Refresh rereads the already loaded prefix while preserving expanded folders and available entries. Clicking a file opens Focus; Back restores the tree's expansion, selection, scroll and file focus, including after the mobile sheet unmounts. Tree state is session-only and scoped to the active conversation controller; changing conversation clears its viewer/context and retires pending directory reads.

Local Material Icon Theme assets identify exact filenames, compound extensions, supported language IDs and expanded/collapsed folders, with light-theme overrides and generic fallbacks. Tree, Library, attachment and viewer-context file icons share the same resolver. Navigation controls keep Hugeicons and Ngertiin's existing theme tokens. The manifest is generated during development/build; no icon generator or external icon CDN runs in the browser.

## Create agent

+ → Create agent → create an owner-unique library-generated name and DM → open that conversation → publish one automatic human-owner opener → the agent helps and updates its profile through scoped tools when useful.

Use the chosen connection/model/billing defaults and default avatar. No mandatory technical form, Tobi intermediary or onboarding checklist. Creation can succeed while connection/initial response fails: preserve the entity, explain the actionable state and continue in the same conversation. Retry/reconnect/restart preserves the same operation identity. Reopening a chat does not infer or resend an opener. Tobi's bootstrap welcome remains separate.

## Create group

+ → Create group → simple name/member dialog → validate owned agents → create and open group chat → one automatic user opener → route one valid member to help.

Other members stay silent. Personalization updates shared purpose/directions through scoped tools, not all private member profiles. Invalid membership and creation failures retain useful input; repeated operations do not duplicate entities/openers/admission.

## Personalization and work

Ask one necessary question, work immediately on a clear request, and offer brief optional choices when helpful. Name, persona, role, Goals and working style are possibilities, not a checklist. Request an app connection, folder or schedule when relevant and explain its purpose. Only successful backend receipts/revisions update profile/sidebar state.

Ordinary busy-conversation input is queued; edit/delete applies before processing. Contextual steer/stop follow native capabilities and receipts. Stop requested differs from native stopped; edit/delete is not undo. Stop run differs from stopping durable responsibility.

Handoff/review activity is concise and agent-attributed. Keep internal instructions, prompts, commands and raw observations private. Preserve useful results, review findings and input/failure states. Sources and neutral file actions open correct references. Long answers and streamed text keep stable scroll/composer behavior; reduced-motion and final/history flushes remain immediate.

Questions and approvals follow the shared conversation interaction model. Natural text uses the ordinary composer. Explicit option/approval cards bind to a current request/revision; confirmed cards retain the question according to the later refinement. Failed-response Retry follows durable backend eligibility, preserving the intended message/conversation and reconciling unknown effects.

Computer progresses from preparation to an active preview and a compact finished state; the preview follows authoritative machine/run activity. Viewing is separate from acquiring control. Transient viewer loss can reattach without silently obtaining a new input lease. Human handback revokes interactive access and reconciles in-flight state.

## Web and Tauri Settings — 2026-11-11

The owner requested a full Settings screen and then expanded its scope using familiar ChatGPT/Claude and Cursor/Codex categories. The web client and `apps/desktop` share this React implementation; this amendment does not change `apps/desktop-rs`.

| Menu | Working controls |
| --- | --- |
| General | Open the last conversation or Tobi on the next launch; configure Tobi/new-agent defaults through the existing model picker and explicit account/billing disclosure. |
| Appearance | System/light/dark theme, conversation text size and reading width, with a text preview. |
| Conversation | Enter or Command/Control+Enter to send, bounded streaming interpolation, and message clocks. Shift+Enter keeps its newline behavior. |
| Accessibility | Avatar animation, pointer-following gaze, and always-visible message actions. System reduced-motion preferences remain effective. |
| Providers | The two required providers, inline account/API-key setup, and progressively disclosed runtime details. Missing/outdated-runtime repair stays visible. |
| Apps | Reuse the existing Composio connection/access flow and identify the current conversation explicitly. Grants remain scoped to the selected agent/thread. |
| Data and privacy | Device-local persistent-text-draft preference, public-conversation JSON export through all timeline pages, and confirmed reset of interface preferences. Export omits private runtime/credential fields and attachment bytes. |
| Keyboard shortcuts | Document the implemented composer/editor shortcuts and reflect the selected send key. |
| About | A compact application description. |

`?settings=<section>` and optional `provider=codex|muse` retain reload/history support. Legacy `/settings?section=...` links resolve all supported sections. Settings is ordinary document content without a scrim, modal semantics, focus trap or page-level Escape dismissal. Desktop navigation uses a sidebar; narrow Settings screens use a labelled section selector. The Conversation rail action restores keyboard focus and preserves unrelated URL parameters and composer identity. The Settings rail action reopens the last visited section/provider within the current workspace session.

The same owner subsequently selected a permanent icon rail and a dynamic inner sidebar. The rail is 56px on desktop and 48px below 768px, with 20px Hugeicons and 40px controls. Conversation is at the top and Settings is anchored at the bottom. Active destinations use `aria-current`, visible selected styling, labelled controls and tooltips. Repeated clicks on the active destination do not collapse the sidebar. The conversation sidebar has no redundant title, collapse button or duplicated Settings entry. The Settings sidebar title uses the same 18px/500/28px typography as the section heading.

The rail, sidebar and main content have no layout borders; the outer frame and content surface provide separation. On narrow screens, opening Conversation shows the agent list next to the retained rail; selecting an agent shows its chat in the same area. It is an inline screen transition rather than a drawer covering the rail. Contextual Detail/Library/Computer interactions retain their existing scope. At intermediate widths, opening right-side details can still replace the agent sidebar automatically to fit the available space.

Interface preferences are versioned in the current origin's local storage; they are independent for a browser and each Tauri profile, and synchronize across same-origin tabs. Account/model choices remain authoritative backend configuration. Disabling persistent drafts removes only the device's stored plain-text drafts while retaining the current session; pending operation receipts, uploaded files, credentials and backend history keep their existing lifecycle. Reset preserves the theme and all provider/model/backend records.

Focused evidence: [Settings screen and preferences verification](../verification/settings-screen-2026-11-11/README.md). This amendment does not close NMA-063 or NMA-064.

## Native per-thread presentation state

The November 9 owner request adopts Zed's retained conversation-state pattern for `desktop-rs`. Switching between DMs/groups retains each thread's composer entity (including reference metadata, selection and undo), transcript entities, reading position, table state and question progress. A cached conversation remains readable during activation reconciliation; commands and answers wait for the current backend scope to be checked. Backend admission, FIFO queue, receipts and recovery remain authoritative.

Retain at most eight inactive, reloadable idle conversations in addition to the active conversation and protected conversations. Running/queued/unknown work, pending human/native input, queued-message editing, in-flight staging and unresolved native operations protect their state. Ordered, bounded event pages update inactive read projections too, so completed work can become eligible for eviction. Eviction releases presentation resources, never backend work. Context panels, static-document surfaces and Computer viewing still retire when the conversation changes.

Rich drafts and a stable transcript-row/sequence anchor with a relative offset survive native profile restart. Older reading anchors and disjoint retained/latest history blocks backfill contiguous history in bounded backend pages; user scrolling cancels a pending restore, and a missing/deleted anchor falls back to a nearby retained message. Per-entry expansion, text/table selection and undo remain in-memory presentation state. Streaming reuses unchanged message entities and remeasures changed rows; incomplete Markdown measurements remain provisional so restoring history does not jump to the live edge. See [implementation and bounded verification](../verification/nma-068/retained-threads-2026-11-09.md).

The owner's subsequent transition refinement retains conversation avatar instances under the same thread-cache lifetime, pauses hidden animation while preserving the last image, and reserves a fixed avatar gutter before preparation completes. A fresh composer receives its neutral embedded presentation before autofocus or backend reconciliation. Uncached conversations show alternating conversation-shaped skeleton bubbles within the transcript's header/composer clearances; cached content remains visible during refresh. Placeholders expose one loading status, respect reduced motion and yield to actionable connection errors. See [transition verification](../verification/nma-068/conversation-transitions-2026-11-09.md).

## Conversation dates and clocks

The November 7 refinement groups visible conversation items by calendar day, with an absolute date centered between subtle rules before each day's first item. The date label and all clocks use the viewing device's same time zone. Loading earlier pages merges adjacent days without duplicate separators; sender joins and milestone batches stop at day boundaries. Hidden administrative handoffs and replaced retry attempts do not produce empty date groups.

User and assistant bubbles, structured questions, approvals, retained interaction states, Computer cards and agent activity show a compact clock using the shared message-time presenter. Goal and Routine event bars remain without a clock, while belonging to their date group. Group cards retain the adjacent agent avatar; the November 8 refinement removes repeated visual assistant names while preserving accessible attribution. DM rows omit the avatar.

Publication sequence remains authoritative. Message clocks use their retained timeline publication time, so a queued input appears on the day it actually enters the conversation. Product cards retain the request's creation time; native cards retain first-observed time; Computer retains its activity start time through completion. State updates, repeat observations and reload do not replace these clocks with the current time. A continued text fragment uses the preceding retained interaction boundary when the API retains a single answer across that boundary; this is not a per-token native delivery timestamp. No backend contract or timestamp migration is introduced. See [focused verification and boundaries](../verification/conversation-chronology-2026-11-07/README.md).

## Message bubbles and Markdown

The November 8–9 refinements keep all heading levels inside a chat bubble at the paragraph's 15px size and 22px line height, with semibold weight. Prose, Markdown tables and code from one reply remain inside that reply's bubble, with one retained publication clock. A table must not cause an automatic bubble split. Authored question/approval boundaries still follow the timeline.

Native table rendering follows Zed's GPUI grid pattern: content-sized shared columns, semibold headers, Markdown body alignment, cell rules and inline Markdown content. Short tables use a 384px minimum at the default text scale, bounded by the bubble's available width. Sorting, filtering, selection, copy, download and Focus remain available. Table actions must not obscure the header. This bubble-specific typography policy does not replace document preview typography. See the [reviewed NMA-071 delta](../development/nma-071-scope-2026-11-08.md).

The conversation and composer use the header's available width and horizontal inset, without an additional fixed maximum-width column. Individual bubbles retain their alignment and relative width; short tables must not collapse into a narrow column solely because their content is brief.

## Conversation content viewer

The user selected the Focus variant on 2026-11-07 after the [viewer exploration](conversation-viewer-prototype-2026-11-07.md). Clicking a conversation file, a Library result, a working file or a table's maximize action opens content within the conversation area on desktop and mobile. The borderless header is a transparent overlay above the full content viewport, with pointer passthrough between its controls. Document clearance scrolls away with the content; HTML retains that clearance within its iframe and PDF controls remain below the overlay. See [floating-header verification](../verification/conversation-content-viewer-2026-11-07/header-overlay/README.md). Its surfaces follow the conversation header: circular Back/action controls and a geometrically centered filename pill, with themed background surfaces, subtle shadow, and hover/pressed/focus states. See [header refinement checks](../verification/conversation-content-viewer-2026-11-07/header-style/README.md). Download provides the original file; saved-file information and sharing remain in Library via **Info file**. Back restores the originating conversation or Library; nested table viewing returns to its document first. The mounted conversation and composer retain their draft and reading state.

The same composer floats below the viewer with a removable file/table context chip. Sending ordinary feedback includes an explicit file reference and authoritative `artifact_ids` in the existing message admission flow, then returns to the same conversation after acceptance. Working files and table CSV snapshots enter the existing staged attachment flow only on Send. Removing the chip sends ordinary feedback without that context. Failed admissions retain editable input or the original durable pending operation. Questions/approvals and queued-message edits retain their existing submission contracts.

HTML renders directly without Preview/Source tabs or an HTML Document label. It uses an empty iframe sandbox and a restrictive document CSP for static content; scripts, external resources, forms and external navigation are disabled. The original HTML source is downloaded from the header menu. Text previews remain bounded to 128 KB; truncated tables/HTML offer download rather than partial rendering. Image previews and outgoing context copies are bounded to 16 MB.

PDF files render directly in the same viewer using a lazy loaded PDF.js renderer rather than a browser PDF plugin. Page navigation, selectable text, 50–200% zoom and fit-to-width remain available above the document; zoom preserves the reading position. The existing composer and original-file download remain available. PDF previews are limited to 16 MiB and 500 pages, with clear retry/download states for unreadable, protected or oversized files. Only nearby pages keep canvas/text layers mounted, with a four-million-pixel canvas budget per page. This display support is separate from the existing backend's PDF text extraction and does not add OCR or an editor. See [PDF verification](../verification/conversation-content-viewer-2026-11-07/pdf-support/README.md).

Source files use a dedicated full-area read-only view with Shiki syntax colors, original indentation, line numbers, literal case-insensitive find/next/previous, copy of the original preview text and optional wrapping. Filename detection includes JavaScript/TypeScript variants, Go, Dockerfile/Containerfile, Makefile and the already bundled source/config grammars. Valid UTF-8 content in unknown formats falls back to plain text; binary formats retain the download fallback. Original-file downloads preserve unchanged bytes. This provides syntax highlighting and reading tools, not language-server diagnostics, completion or an editor.

Source viewing is lazy loaded. The shared JavaScript-engine highlighter loads grammars on demand and keeps a bounded cache. Text reads retain the existing 128,000-byte preview limit; highlighting stops above 100,000 characters and preserves readable plain source. More than 500 source lines use the existing TanStack virtualizer, including find navigation and wrapping. The header overlay and contextual composer remain available. Implementation and verification are recorded with the [Working files/source viewer amendment](../verification/working-files-tree-2026-11-07/README.md).

File editing remains a conversational request using the agent's existing working-file/terminal capabilities and publication of a new immutable artifact. Interactive app previews, browser-history restoration of an open viewer and native installation acceptance remain separate scope. See [focused implementation evidence](../verification/conversation-content-viewer-2026-11-07/README.md).

## State and acceptance

| Condition | Required outcome |
| --- | --- |
| Loading/empty/failure | Clear state and actionable repair; preserve authored input and local attachments. |
| Queued work | Correct ordering, author and editable pending state; no lost or duplicated message on reload. |
| Waiting for input | Current question/work relationship is clear and resumes from the correct response. |
| Creation retry/restart | One entity, conversation, opener and admission per intentional operation. |
| Opening failure | Keep the entity and recover in the same chat; reconcile unknown native work. |
| Tool/configuration update | Show changes only from a successful authoritative revision/receipt. |
| Scope/membership change | Refresh authorization and avoid leaking private DM data. Shared working-file visibility remains explicit. |
| Desktop/mobile | Same information architecture, usable controls/viewers and a clear path back to conversation. |

Composio and visual inputs expose only supported capabilities. Harness vs app skill source stays visible; app workflows do not overwrite native packages. Subscription does not silently switch to key billing. Optional search/fork/meter/dashboards do not become mandatory screens.

## Verification and remaining gates

[Creation](../backlog/NMA-065.md), [conversation UI](../backlog/NMA-061.md), and [contextual work UI](../backlog/NMA-062.md) are completed for their recorded scope. [NMA-063](../backlog/NMA-063.md) remains Backlog for product-wide real-API desktop/mobile acceptance with both required harnesses. [NMA-064](../backlog/NMA-064.md) remains Backlog for installation after that gate.

Use the [interaction/Computer implementation evidence](../verification/conversation-implementation-2026-11-06/README.md), [later refinements](../verification/conversation-followup-2026-11-06/report.html), [shared-machine verification](../verification/shared-machine/README.md) and [Tauri guide](../architecture/tauri-development.md). Screenshots/build/typecheck or a development bundle do not complete the open product/distribution gates.
