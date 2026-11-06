# Historical evidence and source recovery

[Current product scope](../../PRODUCT.md), [architecture](../architecture/overview.md) and [the local backlog](../backlog/README.md) govern ongoing work. Raw historical verification and research captures describe their original source/configuration and are not current workflow instructions.

The complete tracked tree before documentation cleanup is available at Git revision `bdeeec2fa776b1cd6cd457e1db49ecc732ae51e6`. For example:

```sh
git show bdeeec2fa776b1cd6cd457e1db49ecc732ae51e6:docs/product/01-produk-dan-paket.md
```

Retired Python runtime source is available at `80f66b9786d7776138fbe001b26ef068f1132624`; its pre-cleanup tracked archive was present in the revision above. Electron source before retirement is at `6de957e7145c0367a52b10f5fd19bbd91c50e458`. Restoring a historical checkout does not re-enable a runtime fallback in the active application.

The user removed the old archive directory from the working tree. Current guides therefore point here rather than recreating that directory. Retained raw evidence, versioned contract exports, source notices and immutable result manifests keep their original scope and bytes. Paths/hashes in old manifests may name retired source and require its historical checkout. Their presence is not proof of current compatibility or release readiness.

[Historical link records](historical-links.json) identifies immutable evidence directories whose original links can be checked against the pinned pre-cleanup Git tree. The link checker requires the source Markdown to match its pinned bytes before allowing that fallback. Current guides and new/modified files must resolve local links in the working tree.
