# Native conversation tools — 2026-11-09

Scope: the owner's requested Zed-style find within a conversation, composer/queue refinements and model selection. This is a later native refinement, separate from the accepted NMA-071 bundle and provider evidence. Source baseline: `9ca7c38f4feb6e351357e6150e9bf1866414302c`, with the changes identified by the adjacent [source manifest](conversation-tools-2026-11-09.json).

## Source and adaptation

Upstream reference is Zed `b5cd310b3b54dfc659fcc06453e6358843dfe216`, specifically `agent_ui`'s `ThreadSearchBar`, `MessageEditor`, `MessageQueue`, `ModelPickerDelegate` and `ModelSelectorPopover`. [Source adoption](../../development/source-adoption.md#native-conversation-tools--zed-reference-2026-11-09) records exact paths and immutable links. Local code uses GPUI Kit 0.9.0, GPUI Fast 0.1.13 and contract 1.31.0; no dependency pin or backend route changes.

- Find uses native rendered-text snapshots, highlights and range reveal. It searches only loaded public message text, retains an active result across appended streaming content, handles Unicode/case/whole-word/regex, reports invalid expressions and bounds results to 2,000. Command-F opens it; Enter/Shift-Enter navigate; Escape/Close restores the previous focus. Delayed reveal checks current thread scope and active match before updating a view. Private tool observations and internal reference URLs are outside this search surface.
- Composer completion ranks the existing scoped catalog, distinguishes @ agent/file/user references from / skill references, and accepts with Tab or Enter. Native input Actions handle arrows, Tab and Escape ahead of the input's normal bindings while respecting marked text. Existing rich-draft, clipboard, IME and admission behavior remains.
- Queue presentation keeps server order and state. It marks Next, supports collapse and readable text, and exposes keyboard editing of the next queued message from an empty composer. Edit/cancel preserves the ordinary draft; delete/steer use existing revision-bound commands. Steering additionally checks the selected connection capability. Zed's client-local auto-dispatch, cancellation absorption and Send Now policies are not imported.
- Model selection uses native Command/Popover behavior with fuzzy search, provider/connection billing groups, separate effective billing, unavailable explanations, supported reasoning efforts and persisted local favorites. The active anchor is distinct for header/context triggers. Selection rechecks catalog, authentication, agent revision and originating thread before submitting the existing configuration command; no optimistic model mutation or implicit billing fallback.

## Verification

Host: macOS 26.3, Apple Silicon; `rustc 1.99.1 (58cf8f9c3 2026-10-13)`. The production workspace and components run in headless native GPUI windows using disposable fixture profiles. Tests do not execute a provider or mutate the owner's backend.

- `bun apps/desktop-rs/scripts/cargo.ts test --workspace`: **111/111 passed** (8 avatar reference, 17 client, 86 desktop), plus empty executable/doctest phases. This run preceded the final delayed-reveal scope guard and the additional long-message reveal case.
- Final affected native UI cohort: **8/8 passed**, using `bun apps/desktop-rs/scripts/cargo.ts test -p ngertiin-desktop --lib conversation_tools_tests -- --nocapture`, after that guard and the added case. The cohorts overlap and are not added together.
- Final formatting, dependency/rendering ownership, strict workspace/all-target Clippy and `git diff --check`: **passed**.
- Full `bun run docs:check`: **fails only on eight pre-existing relative links in the imported GPUI skill guides**. No changed-document link failure remains. The unchanged checker was also executed through a temporary copy excluding only those three imported guide files: **259 Markdown files, 2,304 local links, 25 milestones, 83 decisions and contract 1.31.0 passed**. The temporary copy was removed; the tracked checker was not changed.

The UI cohort covers rendered-text result navigation and streaming updates, header/search geometry, public-reference filtering, invalid regex, keyboard dismissal, within-message reveal, fuzzy file completion, queued keyboard edit/cancel/delete, explicit model billing, stale agent revision rejection, favorite persistence and competing anchors. Existing cohorts cover retained-thread drafts/scroll, IME, questions, Markdown tables, source/PDF and host/client recovery.

## Boundaries

This is source, pure-test and headless native interaction evidence. It does not establish pixel parity with Zed, OS IME candidate-window behavior, real provider outcomes, a new backend acceptance gate, installation, or a rebuilt application bundle. Already packaged binaries retain their previous revision. Cross-thread and unloaded-history search remain optional; private transcript data is not made public. The unrelated untracked PDF in the viewer-prototype evidence directory is preserved.
