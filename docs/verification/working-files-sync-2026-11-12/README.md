# Automatic Working files synchronization — November 12, 2026

The owner requested removal of manual Reload/Refresh and smoother folder expansion. This follow-up also records cleanup of the session's group dialog and contextual-panel work. It changes the shared web/Tauri React presentation; backend contract 1.32.0 and native Rust behavior remain unchanged. [Interface behavior](../../product/interface.md#working-files) records the accepted behavior.

## Implementation

The conversation-scoped [browser cache](../../../apps/web-client/src/features/conversation/lib/working-files-browser.ts) warms the root while Agent info is open and prepares one visible level ahead. It limits speculative work to two concurrent reads, 24 queued folders and a 128-folder background-cache budget. Hover and keyboard focus prioritize a folder. Explicitly opened folders can exceed this background budget; this is not a total session-memory bound. Only the first page is prepared, without recursively crawling closed folders.

The [sync hook](../../../apps/web-client/src/features/conversation/lib/use-working-files-sync.ts) refreshes the root and expanded folders every five seconds while Working files is active, plus foreground, online and visibility return. Hidden/offline/unmounted panels pause reads. Single-flight reconciliation preserves cached rows during pending/failed reads and keeps unchanged snapshots stable. Removed directories prune descendant caches, selection and focus; aborted requests cannot publish late results. The [tree component](../../../apps/web-client/src/features/conversation/components/working-files.tsx) rebuilds only when visible folder data changes and has no manual refresh control.

Prepared folders open synchronously from cache. A genuinely uncached folder still needs its first network read and retains accessible loading, empty and retry states. Pagination and Focus restoration remain available. These changes do not promise zero latency for every folder or alter shared-machine authorization.

Cleanup gives Create/Edit one typed dialog and one creation draft, removes repeated selection checks and nested error/label expressions, and isolates cache reconciliation from request scheduling. The prior [group](../group-edit-dialog-2026-11-12/README.md), [header tabs](../context-panel-tabs-2026-11-12/README.md) and [rail](../compact-navigation-rail-2026-11-12/README.md) captures remain historical records of their respective slices.

## Setup and validation

Base revision: `8cf5c61e0f75dbd3322481bcde796a2e50eb3d1a` plus this session. Bun 1.3.10, Vite 8.3.5, Playwright 1.64.1 and Chromium at 1440×1000 desktop and touch-enabled 390×844 mobile. Disposable NMA-062 API/SQLite provide real application identity, scoped state and receipts. Harness execution, machine directory listings and file bytes use fixtures. No physical-machine performance, native-window, live-provider, installation or production acceptance is claimed.

| Check | Result |
| --- | --- |
| Initial regression probes against lazy fetching | 0/2 passed: opening had no prepared children and cached refresh exposed a loading row. |
| Final `bun test verification/working-files.test.ts` | 13/13 passed, 53 assertions. |
| Web typecheck, lint and production build | Passed; lint checked 377 files. Existing build chunk-size advisory remains. |
| Final viewer browser cohort | 12/12 passed, zero skipped/flaky. |
| Group browser regression | Initial cohort 9/10; isolated desktop creation recovery 1/1 passed. All 10 distinct cases pass across the two runs. |
| Impeccable detector on seven touched UI/CSS files | Zero findings. |
| Repository documentation check | Eight existing broken links in unchanged imported GPUI skill references; no new broken links. |

Commands run from `apps/web-client`:

```sh
bun test verification/working-files.test.ts
bun run typecheck
bun run lint
bun run build
bunx playwright test --config playwright.viewer.config.ts --grep 'Working files|Focus working files'
bunx playwright test --config playwright.work.config.ts --grep 'group editing|membership editing|group creation recovers'
```

The unit cohort covers bounded preparation, cached background refresh, snapshot stability/single-flight reads, cancellation, pagination, deleted descendants and filename edge cases. Browser checks cover both themes, header defaults/keyboard navigation, automatic recovery, paginated files, nested details and Focus restoration. An earlier automatic-sync browser attempt passed 10/12: the old retry test clicked a row already removed by automatic recovery. The final test waits for automatic recovery without clicking Reload; failed attempts remain distinct.

In the delayed-directory case the fixture waits 700ms per cold child read. After preparation, children are present after two animation frames: 15.9ms desktop and 16.3ms mobile, with zero loading rows during subsequent automatic add/remove reconciliation and an injected 503. Focus and expansion survive background changes. These are two local fixture observations, not a latency SLO. [Metrics](metrics.json), [viewer output](viewer.log), [build output](build.log), [desktop capture](screenshots/desktop.png) and [mobile capture](screenshots/mobile.png) retain the result. Both retained final renders were visually inspected. The [source/artifact manifest](manifest.json) identifies the final validated files; earlier manifests retain their captured historical source hashes.

The group regression initially passed 9/10. Desktop creation recovery timed out waiting five seconds for the initial Detail Tobi button immediately after reload; its failure snapshot showed the header while the conversation list was still warming. All eight Edit/conflict/recovery cases and mobile creation recovery passed. The exact staged intermediate group snapshot also passed typecheck after exporting its required build/test configuration. [Initial group output](group-initial.log) retains the startup failure.

The isolated desktop creation-recovery rerun passed 1/1 in 17.5 seconds, without changing source, fixture waits or timeouts. [Rerun output](group-recovery.log) retains that result; the initial 9/10 cohort is not relabeled as an all-green run.

Raw build and initial group logs retain tool-emitted trailing spaces. Only `build.log` and `group-initial.log` are excluded from ordinary whitespace validation after their immutable manifest hashes match; all other staged files use the normal check.
