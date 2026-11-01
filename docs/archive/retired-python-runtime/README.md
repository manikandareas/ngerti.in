# Retired Python runtime archive

`apps/backend` and `apps/engine` were removed after their runtime source had been retired. The active lifecycle, backend API and harness adapters live in [apps/server](../../../apps/server/README.md).

This archive preserves the remaining tracked files byte-for-byte at their original relative paths, including [engine license/provenance notices](apps/engine/notices/provenance.json) and [browser source attribution](apps/backend/src/ngertiin/computer/jev_assets/README.md). The adjacent browser MIT license was recovered from the recorded historical source revision. Archived READMEs are historical snapshots: their commands and relative links refer to the old checkout, not this archive. Do not use them to launch the current application.

[cleanup.json](cleanup.json) records original paths, archive locations, hashes and removed file counts. Removed content was limited to the two retired directories: local virtual environments, tool caches, Python bytecode and the downloaded runtime source tarball. Symlinks were unlinked without following their targets. Shared Python installations, active server files, databases, credentials, Docker resources and `.dev/nma060/retired-source.tar.gz` were preserved.

Historical verification manifests were not rewritten. For entries naming the removed README/notice paths, use the byte-identical archive mapping in `cleanup.json`. The root README now documents this cleanup, so its earlier hash describes the historical commit, not the current documentation. Commit `10460fa` retains the pre-cleanup tree; runtime source prior to retirement is at `80f66b9786d7776138fbe001b26ef068f1132624`.
