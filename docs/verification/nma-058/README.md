# Browser-use MCP and VNC verification

NMA-058 implements the backend browser session API on the existing single Ngertiin lifecycle. The clean baseline was `3b6945a233dce7a47d24e7caab892d5f7455dd8d`. Live Notion dependencies NMA-053 and NMA-054 were Done before implementation. Changes were left **uncommitted at initial verification capture**, as requested. The user subsequently authorized the local commit recorded below.

The [API/host contract](../../architecture/browser-session-api.md) describes private owner/account profiles, explicit agent/thread action grants, direct browser-use tools, fresh indexed observations, full native session/target IDs, view-only RFB WebSocket tickets, auth-required signals, stop/detach/close/reset semantics and durable unknown holds. [provenance.json](provenance.json) records the exact Openbot/browser-use source modules, hashes, local adaptations, exclusions and upgrade procedure. [browser-image.json](browser-image.json) records the tested immutable image, base digest, Python/MCP/Chromium/Xvfb/x11vnc versions and original wheel server hash. That wheel hash matches the audited upstream MCP source exactly before the local patch.

## Verification

| Level | Result |
| --- | --- |
| Final backend suite | **211/211 pass**, zero fail/skip, 1282 assertions in [backend-tests.log](backend-tests.log). Fifteen new browser checks. |
| Server lint / typecheck | Both pass: [lint.log](lint.log), [typecheck.log](typecheck.log). |
| Existing foundation HTTP/process | **8/8 pass**: [foundation.log](foundation.log). |
| Existing broker HTTP | **5/5 pass**: [broker-http.log](broker-http.log). |
| Direct MCP host smoke | **2/2 checks**, real headful navigation/state/native target and loopback RFB: [host-smoke.json](host-smoke.json). Setup about 5.44 seconds; no provider inference. |
| Application native cohort | **6/6 runs succeeded**, three each through real Codex and Muse. **40/40 durable action receipts succeeded**, zero native-cohort error/unknown. [receipts-verify.json](receipts-verify.json) is the final receipt-only accounting. |
| Browser/backend restart | Both harnesses retain the site account and localStorage without sign-in or retyping. [native-resume.json](native-resume.json) verifies original run receipts; resume runs contain no click/type. |
| Actual VNC binding | Six binary RFB framebuffer captures across start/restart/expiry. Initial MCP/VNC page pixels match **99.4686% Codex / 99.4776% Muse** after the 87-pixel browser-chrome offset: [visual-binding.json](visual-binding.json). The remaining pixels include cursor/timing/viewport differences. |
| Expiry and revocation | **Both harnesses** navigate to a revoked fixture session, observe the login page and API `auth: required`: [native-expiry.json](native-expiry.json). [auth-policy.json](auth-policy.json) verifies stale-generation resource/view rejection and previously issued ticket revocation. |
| Real action with injected lost acknowledgement | **4/4 checks**, five application browser actions, four succeeded and **one intentionally unknown**: [unknown-browser.json](unknown-browser.json). A real save click completes, its acknowledgement is dropped, state restarts/reconnects, the saved note is visible and dispatch count remains exactly one. This is an injected transport boundary, not a provider crash. |
| Receipt-only replay / isolation | Six original HTTP admission keys return their original runs without new events/inference; both foreign browser/screenshot and view scopes are denied. [receipts-verify.json](receipts-verify.json). |

The domain/HTTP/WebSocket tests additionally cover view versus action grants, removing the last grant, pre-dispatch revoke, late calls after stop, cancellation during a dispatched effect, durable unknown after restart, concurrent calls, exact-command dedup, changed-payload conflicts, stale generation/target/DOM observation, foreign tabs, local profile URL rejection, model-backed tool exclusion, callback/raw-error redaction, explicit auth signals, single-use tickets, foreign origins, viewer disconnection on grant change and persisted unknown host-control intent without implicit restart/replay.

### Native setup and useful tasks

Backend: macOS arm64, Bun `1.3.10`, TypeScript `7.0.2`, Elysia `1.4.30`, Zod `4.4.3`. Browser host: Docker Linux arm64, Python `3.12.12`, browser-use minimum/tested `0.13.14`, transitive browser-harness `0.1.13`, MCP `2.1.1`, CDP-use `1.4.5`, Chromium `156.0.8078.73`. The direct entry point is `python -m browser_use.mcp.server`; it is not ordinary browser-use CLI or CLI-MCP.

Codex CLI `0.165.0` / `gpt-6.1-sol` uses the preselected explicit ChatGPT subscription. Muse CLI `1.4.14-R7309.1` / SDK `1.4.14` / `muse-spark-1.3` uses the preselected explicit API-key/developer-credit path. Fresh billing inspections are in [native-provision.json](native-provision.json). No fallback occurred. This does **not** close Muse subscription or the broader native permission matrix from NMA-050.

A deterministic local HTTP site provides an ordinary fake-account form, persistent HttpOnly cookie, localStorage note, second tab, and server-side session revocation. No real website credentials or external business action are used. Each harness finds its granted profile, navigates, fills/submits the local form, saves the note, opens a second tab, reads actual DOM and receives a native screenshot image. Both use distinct profiles/accounts. Captures are retained as `start-{codex,muse}-{dom,vnc}.png`, `resume-…` and `expiry-…`; these are real MCP/RFB outputs, not UI mockups.

The actual browser host and backend are then closed and restarted. Both native agents navigate to `/account` and read their previous account/note without signing in or typing again. Their harness native binding IDs remain stable while browser-use reattaches to the managed profile. Website revocation later redirects `/account` to `/login`, with auth-required through the configured site policy. Unconfigured sites remain auth-unknown; no general-purpose website login detector or secure-input UI is claimed.

### Latency and denominator

The six native tasks take 55.230/30.946/30.204 seconds for Codex and 138.200/78.429/62.416 seconds for Muse (start/restart/expiry). These are durable admission-to-settlement timings and include model, setup and tool orchestration. They are distinct from the host smoke setup time and direct action latency.

For the **40 successful native-cohort action receipts**, dispatch-to-ack latency is min **40.51 ms**, p50 **101.06 ms**, p95 **811.02 ms**, max **1284.47 ms**. The timer starts after authorization/preflight, so it does not include host startup, DOM preflight, model latency or the entire user task. Read-only owner observations/preflight calls and the separate injected-fault cohort are not added to this denominator. Across the two explicitly receipted cohorts there are **45 actions: 44 succeeded, one injected unknown**. There is no claim of competitive speed, low production error rate, arbitrary-site reliability, or exactly-once external effects.

## Commands and evidence handling

```sh
bun run test:server
bun run --filter @ngertiin/server lint
bun run --filter @ngertiin/server typecheck
bun run verify:foundation
bun scripts/verification/nma048/http.ts
bun scripts/verification/nma058/host.ts
bun scripts/verification/nma058/site.ts
PATH="$PWD/.dev/nma050:$PATH" NGERTIIN_STATE_DIR=.dev/nma049-native \
  NGERTIIN_PORT=49959 bun apps/server/src/main.ts
bun scripts/verification/nma058/native.ts provision
bun scripts/verification/nma058/native.ts start
bun scripts/verification/nma058/native.ts close
# Stop/restart the same application backend; the local fixture site remains alive.
bun scripts/verification/nma058/native.ts resume
bun scripts/verification/nma058/auth-policy.ts
# Restart backend, then:
bun scripts/verification/nma058/native.ts expiry
bun scripts/verification/nma058/unknown.ts
bun scripts/verification/nma058/receipts.ts verify
bun scripts/verification/nma058/receipts.ts cleanup
```

Private proof identities and original idempotency keys remain under `.dev/nma058`. Provisioning and injected-unknown proofs must not be rerun against their existing state. Receipt verification uses original command keys, rather than creating model requests. The unknown proof deliberately retains its unresolved synthetic application run/receipt in isolated state; its browser and native client are stopped.

[iterations.json](iterations.json) retains the initial macOS-versus-Linux lock failure, empty Docker-inspect bug, old contract assertion, binary-RFB verifier correction, and a later recheck that received the correct `CONFLICT` while an expiry run owned the browser. No failure is relabeled as successful native behavior. The later start recheck reused its original admission receipt and added no inference; the final cohort is reconstructed from durable original run/action receipts and preserved captures, not a fresh task submission. The original Codex pre-correction snapshot remains in [native-start-attempt-1.json](native-start-attempt-1.json), the overlapping recheck in [native-start-recheck-after-grant.json](native-start-recheck-after-grant.json). Implementation iterations are not presented as one frozen native build: final output redaction/reconnect handling, complete-revoke and host-control-intent refinements have final domain/HTTP evidence; immutable host launch is also covered by the actual-browser unknown probe and final native expiry cohort.

## Cleanup and limits

[receipts-cleanup.json](receipts-cleanup.json) records stopped browser hosts, retained private profiles, removal of generated action grants, revocation of the task-owned Muse connection, and deletion of only its task-owned credential copy. The original Codex connection and original credentials are preserved. All task browser containers, application verification server, native clients and fixture HTTP server were stopped. There are zero active provider proof runs/goals/Routines. The initial verification included no user data reset, UI edit, installer, commit, push or deployment.

The browser contract currently offers view-only VNC, direct indexed input, navigation, state/screenshots, explicit tabs and scroll/back. Frames and unsolicited popups remain unknown; local-path upload, arbitrary evaluation, full-page capture, model-backed extraction, autonomous browser Agent, general desktop/native clients, remote/multi-host and cloud browser are not enabled. An unknown native effect stays held where browser-use has no authoritative effect receipt; page observation alone does not turn that historical outcome into success.

This closes the selected backend acceptance boundary. It does not close API-wide readiness NMA-060, UI, installer, VPS or production acceptance. The [Notion ticket](https://app.notion.com/p/409abdd61873812daf0cc500aa15aab3) is updated separately with the actual status and these evidence limits.

## Local commit delivery

The user authorized a local commit on 2026-10-31. This delivery groups the browser implementation, native tool image handling, host configuration, regression checks, API documentation and byte-preserved evidence in one responsibility-based commit: `feat(browser): add scoped sessions and VNC gateway`.

All 91 original manifest entries were verified before preparing this delivery. Only this README and its manifest entry changed; implementation, tests and raw evidence retain their verified bytes. The manifest covers 91 content files, and the commit includes those files plus the manifest itself.

Tests and native inference were not rerun for the commit operation because implementation bytes are unchanged. The retained 211/211 backend tests, lint/typecheck, 8/8 foundation checks, 5/5 broker checks and 6/6 native runs apply within the limits above. Exact raw-log whitespace exemptions remain in [hygiene.json](hygiene.json), with their hashes verified. The `commit_created: false` value in verification.json describes the original verification capture. This is a local commit delivery without a push or deployment.
