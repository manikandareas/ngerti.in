# Historical evidence and source recovery

[Current product scope](../../PRODUCT.md), [architecture](../architecture/overview.md) and [the local backlog](../backlog/README.md) govern ongoing work. Raw historical verification and research captures describe their original source/configuration and are not current workflow instructions.

The complete tracked tree before documentation cleanup is available at Git revision `bdeeec2fa776b1cd6cd457e1db49ecc732ae51e6`. For example:

```sh
git show bdeeec2fa776b1cd6cd457e1db49ecc732ae51e6:docs/product/01-produk-dan-paket.md
```

Retired Python runtime source is available at `80f66b9786d7776138fbe001b26ef068f1132624`; its pre-cleanup tracked archive was present in the revision above. Electron source before retirement is at `6de957e7145c0367a52b10f5fd19bbd91c50e458`. Restoring a historical checkout does not re-enable a runtime fallback in the active application.

The user removed the old archive directory from the working tree. Current guides therefore point here rather than recreating that directory. Retained raw evidence, versioned contract exports, source notices and immutable result manifests keep their original scope and bytes. Paths/hashes in old manifests may name retired source and require its historical checkout. Their presence is not proof of current compatibility or release readiness.

[Historical link records](historical-links.json) identifies immutable evidence directories whose original links can be checked against the pinned pre-cleanup Git tree. The link checker requires the source Markdown to match its pinned bytes before allowing that fallback. Current guides and new/modified files must resolve local links in the working tree.

## Retired GPUI clients — 2026-11-15

The owner removed `apps/desktop-rs`, `apps/gpui-experiment` and the repository-local GPUI skills to retain the latest authenticated organization implementation in server/web-client/Tauri. The complete source, manifests, lockfiles, assets and guides immediately before removal remain available at Git revision `51dea542d545e6faf290b6d5e3771717d47b002e`:

```sh
git show 51dea542d545e6faf290b6d5e3771717d47b002e:apps/desktop-rs/README.md
git show 51dea542d545e6faf290b6d5e3771717d47b002e:apps/gpui-experiment/README.md
```

Tracked raw files formerly under `apps/desktop-rs/verification` now live byte-for-byte in [retired verification](../verification/retired-desktop-rs/); asset license notices are retained in its `notices` directory. Existing `docs/verification/nma-066` through `nma-071` and GPUI experiment reports keep their original bytes and historical scope. Old source hashes and paths resolve against the pinned revision, not the retained client. Dedicated Cargo build caches, generated app bundles inside the removed apps and the desktop-rs tool cache were removed; application data, private profiles, credentials and installed applications were preserved. See [cleanup verification](../verification/desktop-retirement-2026-11-15/README.md).

## Retired installation-token authentication — 2026-11-15

The owner makes account authentication mandatory and removes the installation-bearer API/proxy, auth-mode selector, Tauri local supervisor and bundled Bun/backend. The source immediately before these changes is available at Git revision `51dea542d545e6faf290b6d5e3771717d47b002e`, including `apps/desktop/src-tauri/src/supervisor.rs` and the original [Tauri development evidence](../verification/tauri-development/README.md). Retained version-1 profiles and application/server data are preserved; the current client uses a separate version-2 profile. Historical data import/binding is a controlled recovery operation, not an authentication fallback. See [current verification](../verification/accounts-only-2026-11-15/README.md).

The [account-only retirement manifest](../verification/accounts-only-2026-11-15/retired-verification.json) also identifies pre-account verification bootstraps, Playwright configurations and browser journeys requiring installation-token injection. Their complete source remains in the same pinned Git revision. The active browser baseline is the authenticated organization suite, with isolated avatar/component checks retained. Historical screenshots, results and failure logs remain unchanged; retiring a probe does not promote NMA-063 full-product acceptance.

## Retired Codex execution — 2026-11-16

The owner replaces the app-owned Codex conversation execution protocol with the shared ACP SDK client. `harness/codex/{adapter,client,rpc,output}.ts` and the old execution fixture are removed; `harness/codex/{authority,authority-rpc}.ts` retain only account login, refresh, logout and model catalog access. The credential authority cannot open a thread or dispatch a model/tool turn. Muse SDK/MSP remains active.

The complete pre-cutover source is retained at Git revision `8e92fda1c581c8dc363de16a8d3b4870e09ad1f9`. The [retirement manifest](../verification/acp-2026-11-16/retired-source.json) identifies removed execution files and historical direct-client/SQLite/bootstrap probe entrypoints. Raw results remain unchanged. The [ACP verification](../verification/acp-2026-11-16/profiles/README.md) has its own source/configuration and acceptance boundaries. Historical multi-account, native skill, machine and deployment captures do not certify the ACP replacement.

```sh
git show 8e92fda1c581c8dc363de16a8d3b4870e09ad1f9:apps/server/src/harness/codex/client.ts
```
