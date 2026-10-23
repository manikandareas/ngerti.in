# Runtime, agent lifecycle and capability closure review

Date: 2026-10-23. Reviewed `623f4fb^` through HEAD `e69843e`, plus the current
NMA-008 working tree. Live Notion tickets and the Definition of Done were read.
Two separate reviewers inspected standards and specification compliance.

## Standards

No confirmed hard project-rule violation. One non-blocking maintainability
finding: manual cancellation and lifecycle cancellation duplicate the native
`cancel_or_claimed` / generation-specific interrupt sequence in `adapter.py`.
Consider one helper to prevent divergence. Native Hermes remains the sole
execution and recovery authority; reviewed backend text is English.

The fixed `max_turns: 8` deserves a documented operational rationale, but this
review does not equate a native per-run resource limit with a new initiative
policy or count it as a confirmed violation.

## Spec

**P2 — MCP discovery metadata bypasses credential redaction.** At
`apps/engine/src/ngertiin_engine/adapter.py:239`, native staging discovers tool
schemas and commits them at line 252 without sanitizing known credential values.
The final-dispatch wrapper sanitizes tool results and the logging factory
sanitizes logs, but neither covers the persisted discovery schema. A disposable
real HTTP MCP fixture returning the exact synthetic bearer token in a tool
description causes the existing secret-not-in-SQLite assertion to fail. No
transformation or encoding of the credential is involved. Provider disclosure
was not established by this reproduction.

This contradicts NMA-008's acceptance criterion, "secret tidak terekspos".
Sanitize or reject secret-bearing discovery metadata before durable staging,
and cover initial discovery and restart with a regression test. The existing
passing tool-result checks do not establish this boundary. Evidence and a
rerunnable reproduction are in `evidence/nma-006-008-review/`.

## Closure decisions

- **NMA-006: remain Review.** Adapter contracts have positive evidence. The
  recorded distribution gate remains unresolved: missing packaged notices for
  `fetch-use` and `firecrawl-anydoc`, plus the documented `pillow-heif` codec
  review. This review makes no independent legal clearance claim.
- **NMA-007: remain Review.** Stable identity across bindings has evidence, but
  the live ticket still lacks integrated DM/group consumer acceptance. Its
  dependency NMA-006 is not Done.
- **NMA-008: remain Review.** Reopen secret non-exposure acceptance for the
  reproduced schema leak. Its dependency NMA-007 is also not Done.

The authoritative Definition of Done requires acceptance and completed
dependencies. No task was moved to Done, and no production code was changed by
this review. Existing Linux/browser/build evidence was inspected rather than
claimed as newly executed. Fresh regression results are recorded in the Notion
review notes alongside the new failing boundary reproduction.
