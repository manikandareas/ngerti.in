# GPUI desktop retirement — 2026-11-15

The owner requested removal of GPUI and superseded versions while retaining the latest implementation with authentication and organizations. Active workspaces remain `apps/server`, `apps/web-client`, `apps/desktop` (Tauri) and `packages/avatar`; NMA-072–083 retain their accepted scope. NMA-063/NMA-064 status is unchanged.

## Removal and preservation

Removed `apps/desktop-rs`, `apps/gpui-experiment`, the repository-local `gpui-kit` and `gpui-kit-design-guides` packages, their skill-lock entries, root desktop-rs commands and lint/ignore/attribute entries. Dedicated `.dev/desktop-rs-target`, `.dev/gpui-experiment-target` and `.dev/desktop-rs-tools` generated caches are also removed. No dependencies or active application source were changed.

The pre-removal Git revision is `51dea542d545e6faf290b6d5e3771717d47b002e`. [Historical recovery](../../development/history.md#retired-gpui-clients--2026-11-15) records source access. Raw app verification files and license notices are preserved in [retired verification](../retired-desktop-rs/). Existing reports, contract exports, runtime data, PostgreSQL work in progress, `.env`, profiles and installed applications are retained. No process was stopped. The running executable named `ngertiin-desktop` was verified as the active Tauri binary under `apps/desktop/src-tauri/target/debug`.

The NMA-080–083 documentation wrappers now run the complete documentation checker. Original bounded-check logs and exclusions remain immutable historical evidence. New snapshot entries resolve only byte-identical historical GPUI reports against the pinned pre-removal Git tree. Current guides still require live local links.

## Verification

Verified locally with Bun 1.3.10. The [preservation manifest](preservation.json) records before/after SHA-256 summaries for 7,086 unchanged application, infrastructure and historical evidence files. All 36 relocated raw verification files match their original Git bytes. All four active workspaces remain, and the executable contract stays at 2.2.0. Existing PostgreSQL edits, including the local OrbStack amendment and foundation-test command, are preserved.

| Check | Result | Evidence |
| --- | --- | --- |
| `bun run lint` | Server and web-client pass | [Lint log](lint.log) |
| `bun run typecheck` | Server and web-client pass | [Typecheck log](typecheck.log) |
| `bun run build` | Shared web/Tauri UI builds; existing large-chunk warning retained | [Build log](build.log) |
| `bun scripts/verification/nma072/run-tests.ts tests/auth tests/organizations/http.test.ts tests/organizations/workspace-access.test.ts` | 42/42 tests, seven files, disposable PostgreSQL | [Auth/organization log](auth-organizations.log) |
| `bun test apps/web-client/verification/client-scope.test.ts apps/web-client/verification/request.test.ts apps/web-client/verification/workspace-sync.test.ts` | 18/18 tests, three files | [Client-scope log](web-scope.log) |
| `bun run docs:check` | Full checker passes, including local links, milestone/decision consistency and contract export | [Documentation log](docs-check.log) |
| NMA-080–083 `docs-check.ts` wrappers | 4/4 invoke the full checker successfully | [Wrapper log](docs-wrappers.log) |
| `git diff --check` | Pass | Recorded in preservation manifest |

The original documentation baseline failed on eight broken imported GPUI-guide links; their packages are included in this removal. Immutable historical links now resolve through the pinned Git snapshot rather than discarded source directories. The recorded pre-removal file allocation is not a measurement of reclaimed APFS free space. This cleanup does not repeat native provider, deployed server, browser or distribution acceptance. No commit or deployment was performed.
