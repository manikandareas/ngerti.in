# Runtime/session/recovery evidence

Primary report: [implementation and acceptance](../../nma-029-runtime-session-recovery.md). Ticket source: [live Notion capture](notion-source.md). Completed live protocol: [protocol-v2.json](protocol-v2.json), [results](v2-results.json). Final machine-readable verification and artifact hashes are recorded in `verification.json`.

## Evidence interpretation

- Engine suites launch the exact pinned Hermes gateway; the controlled HTTP provider provides deterministic tool/history/fault oracles. Live model smoke is reported separately.
- `backend-delivery.log` uses actual counted HTTP effects with a fixture actuator, plus authenticated transport contract tests. Fixture dependency overrides in these unit tests do not replace the actual Clerk/production-auth application smoke.
- `auth-proof.json` comes from real ClerkJS verification by production `current_account` against disposable PostgreSQL. Only identity 0 acquired a real browser JWT. The signed adapter principal is an internal gateway fixture, not a second authenticated browser identity.
- `*-final*.log`, `engine-suite.log` and `engine-complete.log` preserve failed development attempts as well as successful checks. A failed attempt never counts as a pass. The manifest names the final result and explains corrections.
- Live JSONL retains every attempted cell and raw oracle score. Derived adjudication, if needed, does not change raw attempts. Direct, adapter and application denominators stay separate. The frozen protocol contains release thresholds, but this smoke does not establish the NMA-039 release SLO.
- UI uses the existing Brave browser, production conversation components and actual JWT/production API. Its Vite fixture replaces router/auth hook plumbing only; it does not stub engine/model responses.
- All migration, backup/restore, tool dispatch and authentication fixtures are disposable. Original account data and running production partition are not migrated. Secrets, JWTs and private fixture state are excluded.

## Final evidence index

- `engine-delivered.log` and `delivered-source.json`: full regression after the two context-control corrections found in Brave. Earlier 164/166-pass frozen candidates retain separate source manifests.
- `live-regressions.log`, `live-goal-lifecycle.json`, `live-group.json`, `live-wake.json`: four actual Luna regressions, including autonomous goals, shared group work and offline scheduled continuation.
- `v2-{direct,adapter,application}.jsonl`: all 81 attempted cells. Raw 61 successes/11 failures/9 stops; six permitted label reviews produce 67 successes/5 failures/9 stops. No failed browser case is hidden.
- `v2-results.json` and `corpus-effect-denominators.json`: separate surface/metric denominators, unknown receipts and limitations; three repetitions do not establish release SLOs.
- `ui-context-evidence.json`, `brave-*.jpg`: real Brave compression/reset, retained DM history and per-agent group isolation. `authenticated-isolation.json` uses production Clerk verification.
- `v2-application.api-restart.json`: actual API restart during native work, preserving admission/session identity.
- `code-admission-delivery.log`, `native-effect-faults.json`, `backend-delivery.log`: counted external effects, pre-dispatch repair, actual lost ACK and receipt replay.
- `check-final.log`, `build-final.log`, `provisioning.log`: static/build and disposable database gates.
- `cleanup.json`, `secret-scan.json`: owned resource removal and no matches for the configured credentials checked. Journals retain unknown states after their physical containers are removed.

## Corrections retained

Early suite failures exposed outdated expectations: an ambiguous connector mutation must remain unknown, and a new config binding must retain authorized native history. A schema-migration fixture raced derived transcript projection; it now reconciles the projection before taking its baseline. Compression fixtures initially reported fixed low token usage, then used trailing whitespace that native persistence normalized and invalidated usage anchors. The final oracle uses normalized input, adequate removable assistant context, and separate native automatic/micro-compaction settings. Native refused `would_grow` attempts are evidence of conservative compression, not proof of successful compaction.
