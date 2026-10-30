# Muse SDK/MSP adapter verification

[NMA-050](https://app.notion.com/p/409abdd6187381399191ffae63c495ec), verified on 2026-10-31 (Asia/Makassar). NMA-048 was verified Done in live Notion before implementation. Status remains **In Progress**: the user has Muse developer credits, without a subscription available for this task. Native interactive permission-decision acceptance also remains open. No commit, push, deployment, UI changes or data reset was performed.

See [adapter documentation](../../architecture/muse-adapter.md) and [provenance](provenance.json). The implementation uses the official SDK 1.4.14 and native Muse Code 1.4.14-R7309.1 on macOS ARM64, Bun 1.3.10, TypeScript 7.0.2, Elysia 1.4.30 and Zod 4.4.3. The ticket's exact SDK source commit contains 1.4.14; the earlier 1.4.12 foundation probe is historical. The official CLI artifact was SHA-256 verified and placed only under ignored `.dev/nma050/`; no global installer, shell-profile modification or credential import was used.

## Final checks

| Check | Result | Evidence |
| --- | --- | --- |
| Server lint | Pass, 0 warnings | `lint.log` |
| Server typecheck | Pass | `typecheck.log` |
| Server tests | **84/84 pass, 0 fail, 0 skip**, 299 assertions | `tests.log` |
| Foundation process/HTTP regression | **8/8 pass** | `foundation-regression.json` |
| Broker process/HTTP regression | **5/5 pass** | `broker-http-regression.json` |
| Native final cohort | **7 runs: 6 succeeded, 1 cancelled with confirmation** | Files below |
| Native subscription login/request/tool | **0 attempted; unavailable**, remains open | User clarification and `verification.json` |
| Native interactive permission decision | **0 attempted; unverified**, remains open | Deterministic fixture is separate |

The server suite includes 16 Muse tests exercising the official SDK against a child-process MSP fixture and the actual application HTTP MCP endpoint. It covers transport metadata, exact DM/group resume, explicit key mode, stored-key shadowing, login-required and device-login contract, steer, cancellation versus acknowledgement-only stop, grant revocation, native questions and stage-bound permission choices, provider rejection, partial output, process loss, gaps and unknown terminals. Fixtures perform no native model inference or subscription billing.

## Native HTTP setup and results

The isolated backend used:

```sh
PATH="$PWD/.dev/nma050:$PATH" NGERTIIN_STATE_DIR=.dev/nma050/state NGERTIIN_PORT=63980 bun apps/server/src/main.ts
bun scripts/verification/nma050/native.ts http://127.0.0.1:63980 .dev/nma050/state initial
# Stop and restart the backend, retaining its state directory.
bun scripts/verification/nma050/native.ts http://127.0.0.1:63980 .dev/nma050/state resume
bun scripts/verification/nma050/native.ts http://127.0.0.1:63980 .dev/nma050/state controls
bun scripts/verification/nma050/native.ts http://127.0.0.1:63980 .dev/nma050/state question
# Restart once more with final source, then run resume again.
```

The initial phase explicitly selected `api_key` billing and provisioned the existing user-provided `MUSE_API_KEY` into a private credential-reference file. The child receives it only as the selected `META_API_KEY`; neither secret nor installation bearer appears in evidence. This is **developer-credit/API-key evidence**, not subscription proof.

- `native-initial.json`: effective key credential and catalog succeeded, with inference still `not_attempted` before prompting; five native models were discovered. Three requests completed: DM marker, a useful `ngertiin.read_run_context` call returning the actual run/thread IDs, and an independent group marker. The application recorded one native product-tool completion in `native-tool-events.jsonl`.
- `native-resume.json`: after service and owned-child restart, the exact DM native ID/binding was retained and its private marker recalled, without the group marker.
- `native-controls.json`: stop intent was stored, then the native cancelled terminal confirmed cancellation. An interrupt admission acknowledgement alone was not treated as proof of stop.
- `native-question.json`: a real native `request_user_input` question was listed and answered through authenticated `/v1/runs/:id/interactions`; the native run then completed successfully.
- `native-final-resume.json`: one more exact native resume and marker recall passed after restarting on the final source. Final cohort: initial three runs + two resume runs + question run + cancelled control run = **7/7 expected outcomes**.
- `native-observations.json`: effective billing `api_key`, separate login/discovery/inference observations, actual model catalog, capabilities, two lane bindings, version detection and two registered executors. The API gate remains pending. The generic process regressions intentionally use their own PATH; Muse may be reported missing there because the downloaded binary is not globally installed.

The native permission posture was the CLI's sandbox and native approval mode, with shell/write disabled. A live pending permission-decision cycle has not been proven; fixture approval handling must not be promoted to native acceptance. Native steer success, subscription entitlement/billing, a valid-key provider rejection, and full unknown-effect recovery beyond these probes remain unverified. UI token streaming, NMA-060, UI acceptance, installation on another host and production readiness are not claimed.

## Failed iterations retained

- `native-initial-before-fixes.json`: credential/catalog succeeded but session initialization failed with `PROTOCOL_ERROR`. Native durable model state had selected a `-contributor` default despite the requested session model. An explicit process startup `--model` plus native model read-back corrected this; contributor mode is explicit per lane. Environment/flag contributor overrides alone did not correct the startup-model mismatch.
- `native-tool-before-metadata-fix.json`: two native turns completed, but the tool turn truthfully reported a scoped-tool error; **this was not a successful tool round trip**. The native MCP client supplied additional transport metadata. Parsing now strips that metadata before forwarding only tool name/arguments, with a corresponding fixture regression; the final native round trip passed.
- A test-cleanup iteration had 15/16 Muse tests pass: a second shutdown tried to settle an already unknown acknowledgement-only run. The test now closes the owned client and drains its work before repeated cleanup. No native cancellation was fabricated.
- After adding explicit rejected/unknown billing projection, a retained broker assertion still expected login `unknown`: 83/84 tests passed. The assertion now verifies the intended rejected login with effective billing unknown; the final full suite passed 84/84.
- Initial lint invocation from the root hit the repository's existing nested Biome configuration. Checks ran successfully from `apps/server`. One untyped test variable and explicit-null assertions were corrected before final lint/typecheck.

## Reproduce checks

```sh
bun run --filter @ngertiin/server lint
bun run --filter @ngertiin/server typecheck
bun run test:server
bun scripts/verification/nma047/foundation.ts
bun scripts/verification/nma048/http.ts
shasum -a 256 -c docs/verification/nma-050/SHA256SUMS
```

The final retained suite log uses equivalent server-directory commands (`bun test tests`, `bun run lint`, `bun run typecheck`). No root web check or UI build was rerun: UI is outside this ticket and remains behind NMA-060. `SHA256SUMS` covers exact responsibility files and retained evidence, excluding itself.
