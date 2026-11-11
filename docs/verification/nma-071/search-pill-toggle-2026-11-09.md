# Conversation search pill, toggle and pointer isolation — 2026-11-09

The owner requested a search field matching the supplied pill reference, with a distinct border/background, a separate Close button, and a header button that toggles search. The subsequent correction makes search fill the conversation width and prevents clicks from activating actions beneath the field. This supersedes the earlier bounded-width direction in [compact conversation tools](compact-conversation-tools-2026-11-09.md); that evidence remains unchanged. The adjacent [manifest](search-pill-toggle-2026-11-09.json) records before/after source hashes.

## Implementation

- One 56px row at the default text scale, containing a pill field and separate circular Close control. The field fills the space beside Close across the conversation pane. Native search/close/arrow assets remain in use.
- Product search-surface/search-border tokens distinguish the field from content in both themes. Neutral focus styling and inline invalid-expression feedback remain visible. The empty field shows only its search icon and placeholder. Count and navigation appear inside the field after a query is entered; case, whole-word, regex and loaded-message scope/limit move into the search icon's native menu.
- The header exposes a toggle/pressed state and opens or closes the current thread's search. Command-F opens/focuses it. Query and search options remain retained per thread; Close/Escape clears highlights and restores prior focus. Transcript clearance follows the shared search-row height.
- The search row uses GPUI's `block_mouse_except_scroll` hitbox behavior. This blocks pointer interactions with underlying controls while preserving ordinary wheel scrolling. Child input, options, result navigation and Close keep their normal interactions; no blanket mouse-event cancellation is added.

## Verification

Host: macOS, Apple Silicon; GPUI Kit 0.9.0 and API contract 1.31.0 remain unchanged.

- `CARGO_BUILD_JOBS=2 bun apps/desktop-rs/scripts/cargo.ts test --workspace conversation_tools_tests`: **12/12 passed**. The occlusion test embeds the production search view over an actionable button: query clicks, row padding, disabled navigation and Close do not activate that button; input accepts text, and the covered action becomes clickable again after search closes. Wide/narrow geometry, toggle/query/focus retention, regex-menu selection, public-text filtering, result navigation and the existing conversation-tool cohort pass. The test build preceded removal of an unused test import; final all-target Clippy covers that cleanup.
- Final strict workspace/all-target Clippy, formatting, rendering/dependency boundaries and `git diff --check`: **passed**.
- Resolved border/field contrast is **3.09:1 in light** and **4.15:1 in dark**. Field surface differs from conversation background in both palettes.
- Full documentation checks retain only the **eight existing broken links in imported GPUI skill guides**, with no changed-document link failure.

The [retained logs](search-pill-toggle-2026-11-09/) and source manifest preserve the final checks separately from earlier accepted evidence.

Native accessibility and screenshot observations covered the distinct pill/Close geometry in light and dark themes, header open/close state, options menu dismissal and conditional match navigation. After the width correction, the full-width field was observed in the real dark-theme development app and accepted query text, producing 16 loaded-message matches. The query was cleared after inspection. No message, model, billing or provider action was submitted.

The development app was rebuilt for the pill/toggle change and received the final width/pointer refinement through the native development runner's hot patch. These are development-runtime observations, separate from a distribution bundle or installation gate.

## Boundaries

The regression windows use disposable fixtures and do not execute providers. Final source and native development behavior do not recertify the previously accepted NMA-071 development bundle, establish literal pixel parity, or expand search beyond loaded public messages. Existing unrelated working-tree changes, imported-guide link failures and retained evidence remain separate.
