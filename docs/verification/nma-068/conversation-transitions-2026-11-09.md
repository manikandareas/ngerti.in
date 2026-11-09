# Native conversation transitions — 2026-11-09

Scope: the owner's request to fix avatars appearing after group bubbles, a primary-colored composer focus flash, and centered loading text in the native desktop. This supplements the [retained-thread amendment](retained-threads-2026-11-09.md); earlier acceptance and source manifests retain their original scope.

## Diagnosis and implementation

Conversation avatar entities previously lived in the workspace's current-target map. Preparing another conversation removed their entries even when that conversation's transcript remained cached. Message rows conditionally added the entire avatar column when an entity became available. The native UI reproduced this on a cached group return. The [pre-fix regression output](conversation-transitions-2026-11-09/avatar-gutter-before.txt) measures the existing message copy-control anchor moving from x=566 to x=606: **40 logical pixels** from the 32-pixel avatar plus its gap. The already-built pre-fix test binary is identified by SHA-256 in that output; a temporary `group.json` alias pointed to the retained `07-quiet-group.json` fixture and was removed after the run. The final test names that fixture directly.

Conversation portraits and their activity state now belong to `ThreadState`. Header, hero, route and message portraits follow the same bounded cache lifetime as their transcript. Sidebar portraits and their readiness observers remain workspace-owned. Switching pauses hidden portraits without discarding their last image; late renderer delivery checks visibility before replacing an image. Eviction releases the retained entities. Group message and interaction rows always reserve the avatar slot, including while a native placeholder is needed.

A fresh `Composer` originally used its standalone textarea appearance until snapshot installation called `embedded`. Activation could focus it before that installation. The old running development binary reproduced the blue ring and taller input during an uncached conversation load. `new_thread_state` now applies the embedded presentation before draft restoration or focus. The existing neutral outer border, caret, selection, keyboard behavior and mutation gates are retained; no global theme/focus setting is changed.

`workspace/loading.rs` replaces the centered connection text with four alternating agent/user bubble placeholders. Their widths, text-line counts and group avatar slots vary within the transcript's normal header/composer clearances. Pinned Kit `Skeleton` supplies opacity animation; reduced motion uses static semantic-color shapes. Only a single `Loading conversation` status enters accessibility. Cached content remains visible during reconciliation; errors keep their existing recovery action instead of a loading skeleton.

## Verification

`CARGO_BUILD_JOBS=2 bun run check:desktop-rs` exited 0 on the frozen sources. Dependency/rendering ownership, formatting and strict workspace/all-target Clippy passed. The complete cohort passed **102/102**, with 0 failures and 0 ignored: avatar 8, client unit 4, client read-only 12, worker 1 and desktop 77. [Raw automated checks](conversation-transitions-2026-11-09/check.txt) and the [source manifest](conversation-transitions-2026-11-09/source-manifest.json) retain exact output and identities.

`git diff --check` passed. The full documentation checker retains exactly eight existing broken links in the imported GPUI skill references. A temporary copy excludes only `.agents/skills/gpui-kit*` Markdown discovery; its milestone, decision-coverage and API checks are unchanged. It passes 231 Markdown files, 2,250 local links (101 verified in pinned historical trees), 25 milestones, 83 decisions and contract 1.31.0. Raw outputs are `docs-check.txt` and `docs-scoped-check.txt` beside the source manifest.

The initial focused cohort passed all three added tests. Its older navigation fixture was adjusted to create its sidebar portrait entities before marking their readiness; activation now prepares portraits immediately. The final complete cohort uses that corrected fixture.

The three added native UI integration tests cover:

- The same message anchor and control bounds before and after portrait preparation.
- A group portrait's entity identity across A–B–A, availability before backend reconciliation, and release after idle eviction.
- Cold conversation skeleton ordering and variable bubble geometry, focused composer bounds before/after snapshot installation, cached refresh without skeleton replacement, and actionable errors without a loading mask.

The old development app was explicitly quit before launching the current source with `CARGO_BUILD_JOBS=2 bun run dev:desktop-rs`. [Build output](conversation-transitions-2026-11-09/native-build.txt) records successful native launch. Live Cua observations on that build showed a cold DM and a cold group using alternating skeleton bubbles, a neutral composer in the loading frame, and immediate rendered avatars when returning to the cached Marketing group. The selected conversation was returned to the original Machine group. No message was typed or sent, no provider inference was requested, and the application remains open for the owner.

Limits: live observations cover the current macOS ARM64 dark wide-window development app. They are qualitative UI observations, not a frame-time or total-memory benchmark. Reduced-motion layout is covered by native fixtures; fresh provider, production, installer and other-platform acceptance are separate. No backend contract, dependency pin or authentication/billing behavior changes.
