# Tauri desktop cleanup

Date: 2026-11-05. The user selected Tauri as the sole desktop implementation and authorized removal of Electron and the unused `apps/web` workspace. Retired source is available at Git revision `6de957e7145c0367a52b10f5fd19bbd91c50e458`.

The active workspaces are `apps/desktop` (Tauri host and tooling), `apps/web-client` (shared React UI), `apps/server` (Bun backend), and `packages/avatar`. Electron main/preload, its TypeScript gateway/supervisor, Forge configuration, build/package scripts and Electron-specific tests were removed. The legacy web application, its dependencies and its source-coverage collector were removed. Root build/lint/typecheck/format commands now target the active client. The lockfile was regenerated and obsolete local Electron package entries were removed.

Setup helpers moved to `apps/desktop/scripts/profile.ts`; setup and launch retain the existing Tauri profile path. The Rust host continues to own native gateway and backend supervision. Historical documents identify the retired source revision, and recorded evidence files retain their original bytes and proof boundaries.

| Verification | Result |
| --- | --- |
| `bun install --frozen-lockfile --ignore-scripts` | Pass |
| `bun run check` | Backend/client lint and typecheck pass; 397 backend tests pass, 0 fail |
| `cd apps/web-client && bun test verification` | 49 pass, 0 fail |
| `bun run build` | Pass; builds the active UI |
| `bun run typecheck:desktop` | TypeScript and Cargo check pass |
| `bun run test:desktop` | 1 Bun profile test and 5 Rust tests pass, 0 fail |
| `bun run lint:desktop` | Biome, Rust fmt and Clippy pass |
| `bun run verify:foundation` | 8 process/HTTP/lifecycle checks pass, 0 fail, 0 skip |
| Isolated `setup:desktop`, then repeat setup | Pass; selected state path, private permissions and existing profile bytes preserved |
| `bun run package:desktop` | Pass; rebuilt `Ngertiin Tauri.app` and its shipped Bun/backend passed authenticated readiness with isolated temporary state and no credentials |
| Active workspace/reference audit | Four valid workspaces; Electron/Forge dependencies and retired web/desktop imports absent |
| `git diff --check` | Pass |

`python3 scripts/check_docs.py` reports the same 85 pre-existing broken historical links before and after cleanup, with no added failures. The existing Vite warning about minified chunks above 500 kB remains. The transitive `electron-to-chromium` package is browser-compatibility data used by Browserslist; it is not an Electron runtime or desktop dependency.

The rebuilt macOS ARM64 development bundle is at `apps/desktop/src-tauri/target/release/bundle/macos/Ngertiin Tauri.app`. Packaging does not replace the separately installed application. The local packaging log is `.dev/cleanup-tauri/package.log`.

This cleanup does not repeat native interaction or provider inference acceptance. Application data, credentials, profiles, shared machine state and separately installed applications are preserved. See [Tauri development](../architecture/tauri-development.md) for the active commands and [the original trial](tauri-development/README.md) for prior native observations.
