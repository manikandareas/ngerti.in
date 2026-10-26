# NMA-029 implementation review

Authority: [live NMA-029](https://app.notion.com/p/404abdd618738173a4dbeb0ef22a8308), its four dependency pages, the primary multi-agent page, and acceptance document 07, inspected on 2026-10-26. All dependencies were Done. The original delivery evidence was already present in a dirty working tree when this review began.

**Conclusion:** the three foundation units meet the ticket scope after the review corrections below. No unresolved foundation defect was found in the inspected paths and exercised cases. Release acceptance remains open.

## Findings corrected

1. **Known no-input rejection incorrectly remained unknown.** The trusted actuator can reject a changed/private target inside its final input guard, after the RPC starts but before any external input. `computer_bridge.execute` previously treated these typed `StaleTarget`/`NeedsHuman` refusals as uncertain dispatch. It now preserves explicit rejected/not-dispatched evidence and actionable recovery guidance. Stored guard rejections returned by dispatch-receipt queries receive the same evidence. Generic errors after dispatch remain unknown.
2. **Recovery ignored rejection receipts and did not correlate returned receipts.** `Computer.reconcile` now accepts either completed execution or a proven no-input rejection, only with the original provider operation ID. Missing, unknown and unrelated receipts cannot clear a blocker. The native-gateway regression proves an unrelated receipt leaves the original operation unresolved, a matching rejection resolves it, and one fresh repaired action can run without replaying the original action.
3. **Context-control identity was lost on reload or temporary authentication failures.** The production component now persists the exact pending reset/compression command in owner/thread-scoped session storage, restores its selected agent, and retains it across 401/403/408/429 failures. A synchronous lock prevents rapid duplicate admission. Scope changes fence new asynchronous admission. Successful receipt or definite request refusal clears the pending command.

A subsequent repeat exposed an intermittent ConnectionResetError in the counting test server: it replied without consuming the POST body. The fixture now consumes the body and sends an explicit response length; five complete backend repeats passed afterward. The failed attempts are retained and the product correctly classified that genuine transport failure as unknown.

The backend reproduction failed three new cases before correction; the existing three cases passed. The new cases use a counting HTTP service to prove zero POSTs for the rejected input and one POST after repair. A diagnostic assertion in the Anthropic transport test now reports the connection-admission error directly instead of a downstream NOT_FOUND. Two pre-existing task test files received formatting-only corrections. The engine README describes the stronger receipt and UI retry contracts.

## Evidence interpretation

The initial full suite used the older NMA-006 foundation interpreter and returned 166 passed, one failed, nine skipped. Diagnosis reproduced PROTOCOL_UNAVAILABLE: that interpreter lacks the pinned optional Anthropic package. The existing NMA-040 foundation interpreter has the exact required anthropic 0.87.0. No product dependency pin was relaxed, no lazy installation was enabled, and no original user partition was changed. The complete suite was rerun using that current foundation profile.

All 80 original evidence hashes matched before and after code review. Recalculation from the immutable v2 JSONL reproduces 61 raw passes / 11 failures / nine stops and 67 reviewed passes / five actual failures / nine verified stops. The original source manifest describes the historical delivery; it is not rewritten to disguise review changes. A separate review manifest binds this revision and its fresh checks. The original live model/tool/Clerk results are retained historical evidence, not falsely presented as rerun on the review revision.

The earlier authenticated Brave walkthrough covers real Clerk, manual compression, DM/group reset, noop and API restart. The review browser regression uses the production conversation component and API with a disposable native gateway, controlled model and explicit test authentication. Its injected 401 is a client fault case, not evidence of a real Clerk outage or production deployment.

## Acceptance and limits

The delivery report's acceptance table still maps each of the 12 unit criteria and five combined requirements to code and evidence. This review closes receipt and UI retry gaps within that scope. Hermes remains the sole execution authority; upstream code, pin and notices are unchanged. Additive schema 15, original histories and migration checksums remain intact.

Release quality is separate: five original live task failures, undersized release samples and unresolved dispatched batches remain recorded. NMA-039/NMA-027 own release gates; NMA-031/NMA-032 own native workspace/browser product adoption; NMA-038 owns complete UX composition. The review does not certify production rollout, all upstream features, universal exactly-once effects or migration of the original account. No commit or push is part of this review.

## Fresh verification results

| Check | Result | Evidence |
| --- | --- | --- |
| Complete pinned gateway suite, current foundation interpreter | 168 passed, 9 explicit opt-in skipped, 595.54 s | `engine-final.log` |
| Backend counted effects and authenticated API transport | 20 passed in each of five consecutive runs after fixing HTTP fixture framing | `backend-fixture-verified.log` |
| Review-specific native computer boundary tests | Four passed; the separately diagnosed Anthropic environment failure is retained | `targeted.log`, `anthropic-diagnosis.log` |
| Repository lint, type checks, backend analysis | Passed | `check-final.log` |
| Production web build | Passed | `build.log` |
| Engine lint / format | Passed; only the existing E731 callback allowance is retained | `engine-lint.log`, `engine-format-final.log`, `review-test-lint.log` |
| Documentation and whitespace | Passed | `docs-final.log`, `whitespace.log` |
| Production UI lost ACK / reload / transient auth | Passed against disposable native gateway | `browser-verification.json`, `browser-storage-*.json`, `browser-db-*.json`, screenshots |

All paths in the table are under [the separate review evidence directory](evidence/nma-029-review/verification.json). The full suite's 41 engine source/config files were unchanged during this run. Nine opt-in skips remain skips. Original live tests and paired corpus were inspected and hash-verified, not rerun or added to these fresh totals.

The browser sent three reset attempts (lost response, injected 401, successful retry) with one identical command body and one native reset receipt. Reload restored the pending request; transient authentication failure retained it; final acknowledgement cleared it. Compression noop likewise survived a lost response and reload with two attempts sharing one command ID. There was one durable product command per operation and no additional native mutation after the reset. All three product messages remained byte-equivalent, logical identity stayed stable, and the UI remained connected. The noop path does not claim a new live-model summarization run; actual long-history compression remains covered by the fresh engine suite and historical authenticated live evidence.

Only owned disposable browser/API/gateway/Vite resources and the temporary dependency symlink were stopped/removed. The original partition, credentials and unrelated `docs/agent.pen` were not changed. The reviewed changes remain local and uncommitted.
