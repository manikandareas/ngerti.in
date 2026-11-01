# Retired backend runtime

The active application lifecycle, API and harness adapters live in [apps/server](../server/README.md). Obsolete Python/Hermes source, dependency locks, build recipes and migration tooling were removed after their replacement boundaries became available. This directory is not a runtime fallback.

Historical source is available at Git revision `80f66b9786d7776138fbe001b26ef068f1132624`. Restore a separate historical checkout to reproduce old scripts; do not install those dependencies into the active workspace. The verified local archive and per-file hashes are recorded in [the retirement manifest](../../docs/verification/nma-060/completion/retirement.json). Historical verification artifacts and license/provenance notices remain unchanged.

No databases, credentials, untracked files, Docker containers or volumes were removed. Harness-first operation uses its own persistence; it does not require migration of the retired development data.
