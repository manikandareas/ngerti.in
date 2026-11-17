# Historical evidence and source recovery

[Current product scope](../../PRODUCT.md), [architecture](../architecture/overview.md) and [the local backlog](../backlog/README.md) govern ongoing work. Raw historical verification and research captures describe their original source/configuration and are not current workflow instructions.

The complete tracked tree before documentation cleanup is available at Git revision `bdeeec2fa776b1cd6cd457e1db49ecc732ae51e6`. For example:

```sh
git show bdeeec2fa776b1cd6cd457e1db49ecc732ae51e6:docs/product/01-produk-dan-paket.md
```

Retired Python runtime source is available at `80f66b9786d7776138fbe001b26ef068f1132624`; its pre-cleanup tracked archive was present in the revision above. Electron source before retirement is at `6de957e7145c0367a52b10f5fd19bbd91c50e458`. Restoring a historical checkout does not re-enable a runtime fallback in the active application.

The user removed the old archive directory from the working tree. Current guides therefore point here rather than recreating that directory. Historical evidence and result manifests remain in Git; versioned contract exports and required source notices remain in the working tree. Paths/hashes in old manifests may name retired source and require its historical checkout. Their presence is not proof of current compatibility or release readiness.

[Historical link records](historical-links.json) identifies immutable evidence directories whose original links can be checked against the pinned pre-cleanup Git tree. The link checker requires the source Markdown to match its pinned bytes before allowing that fallback. Current guides and new/modified files must resolve local links in the working tree.

## Retired GPUI clients — 2026-11-15

The owner removed `apps/desktop-rs`, `apps/gpui-experiment` and the repository-local GPUI skills to retain the latest authenticated organization implementation in server/web-client/Tauri. The complete source, manifests, lockfiles, assets and guides immediately before removal remain available at Git revision `51dea542d545e6faf290b6d5e3771717d47b002e`:

```sh
git show 51dea542d545e6faf290b6d5e3771717d47b002e:apps/desktop-rs/README.md
git show 51dea542d545e6faf290b6d5e3771717d47b002e:apps/gpui-experiment/README.md
```

Tracked raw files formerly under `apps/desktop-rs/verification`, the NMA-066–071 reports and GPUI experiment captures remain byte-for-byte in the [verification archive](#verification-archive--2026-11-17). The [Hugeicons notice](retired-desktop-notices/Hugeicons-LICENSE.md) and [Material Icon Theme notice](retired-desktop-notices/material-icon-theme-LICENSE) remain in the working tree. Old source hashes and paths resolve against their pinned revision, not the retained client. Dedicated Cargo build caches, generated app bundles inside the removed apps and the desktop-rs tool cache were removed; application data, private profiles, credentials and installed applications were preserved.

## Retired installation-token authentication — 2026-11-15

The owner makes account authentication mandatory and removes the installation-bearer API/proxy, auth-mode selector, Tauri local supervisor and bundled Bun/backend. The source immediately before these changes is available at Git revision `51dea542d545e6faf290b6d5e3771717d47b002e`, including `apps/desktop/src-tauri/src/supervisor.rs` and the original [Tauri development evidence](history.md#verification-archive--2026-11-17 "Archive: docs/verification/tauri-development/README.md at 043f7c9"). Retained version-1 profiles and application/server data are preserved; the current client uses a separate version-2 profile. Historical data import/binding is a controlled recovery operation, not an authentication fallback. See [current verification](history.md#verification-archive--2026-11-17 "Archive: docs/verification/accounts-only-2026-11-15/README.md at 043f7c9").

The [account-only retirement manifest](history.md#verification-archive--2026-11-17 "Archive: docs/verification/accounts-only-2026-11-15/retired-verification.json at 043f7c9") also identifies pre-account verification bootstraps, Playwright configurations and browser journeys requiring installation-token injection. Their complete source remains in the same pinned Git revision. The active browser baseline is the authenticated organization suite, with isolated avatar/component checks retained. Historical screenshots, results and failure logs remain unchanged; retiring a probe does not promote NMA-063 full-product acceptance.

## Retired Codex execution — 2026-11-16

The owner replaces the app-owned Codex conversation execution protocol with the shared ACP SDK client. `harness/codex/{adapter,client,rpc,output}.ts` and the old execution fixture are removed; `harness/codex/{authority,authority-rpc}.ts` retain only account login, refresh, logout and model catalog access. The credential authority cannot open a thread or dispatch a model/tool turn. Muse SDK/MSP remains active.

The complete pre-cutover source is retained at Git revision `8e92fda1c581c8dc363de16a8d3b4870e09ad1f9`. The [retirement manifest](../../scripts/verification/acp/fixtures/retired-source.json) identifies removed execution files and historical direct-client/SQLite/bootstrap probe entrypoints. Raw results remain unchanged. The [ACP verification](history.md#verification-archive--2026-11-17 "Archive: docs/verification/acp-2026-11-16/profiles/README.md at 043f7c9") has its own source/configuration and acceptance boundaries. Historical multi-account, native skill, machine and deployment captures do not certify the ACP replacement.

```sh
git show 8e92fda1c581c8dc363de16a8d3b4870e09ad1f9:apps/server/src/harness/codex/client.ts
```

## Verification archive — 2026-11-17

The owner removed the complete `docs/verification` working directory, including its screenshots, logs, reports and historical manifests. All 5,074 tracked files remain available in local Git revision `043f7c9d70cdc82bb09d6aec5de1dd92ca6bc89a`. This revision has not been published as part of the cleanup; recovery uses the local repository. Documentation links to this section retain the original archive path in their link title.

Read an individual report without restoring the directory:

```sh
git show 043f7c9d70cdc82bb09d6aec5de1dd92ca6bc89a:docs/verification/nma-079/README.md
```

Export the complete historical directory when needed:

```sh
git archive --format=tar --output=/tmp/ngertiin-verification.tar 043f7c9d70cdc82bb09d6aec5de1dd92ca6bc89a docs/verification
```

Inputs still required by the retained code were copied without changing their bytes:

- [Organization HTTP inventory](../../apps/server/tests/organizations/fixtures/http-contract.json) for the access-surface tests and observer.
- [ACP source-retirement inventory](../../scripts/verification/acp/fixtures/retired-source.json) for source manifests.
- [Visual input fixture](../../scripts/verification/nma059/fixtures/visual-input.png) for the retained browser probe.
- The two retired desktop asset notices linked above.

Verification scripts now write generated results under ignored `.dev/verification`, outside the documentation tree. Historical multi-phase replay, report and sealing scripts still require their original phase inputs; regenerate those inputs or restore the required capture files there from the archived revision. A fresh output directory does not inherit a previous acceptance result. Earlier versioned contract snapshots retain their historical evidence paths; the current contract points to this recovery guide.
