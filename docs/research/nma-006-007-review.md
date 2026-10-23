# NMA-006 and NMA-007 verification review

Date: 2026-10-23. Scope: `5f2b59c` through NMA-006 commit `623f4fb` and the current
uncommitted NMA-007 implementation, including untracked source files. Standards and spec
reviews ran independently in two review agents; the primary reviewer verified reproductions.
No production code was changed during this review.

Sources: [NMA-006](https://app.notion.com/p/402abdd6187381d899d0c98b4bf081d7),
[NMA-007](https://app.notion.com/p/402abdd61873818f8b8dcd3da097114d),
[ADR-03](nma-005-domain-contract.md), AGENTS.md and the pinned upstream seams.
Both tasks remain **Review**. The existing happy-path tests do not cover the two defects below.

## Standards review

No confirmed hard violation of the documented English-language, single-authority, source-pin,
or data-preservation rules. No material code-smell finding was raised.

**P2 — NMA-006/007: character limits and wire byte limits disagree.**
`service.py:93` limits each incoming frame to 262,144 bytes. `adapter.py:287` accepts
100,000 text characters; `agents.py:109` accepts 16,000 characters per persona field.
Canonical JSON escapes non-ASCII characters. A 44,000-character CJK runtime input produces
264,590 bytes; two valid 16,000-emoji persona fields produce 384,540 bytes. The real
Clerk-authenticated HTTP → Unix socket → engine request returned **503 ENGINE_UNAVAILABLE**.
The emoji example is a public API example: browser maxlength counts UTF-16 units differently.

The reverse direction also breaks at the supported page size of 100: even a minimal listing of
100 valid profiles with two 16,000-character CJK fields serializes to 19,210,654 bytes, exceeding
the API reader's 16 MiB limit. This list case was reproduced with the actual canonical serializer
and configured StreamReader, not by inserting 100 profiles into the browser test partition.

Use compatible byte budgets for serialization/framing/pagination and return a non-retryable
validation error when an input exceeds the documented budget. Keep canonical digest compatibility
when changing wire encoding. Add Unicode request and maximum-page response boundary coverage.
Evidence: [read-only reproduction](evidence/nma-006-007-review/transport-boundaries.py),
[measured sizes/errors](evidence/nma-006-007-review/transport-boundaries.json),
[real HTTP result](evidence/nma-006-007-review/unicode-http.json).

## Spec review

**P1 — NMA-007: an edit can block reconciliation of an already-admitted run.**
At `adapter.py:290–294`, only a completed extension receipt skips `binding()`.
A pending operation reaches the current-revision check at `adapter.py:161–162` before looking
up its existing native receipt. With revision 1 already admitted natively, a lost extension
completion followed by `agent.configure` to revision 2 makes the original exact retry return
`REVISION_CONFLICT`. The original native run still exists with revision 1.

The real-runtime probe reconstructs the valid post-native-commit/pre-extension-finish state
inside a disposable fixture, then performs the actual edit and retry. It is boundary-state
fault reconstruction, not a claim that the process was killed at that exact instruction.
This contradicts ADR-03's requirement to read existing native receipts after uncertain responses
and the promised original run snapshot. It is specifically introduced by configuration revision
validation, beyond the separately documented lack of general NMA-010 recovery automation.

Reconcile an existing pending command from its stored immutable binding/native operation identity
before applying current-config validation to fresh admissions. Preserve refusal of new commands
that explicitly name stale revisions. Add this exact lost-completion + configure + retry case.
Evidence: [real-runtime reproduction](evidence/nma-006-007-review/pending-config-retry.py),
[result](evidence/nma-006-007-review/pending-config-retry.log).

The spec review also independently identified the **P2 transport mismatch** above. No additional
scope-creep finding was raised. Full DM/group consumer acceptance and package distribution clearance
remain explicit existing gates, rather than newly introduced product requirements.

## Verification results and completion gates

- NMA-006's committed baseline, extracted separately without modifying the working tree:
  **10/10** real-runtime tests passed on macOS.
- Current combined NMA-006/007: **14/14** real-runtime tests passed on macOS and **14/14** on
  Linux aarch64 as UID 10001. Both use Python 3.14.9, SQLite 3.53.1/WAL and a deterministic
  loopback provider. Linux retained one non-failing pytest-cache permission warning.
- Current HTTP boundary suite: **4/4** passed. Browser evidence covers real authentication,
  create/edit/reload/restart, distinct profiles/models, archive/restore, desktop and mobile.
- Changed-file Python lint/format, backend mypy, web lint/typecheck/build, documentation and
  whitespace checks passed. Full `make check` still stops at the pre-existing import-order
  error in `scripts/spikes/hermes_runtime/inventory.py`.
- Fresh inventories still lack packaged notices for `fetch-use` and `firecrawl-anydoc`; the
  previously documented `pillow-heif` bundled-codec clearance issue is not resolved by passing
  tests. No distribution/legal clearance or production readiness is claimed.

Linux evidence was exported from BuildKit without pushing a runtime image:
`docker build --target evidence --output type=local,dest=.dev/nma-review/linux apps/engine`.
[Linux results](evidence/nma-006-007-review/linux-tests.log),
[Linux inventory](evidence/nma-006-007-review/linux-inventory.json),
[NMA-006 baseline results](evidence/nma-006-007-review/nma006-baseline.log).

NMA-006 remains Review for the transport defect and distribution gate. NMA-007 remains Review
for pending-command reconciliation, the transport defect, its dependency, and the unverified
full DM/group consumers. Its run-revision acceptance checkbox is reopened. Review findings are
recorded without silently changing the implementation under review.

Axis totals: Standards 0 hard-rule violations plus 1 P2 correctness finding; Spec 2 findings
(P1 reconciliation and overlapping P2 transport). There are 2 distinct defects overall.

## Subsequent fixes

Both defects were corrected and regression-tested after this review. See the
[fix report](nma-006-007-fixes.md): 17 runtime tests on each platform, six HTTP tests and full
`make check` pass. The historical findings above describe the reviewed pre-fix state.
