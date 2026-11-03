# Initial-actor routing and fallback recovery

User-authorized follow-up to NMA-056, 3 November 2026. The local backend is running contract **1.26.0** with Jev and the verified Homebrew Codex **0.166.0** executable. This supersedes the captured contract 1.25.0 activation in `../conversation-latency/`. Historical evidence and manifests remain unchanged. Final checks and activation are recorded in `checks.json` and `activation.json`.

## Behavior

- Jev chooses the **first actor** requested by the user. For `skinny suruh tobi say hi ke aku`, Skinny receives the task and its harness delegates to Tobi. Jev does not execute the task or choose credentials, billing, tools or grants.
- The versioned `initial-actor-v2` policy prioritizes the latest addressee, recognizes unique shortened names, distinguishes downstream recipients, handles negation and quotations, and uses relevant shared work for follow-ups. Colliding nicknames are not invented.
- Classification uses bounded shared evidence: the latest request, group instructions, all candidates with compact responsibilities, six recent messages, four active-work summaries and attachment metadata. Agent UUIDs and message UUIDs are replaced by stable per-request member keys. Private DM history and native sessions are excluded.
- A single Choice judgment is the default. The experimental batch adds routing-kind and recipient-resolvability judgments in the same call; it remains available for evaluation. Selection requires confidence at least 0.5, top probability at least 0.65 and a margin at least 0.15. Batch also requires recipient resolvability at least 0.75. These guards were not relaxed to improve the evaluation score.
- A decision records the policy version, variant, application-request SHA-256, probabilities, confidence, input tokens, latency and acceptance reason. The existing 1.5-second deadline, zero SDK retries, concurrency limit, persisted attempt fencing and one member-model fallback remain in place. Dispatch still rechecks current membership, capabilities, grants, access and assignment revisions.
- One executable resolver now serves the broker, account flows and readiness API. It pins the selected path, coalesces probes, caches positive/negative results for 30/2 seconds, and invalidates the cache when the executable changes. A previously missing configured executable can become available without restarting the backend.
- Undispatched blocked preparation resumes the same run after a relevant configuration or executable change. Public group snapshots project the hidden fallback run's stage and diagnostic, while events correlate its updates to the parent conversation. The group shows the cause and an exact-run preparation retry. Unknown native outcomes show reconciliation state and expose no preparation retry.
- DM prewarming, warm-session reuse, event-driven dispatch/SSE, coalesced UI updates and ordinary `continuation=complete` handoffs from the first amendment remain active. A cold model response can still take several seconds; preparation and provider generation are measured separately.

## Why the original message stalled

The old prompt blurred the initial actor and final speaker. Its top probability of 0.44 across three choices produced normalized confidence `(0.44 - 1/3) / (1 - 1/3) = 0.16`, triggering fallback. That score measures candidate separation; it is not a probability of understanding the user's request.

The actual backend then selected `/opt/homebrew/bin/codex` 0.136.0, below the required 0.165.0, while earlier native verification had selected a different 0.166.0 installation. Readiness reported registered executors without exposing this version mismatch. The fallback stayed queued and blocked in a private routing thread, whose diagnostic did not reach the group. The device's Homebrew installation has been updated to **0.166.0**. The resolver and public projection now address those integration gaps.

The original user run was retried only after confirming it had never been dispatched and had no native IDs. Its Skinny-to-Tobi handoff completed. New verification uses isolated synthetic sessions and sends no further test messages into the user's group.

## Evaluation

`evaluation.json` contains **220 cases per variant**, with 50 calibration and 170 held-out cases. The corpus includes direct requests, delegation, follow-ups, role selection, negation, absent recipients, empty roles and Indonesian/mixed-language phrasing. It uses four name cohorts sharing 50 templates plus 20 novel formulations. The held-out portion therefore includes reused templates with different names; this is not 220 independent natural conversations or a production accuracy estimate. That subset also informed the variant comparison, so it is not an independent final validation set. The dataset SHA-256 matches the current reproducible generator.

| Variant | Expected choices | Accepted / correct | Fallback | Clear requests falling back | p50 / p95 |
| --- | --- | --- | --- | --- | --- |
| Single, selected default | 220/220 | 197/197 | 23 | 1/198 | 250/308 ms |
| Batch, evaluation only | 220/220 | 112/112 | 108 | 86/198 | 251/297 ms |
| Single, held-out subset | 170/170 | 152/152 | 18 | 1/153 | 249/308 ms |

Both variants identified all expected choices, including 22 absent-recipient cases that correctly produced unresolved. Batch's extra resolvability guard rejected many otherwise clear requests. The single judgment provides better accepted coverage in this cohort, with no accepted wrong selection observed. There were zero service errors in the 440 calls. Confidence values are retained as model outputs, not relabeled as calibrated correctness probabilities.

## Verification and proof boundaries

- Backend: **341 passing tests**, including blocked-fallback visibility, private-input redaction, parent-conversation event correlation, executable repair, missing-executable discovery, probe coalescing and unknown-native fencing.
- HTTP/SQLite: contract **1.26.0**, 94 declared operations; exact DM and hidden-router retries preserve the original input, repeat idempotent commands add zero events, and readiness exposes actual harness availability.
- New browser coverage: **6 passing checks** across desktop/mobile for blocked cause and retry, executable repair without a new message or classifier call, reload without duplication, and unknown-native reconciliation.
- Web unit: **18 passing tests**, including event correlation and the existing avatar corpus. Conversation regression passed **48/48** and workspace regression passed **62/62**, across desktop/mobile. With the six new checks, **116 browser checks** passed.
- Native verification passed **10/10 runs** covering Codex cold/warm/prepared DMs, Muse cold/warm DMs, Jev-to-native routing, Codex-to-Muse complete handoff and the original Skinny-to-Tobi wording. Codex uses subscription authentication; Muse uses an explicitly selected API key. Muse subscription acceptance is not claimed.
- Native verification opens the source database read-only and copies credentials only into isolated temporary contexts. Cleanup waits for settlement. Earlier cohorts, failures and their cleanup state remain in the evidence folder. One fixture initially emitted extra fields on a strict text event; another assertion initially omitted the valid Indonesian greeting `Hai`. Both fixture issues were corrected without changing native outcome handling or replaying unknown work.
- The local activation has a private consistent SQLite backup; all **175 existing message/artifact/Goal/Routine records** remained byte-identical, with zero active or unknown runs before and after restart. Readiness proves foundation/version state; authenticated inference is demonstrated separately by the isolated native cohort. Neither proves a production latency SLO. The local default Muse executable is honestly reported missing; the isolated Muse proof explicitly selected `.dev/nma050/muse` and did not change local billing or install configuration.

In the final native sample, the original Skinny request selected its first actor at confidence **0.98** in **307 ms**, created no native router run and completed with Tobi's greeting and zero coordinator continuation. Cold Codex preparation took 3,093 ms, warm preparation 6 ms, and preparation after warming another DM 15 ms. That prewarm took 1,244 ms and added zero inference runs. Total cold/warm/prepared responses took 7,695/2,444/3,684 ms: provider generation remains a separate, variable part of the response time. These are individual local observations, not percentiles.

## Reproduction and provenance

From the repository root:

```sh
bun --env-file=.env scripts/verification/jev-routing-v2/api.ts
bun --env-file=.env scripts/verification/jev-routing-v2/evaluate.ts
bun --env-file=.env scripts/verification/jev-routing-v2/native.ts
```

Evaluation makes 440 classification calls by default. The native cohort requires the existing Codex subscription source and an explicitly supplied Muse API key. It does not switch the user's billing selection. The default proof executable is `/opt/homebrew/bin/codex`; `NGERTIIN_CODEX_EXECUTABLE` and `NGERTIIN_MUSE_EXECUTABLE` can explicitly configure backend executable paths through the process or root environment.

From `apps/server`, run lint, typecheck and `bun test tests`. From `apps/web-client`, run lint, build, `bun test verification`, and Playwright with `playwright.jev.config.ts`, `playwright.conversation.config.ts` and `playwright.work.config.ts`. The new UI fixture uses the real API, SQLite, lifecycle, resolver and broker with model/protocol outcomes stubbed. The workspace suite also exercises the real managed browser/VNC. The existing large JavaScript chunk warning remains.

Integration base: `418b54f6c7829e0edcd4c311ed81d9f5c810b4e5`. This amendment extends the existing local harness-first modules; it imports no additional Openbot application module. TypeSafe remains the exact official **@typesafe-ai/sdk 0.6.0**, model **jev-1.14.0**, on **Bun 1.3.10**. The first amendment documents why SDK 0.7.0 was rejected on this Bun runtime. Any upgrade requires typed-response and deadline/error regression proof.

Independent color-studio/router/theme work and other unrelated files remain untouched. Source fingerprints and `SHA256SUMS` bind the final integration and new evidence. No reset, commit or push is part of this amendment.

The accepted amendment is recorded on [NMA-056](https://app.notion.com/p/409abdd61873813285faf568d52394bc), with final API and UI deltas on NMA-060, NMA-061 and NMA-062. The routing-flow reference also records the first-actor and recovery semantics.
