# Compact conversation tools — 2026-11-09

Scope: the owner's follow-up request to narrow conversation search and restore the model selector's compact presentation. This refines the [conversation-tools implementation](conversation-tools-2026-11-09.md); its original evidence and manifest remain unchanged. The adjacent [source manifest](compact-conversation-tools-2026-11-09.json) identifies this refinement separately.

## Presentation

- Conversation find aligns to the right below the header, with a 560px maximum at the default text scale. It shrinks with the pane; its query field and secondary help can shrink without moving the navigation controls outside the pane.
- Model rows use the native Command item's single-line presentation, provider icon slot and current-choice checkmark. Removing custom two-line children also restores the framework's checkmark rendering. The inner frame is removed, the content width is 280px at the default scale, and reasoning effort opens a compact native menu. Provider/authentication billing stays in group headings; differing effective billing is stated there without repeating metadata on every model row.
- Search, local favorites, supported efforts, unavailable state, live-catalog validation, originating-thread checks and revision-bound configuration commands remain. This does not change a model optimistically, invoke a provider, or alter backend queue/admission behavior.

## Verification

Host: macOS, Apple Silicon, using GPUI Kit 0.9.0 and the unchanged API contract 1.31.0. Headless native tests use disposable fixture profiles and do not execute providers.

- `CARGO_BUILD_JOBS=2 bun run check:desktop-rs`: **112/112 tests passed** (8 avatar, 17 client, 87 desktop), with formatting, rendering/dependency boundaries and strict workspace/all-target Clippy passing. This run preceded the final connection-heading/footer wording and two additional regression cases.
- Final affected cohort, `CARGO_BUILD_JOBS=2 bun apps/desktop-rs/scripts/cargo.ts test --workspace conversation_tools_tests`: **10/10 passed**. This includes right-aligned bounded search in a wide pane, a usable query and contained controls at a 520px test viewport, and keyboard effort selection that submits only a revision-bound reasoning change without optimistic agent mutation. Existing search, public-text isolation, reference completion, favorites, anchor, queue and stale-revision checks remain covered. These cohorts overlap and are not added together.
- Final formatting, strict workspace/all-target Clippy and `git diff --check`: **passed**.
- Full `bun run docs:check`: **the same eight pre-existing broken links in imported GPUI skill guides**; no changed-document link failure. The tracked checker and imported guides were not modified.

The [retained check logs](compact-conversation-tools-2026-11-09/) and adjacent source manifest preserve the source/check boundaries.

The real development application was also inspected through native accessibility and screenshots on macOS. The narrowed find bar, single-line model rows, provider icons, active-model checkmark and effort menu were visible. Searching existing loaded messages produced 16 results and Enter advanced from the first to the second result. Model search ranked the matching Terra models first. Escape dismissed the effort menu and model selector. These observations did not select a model or effort, change billing, send a message, or execute a provider.

Native visual inspection preceded the final connection-heading/footer wording; the final source is covered by the affected headless cohort and Clippy. No development distribution bundle was produced.

## Boundaries

This is a focused source and native development-UI correction. It does not establish literal Zed pixel parity, a rebuilt distribution bundle, provider acceptance, production readiness or a change to NMA-071's previously accepted scope. Original evidence and unrelated working-tree changes remain separate.
