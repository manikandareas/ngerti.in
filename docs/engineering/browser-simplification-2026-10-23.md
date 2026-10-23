# Browser: simpler limits, targeted validation, bounded recovery

Follow-up to the [82944 audit](browser-thread-82944-audit-2026-10-23.md), implemented at the user's request. No commit/push or production deployment.

## Changed behavior

New standalone browser Tasks use `unit=metered_browser_work`. Their token usage remains measured and settled, but neither the legacy per-Task token-work cap nor its daily admission bucket blocks them. The byte-based `finish_reserve` is removed. Product allowance/cost accounting, owner isolation and resource admission remain; explicit Goal/scheduled budgets and existing immutable Task snapshots are preserved.

Defaults: 20-minute browser sessions, 60 steps, 64 total model calls. V2 exploration leaves two call slots for synthesis/verification. This is a count limit, not an extra token reservation. Existing duration/concurrency/resource retention policies remain finite. Migration `0021_browser_metering` permits metered browser usage to exceed the old token cap without a database constraint error. Other work still enforces its cap. Retrying a metered Task no longer fails solely because usage exceeds that historical cap.

Stopping exploration now attempts synthesis and verification before choosing a partial result. An explicit stop reason is context, not an instruction to skip finalization. Finalization metadata distinguishes `verified` and `partial`. Search-result pages are navigation/discovery, not independent article evidence. The initial search uses the concise first instruction sentence rather than 500 characters of report-writing directions.

DOM link guards bind document identity, observed node, label, href and target context. Unrelated body text changes do not invalidate routine links. Backend-classified routine link dispatch can tolerate those changes; approval-bound operations still compare the full current document fingerprint. Changed destinations remain stale. Permission classification distinguishes command-shaped labels/routes from incidental risk words inside article headlines/slugs. Actual delete/send/security operations still require approval; privacy and ownership gates remain.

Search text preparation can compose public queries, but must preserve exact user-provided field values such as City=Lisbon. It may not invent personal/transactional values. A host-approved GET search form can be filled and submitted under one dispatch journal identity. Other forms are not auto-submitted by this change.

Browser-native error-page Reload is routine only when observed in the `chrome-error:` document with the actual reload control. A website cannot gain this permission just by labeling a button Reload. V2 navigation errors can return to the last readable URL and choose another source, at most three times. The progress guard permits more exploration; one replan resets local repetition counters without resetting usage or total work limits.

## Error handling

- Unexpected observation/model workflow errors are recorded by type and Task identity; up to three durable recoveries with bounded backoff are allowed when ownership, deadline and dispatch state prove recovery safe.
- Persistent errors stop compute and leave an explicit retryable failure. An unconfirmed mutation remains blocked for reconciliation and is never blindly repeated.
- Synthesis/verifier calls each have one retry for provider/parsing failures. Exhaustion or unavailable finalization can produce labeled partial evidence instead of discarding it.
- Stale target inspection is recorded as stale rather than unknown mutation.
- The API middleware catches unexpected request errors and returns a sanitized HTTP 500 with request ID and appropriate configured-origin CORS headers. The service remains available for subsequent requests. It does not pretend a failed request succeeded or automatically replay a POST.
- Existing UI route error boundaries, query errors, VNC reconnect and command error states remain active. This is not a promise that every possible OS crash, database outage or unsupported third-party page can continue without interruption.

## Verification

- V2 disposable integration suite: 31 checks, including cap crossing, transient checkpoint/resume, bounded persistent failure, finalization after exploration limit, provider retry, API error redaction, candidate integrity and native Reload vs website label.
- Permission regression: 38 checks passed, including headline/slug and actual delete-endpoint cases. Legacy workflow fixtures explicitly pin version 1 rather than inheriting the new default.
- Chromium: 10 checks including privacy gates, stable routine link guard amid unrelated text changes, and invalidation when href changes.
- Live E2B/Jev dynamic fixture: three causal tabs with unrelated text updated every 250 ms, verified report, retained-runtime upgrade/cold resume and cleanup passed. Contents remain synthetic; this is not real-world research acceptance.
- Live E2B/Jev approval regression: seven checks passed, including private takeover, routine search, exact mutation approval, verified result and cleanup. [Evidence](evidence/browser-simplification/approval-live.json).
- Task/file/quota suites: 56/47/46 checks passed. Browser-runtime and legacy computer suites: 14/51 checks passed.
- A separate real-web probe uses unmodified websites. It exposed unnecessary approval of Chrome Reload and an article headline containing “Change”; both produced targeted fixes. A later attempt reached a private page and paused for human control. Complete autonomous three-source real-web research is therefore **not claimed as passed**. The probe deletes its disposable E2B resource even on failed acceptance.

Evidence: [contracts](evidence/browser-simplification/contracts.json), [Chromium](evidence/browser-simplification/browser.json), [dynamic E2B](evidence/browser-simplification/dynamic-live.json).

## Local activation

The local database has migration 0021. `.env` selects workflow 2, Jev, 60 steps and 64 calls. Use a new Task for the metered policy; historical Task policy/evidence is not rewritten. API/worker must load the latest source after restart. No historical failed Task was automatically retried.

Final static gates: `make check`, `make build`, `make docs-check`, and `git diff --check` passed. Development API/worker/frontend were restarted after confirming zero active Tasks/workspaces.
