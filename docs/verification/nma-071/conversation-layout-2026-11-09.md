# Native conversation presentation — 2026-11-09

This owner-requested follow-up starts at `b768ced` and changes the active native workspace renderer in `apps/desktop-rs`, committed as `c0f198d`. [Source hashes](conversation-layout-sources-2026-11-09.json) identify the exact source and lockfile. GPUI Kit remains pinned to 0.9.0; checks use Rust 1.99.1 and Bun 1.3.10 on macOS ARM64. The [presentation amendment](../../architecture/desktop-rs-plan-2026-11-07.md) records the final owner instruction.

## Implemented behavior

- [x] Header background interpolates continuously from 2% opacity at the bottom to 94% at the top. The final owner correction supersedes the intermediate shadow-only treatment; there is no solid upper plateau.
- [x] DM/group message content and its actions share an 80% lane-width bound. The bubble and Markdown release their intrinsic minimum width, prose wraps, and long code retains its own horizontal scroll region.
- [x] Tables fill the bubble's content width by default. Surplus width is distributed across columns; minimum column widths still permit horizontal scrolling for wide tables. This supersedes the earlier 384-point minimum/content-sized table policy.
- [x] File chips fit their content and use 24-point height, 12-point labels and 14-point file icons at default zoom. Inline chips retain a 240-point maximum; appended file labels truncate at 192 points. Existing file-opening callbacks remain bound to the artifact identity.
- [x] A native Markdown code wrapper scopes hover and wrap state to the exact message/block offset. Copy reads that block's code. Code action glyphs are 13 points inside 24-point controls; message Copy uses a 14-point glyph.
- [x] Message Copy appears on the assistant's right and the user's left. Hover is scoped to the content/action region, with focus-visible support retained.

## Verification

The real production workspace renders in headless GPUI windows. Three added UI integration cases cover long prose/list/code at 720/1280 widths in DM/group, negative prose-hover versus two independent code blocks, exact code copy, one-block wrap geometry, compact filename-chip geometry and author-dependent message-action placement. Updated table cases check that the table and its columns fill the bubble, including one/two-column tables at 480/720/1280 widths. The existing streaming/final-code, sorting/filtering/state, wide-window, question, navigation and composer cases remain in the same cohort.

- Workspace UI: **20/20 passed**, including the three new cases. The four DM/group width configurations are assertions within one case, not four additional tests.
- Before the final table-width amendment, `bun apps/desktop-rs/scripts/cargo.ts test --workspace` passed **88/88 executable tests** and all three empty doctest phases. The final table amendment is covered by the repeated 20-case workspace UI cohort above; the cohorts are not added together.
- Formatting, dependency/rendering ownership and strict workspace/all-target Clippy: **passed**.
- The complete documentation check reports only the eight pre-existing imported GPUI guide link errors; no changed-document link error is reported.
- Cleanup clarifies code-action block identity and removes the redundant column-width binding. The source manifest is refreshed after those equivalent changes. A scoped copy of the existing documentation checker passes: 258 Markdown files, 2,265 local links, 25 milestones, 83 decisions and contract 1.31.0. It excludes only the three unchanged imported GPUI guide files responsible for the eight full-check failures; the tracked checker is unchanged and the temporary copy is removed.

Final affected checks use `bun apps/desktop-rs/scripts/cargo.ts test -p ngertiin-desktop --lib workspace::tests -- --nocapture`, `bun apps/desktop-rs/scripts/cargo.ts clippy --workspace --all-targets -- -D warnings`, `bun apps/desktop-rs/scripts/cargo.ts fmt -- --check`, `bun apps/desktop-rs/scripts/check-boundaries.ts` and `git diff --check`.

This is source and headless native interaction evidence. A read-only view of the running hot-reload application showed wrapping prose and compact references, but no exact patch revision was established for that observation. It is not counted as final-gradient visual acceptance. No new provider inference, backend mutation, shared-machine action, bundle rebuild, installation or active-host replacement was performed. Earlier captures, bundle hashes and acceptance reports retain their original scope.
