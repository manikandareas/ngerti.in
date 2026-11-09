# Cleanup and local commit verification — 2026-11-09

This pass reviews and commits the uncommitted native development delivery from `cdec232`. The source commits are `385e317` (deferred API validators), `327f326` (bundled backend and window restoration), `f2daae0` (web conversation presentation) and `f6e387c` (native conversation and app workflows).

Cleanup removes the no-op assistant-author component, its obsolete props and activity-name styles, and the unused reply-splitting module. Browser geometry tests now check required elements explicitly instead of using non-null assertions. Native Computer rendering reuses its existing open handler, visibility scanning reads the scroll position once, and model/reasoning commands use readable blocks. Existing interaction, billing, operation identity and rendering ownership remain unchanged.

The native README, feature decisions and source-adoption summary are synchronized with the already recorded focused NMA-071 completion. The original [103-file evidence manifest](integrity.json), report, captures and logs remain byte-identical. Exact whitespace exceptions preserve verified raw logs without normalizing their contents.

## Current checks

| Check | Result | Evidence and boundary |
| --- | --- | --- |
| Web lint and production build | Passed, no lint warnings | `bun run lint:web-client` and `bun run build:web-client`; the build retains its existing large-chunk advisory. |
| Conversation/browser regressions | 54/54 passed | [Raw log](cleanup-2026-11-09/web-conversation.log); activity, avatars, chronology and rich answers in desktop/mobile projects. |
| Group interaction history | 2/2 passed | [Raw log](cleanup-2026-11-09/web-work.log); desktop/mobile, selected from `work.spec.ts`. |
| Native formatting, boundaries and strict Clippy | Passed | `bun scripts/cargo.ts fmt -- --check`, `bun scripts/check-boundaries.ts` and [all-target Clippy](cleanup-2026-11-09/native-clippy.log), from `apps/desktop-rs`. |
| Native workspace regressions after cleanup | 24/24 passed | [Raw log](cleanup-2026-11-09/native-workspace.log); `bun scripts/cargo.ts test -p ngertiin-desktop workspace::`. |
| Workspace doctest phase | Passed | [Raw log](cleanup-2026-11-09/native-doctest.log); `bun scripts/cargo.ts test --workspace --doc`, with no doctest examples collected. |
| Existing development bundle | 11,661 resource hashes and isolated backend boot/shutdown passed | [Probe](cleanup-2026-11-09/bundle-check.json); binary `e4f5b944`, matching the retained delivery, not a rebuilt cleanup binary or a new native GUI/provider journey. |
| Repository documentation | Scoped links/status checks passed; full check retains 8 baseline errors | [Scoped log](cleanup-2026-11-09/docs-scoped.log), [full log](cleanup-2026-11-09/docs-full.log). The scoped copy omits only the three unchanged imported GPUI guide files responsible for those errors. |

The first `bun run check:desktop-rs` run passed all 85 executable workspace tests. Its later rustdoc phase overlapped source formatting and reported a closing-delimiter parse error. After source edits stopped, formatting, all-target Clippy, the affected 24-test cohort and all workspace doctest phases passed. These are separate cohorts; they are not added together as unique tests.

The eight documentation errors are relative links in `.agents/skills/gpui-kit-design-guides/references/design-guides.md`, `.agents/skills/gpui-kit/references/coding-guides.md` and `.agents/skills/gpui-kit/references/usage.md`. The scoped check uses a temporary copy of the existing checker with only these exact file exclusions; the tracked checker is unchanged. [Cleanup log hashes](cleanup-2026-11-09/integrity.json) identify this pass's retained outputs.

No live provider inference, external app authorization, shared-machine input, installation or active-host replacement was repeated. User profiles, credentials and existing desktop/backend processes were preserved. A Zed disk image appeared outside the initial change snapshot and is intentionally excluded from these commits. No push was performed.
