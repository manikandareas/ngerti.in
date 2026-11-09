# Native development bundle runbook

## Build and validate

From the repository root, run:

```sh
bun run check:desktop-rs
bun --cwd apps/desktop-rs bundle:dev
bun apps/desktop-rs/verification/nma-071/verify-bundle.ts
```

The build produces `apps/desktop-rs/dist/Ngertiin Rust Development.app`. Open that application in Finder. It contains the native executable, fonts, icons, theme/syntax resources, Bun, and the backend-only runtime/dependency closure. It does not mount the web-client distribution. The build rejects source changes during compilation or resource staging; rebuild once the source is stable if that guard fires.

`Contents/Resources/build-manifest.json` records the source inputs, executable digest and every shipped resource digest. `verify-bundle.ts` verifies those hashes, checks for private-state files and external symlinks, excludes React/Lexical application dependencies, and starts/stops the bundled backend from a disposable directory outside the checkout. That probe does not execute a provider or certify signing/distribution.

## State and backend ownership

Normal launch imports configuration paths from the existing private Tauri desktop profile into `~/Library/Application Support/Ngertiin Rust Development/profile.json`. The native manager has its own UUID. A compatible running backend remains external; otherwise the host starts an owned backend. In an application bundle, the bundled Bun/backend take precedence over the imported checkout paths. An incomplete packaged runtime is an actionable error and does not fall back to an arbitrary checkout.

For isolated verification, `NGERTIIN_RS_PROFILE=<name>` selects a private `profiles/<name>/` directory. A private `attachment.json` containing a loopback `origin`, absolute `token_file`, and optional `thread_id` selects attach-only mode. Keep the directory at 0700 and the attachment/token files at 0600. Never place installation tokens, provider credentials or test profiles in the bundle or retained evidence.

Completion follows the [focused November 9 scope](../../development/nma-071-closure-scope-2026-11-09.md). For presentation changes, run affected native cases and strict Clippy; the full check remains available for broad changes. Avoid repeating unchanged provider inference or exhaustive screenshot/performance cohorts.

The real-API fixture entry points are `apps/desktop-rs/verification/nma-071/journey-server.ts` and `wizard-server.ts`; `comprehensive-server.ts` extends the retained NMA-069 fixture with real broker queue controls and a deterministic local transport. The first exercises product interactions without an executor. The second uses the actual broker/journal with a deterministic local harness transport; it is not provider inference. Their private attachment files and tokens are written beneath their ignored `.dev/` output directories.

Close hides the native window. Show Workspace and Dock reopen return to the same process. Quit drains native cleanup and stops only an owned backend. Quitting an attach-only test profile preserves the external service. The retained shared Linux machine and unrelated application profiles must not be reset during verification.

For functional startup evidence, open the bundle normally from Finder. The CUA `getApp` entry point explicitly starts an app in the background and can produce occluded/stale raster observations even when accessibility data has advanced. Record that condition rather than treating it as a normal foreground startup measurement. The current cohort retained separate Finder Open checks with both existing and fresh profiles and a geometry round trip. No first-snapshot refresh workaround is shipped.

## Diagnostics and recovery

`NGERTIIN_RS_DIAGNOSTICS=1` enables private Computer diagnostics and a latched `visibility.json` record on visibility transitions. The latter records actual GPUI visibility/activity and delivered avatar-image count, so a hidden-window performance sample can verify its precondition. It does not contain a viewer URL or token. Disable diagnostics for ordinary use.

Message submissions, staged bytes, partial native-question answers and pending operation identities live in the native profile's private workspace journal. Reload and relaunch reconcile authoritative state. Native interaction submissions are never blindly replayed. A committed answer is reconciled against the exact scoped response; a different answer preserves the authored draft for review.

Use the native diagnostics/menu and private host logs to distinguish backend startup, protocol, snapshot, viewer and provider failures. Login, model discovery, inference, useful product-tool execution and effective billing are separate stages.

## Rollback and limits

Review the milestone's exact Git diff and retain a verified prior source/bundle before rolling back. Stop the disposable test apps before replacing their executables. Rebuild the chosen revision in a separate checkout when an earlier source state is needed; do not reset unrelated work, credentials, profiles or retained evidence.

This is a local macOS ARM64 development bundle. It is not a signed installer, an updater, a fresh-device certification, a Windows/Linux result or an active-host replacement. Tauri, NMA-063 and NMA-064 retain their separate decisions. Muse verification follows the [owner's separate-scope decision](../../development/nma-071-scope-2026-11-08.md).
