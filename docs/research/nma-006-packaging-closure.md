# Foundation runtime packaging closure

Date: 2026-10-23. Task: [NMA-006](https://app.notion.com/p/402abdd6187381d899d0c98b4bf081d7).
Dependency NMA-005 was read live and remains Done. This report supersedes the
packaging blocker for the foundation profile, preserving the full-app audit as
historical evidence. It does not close NMA-007 or NMA-008.

## Change and provenance

The new `apps/engine/build_runtime.py` verifies the pinned Hermes manifest and
lock hashes, uses native PM to export ACP/MCP requirements, and builds a fresh
dependency environment. Source revision remains
`7489b22af47ce91b366dde81d5831ea422577498`; no upstream source/lock is modified.
Hermes is imported from that source tree rather than installing full-app package
metadata with requirements this deployment profile deliberately excludes.

The foundation excludes `pillow-heif`, `fetch-use`, and `browser-harness`.
HEIC/HEIF and native Browser Use are not supported by this profile. The existing
text, native todo and HTTP MCP paths do not require these packages. This is a
dependency distribution boundary, not a new initiative policy or a removal of
legacy product functionality. Future executor/browser slices must select and
verify their own distribution dependencies before enabling those paths.

`fetch-use==0.4.0` has no license/notice in either the wheel or source archive;
its declared GitHub repository returned unavailable. We did not invent a
copyright notice. Its parent browser-harness is excluded together with it.
The source archive inspected was:
`https://files.pythonhosted.org/packages/5d/2d/66784fa8b66a04f170ad8f6598688b30b3a194dad4185b36d53da4ae1505/fetch_use-0.4.0.tar.gz`
(SHA-256 `9511987d4907ec6dac501e21d66946d10098f66b5d21bc2aba4189cd81ba189a`).

`firecrawl-anydoc==0.2.4` remains installed. Its MIT notice is copied verbatim
from its exact source archive into `apps/engine/notices/`; `provenance.json`
records the archive URL/hash, source member and notice hash. Inventory verifies
the installed version and notice hash before accepting that supplement.

The Docker `foundation` target includes application dependencies only. `verify`
uses a separate environment with locked test dependencies, but starts service
processes through `/opt/runtime/bin/python`. The build rejects missing notices
and excluded packages. `HERMES_DISABLE_LAZY_INSTALLS=1` prevents implicit package
installation from changing the reviewed deployed set. Runtime source and all
existing source/package notices are retained in the image.

## Verification

Evidence: [evidence/nma-006-closure](evidence/nma-006-closure/verification.json).

- **17/17** tests passed against the exact staged NMA-006 baseline extracted
  separately, using the foundation interpreter on macOS arm64. This does not
  depend on the uncommitted capability changes.
- **21/21** combined regression tests passed on macOS arm64 and Linux aarch64,
  including existing working-tree capability tests. The service used the
  foundation interpreter, not pytest's larger dependency environment.
- Python **3.14.9**, SQLite **3.53.1/WAL**; Linux runs as UID **10001** and retains
  one harmless pytest-cache permission warning.
- Both platform foundation inventories contain **76 distributions**, no excluded
  packages and **zero missing notices**. Test environments contain 82 packages.
  The macOS installed versions match the upstream lock. A negative probe rejects
  the previous full-app environment at the new inventory gate.
- Full `make check`, changed packaging Ruff checks and `git diff --check` passed.
  Models are deterministic loopback fixtures; this is not a live-provider claim.

The original four acceptance items retain their adapter contract evidence:
agent/thread/config attribution; native tools/events/error/cancel mapping;
legacy isolation; source provenance and operations/upgrade documentation.
The foundation packaging gap is resolved through the explicit exclusions and
the exact-version supplemental notice, not by relabelling the original wheels.

## Review

Standards: no hard violation. One optional duplication heuristic remains between
the builder's exclusion set and the inventory guard; both agree for this pin.
Spec: no blocking packaging finding. Review explicitly limits closure to the
tested foundation profile. Neither reviewer considered the separate NMA-008
metadata credential leak fixed by this work.

## Operational limits

This is not blanket legal clearance of upstream extras or a production release
approval. No image was pushed or deployed; no production data was migrated.
Full product isolation, downstream DM/group consumers, durable replay, goals,
credential lifecycle and cutover gates remain in their assigned tickets.
The historical full-app environment still has its original packaging issues.
Reintroducing excluded dependencies requires a new packaging review and tests.

Local commits use descriptive changes rather than ticket numbers. Exact
implementation/evidence commit IDs are recorded on the Notion ticket; source
hashes and the tested working-tree boundary are retained in the evidence manifest.
