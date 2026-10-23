# Computer workflow v2 — implementation and acceptance

Implementation of the [final plan](computer-use-final-implementation-plan-2026-10-23.md), in the existing dirty checkout. No commit, push, deployment, production database migration, or Notion status change is included. The rollout gate is not yet complete.

## Delivered

- Versioned supervisor selected by the immutable Task computer policy. Jev remains the DOM actor; explicit act/done/blocked/human decisions, bounded screenshot fallback, persistent progress and evidence, and loop guards are implemented.
- Actual runtime capability records include interpreter, Harness, Chrome, generation and template. Unsupported retained runtimes stop with an upgrade-required state. Maintenance acquires an exclusive owner-scoped lease with compute admission, pinned installation, atomic interpreter selection, rollback pointer, pause/cold-resume validation and confirmed stop. New templates use the same installer.
- Target reconciliation records the pre-input target set and selects a unique causal popup, with URL stabilization and document readiness. Ambiguous popups block. Human handback explicitly selects the focused page.
- Original visible excerpts and source metadata survive worker attempts. Bounded synthesis and a separate verifier use evidence references and exact-quote checks. Candidate bytes are staged before verification; promotion/publication checks revision, hash and verdict. Failed candidates remain inspectable. Exhausted/failed finalization produces a clearly labeled partial evidence artifact when possible.
- Exploration reserves capacity for synthesis and verification. Model costs record browser decision/text/vision/synthesis/verifier roles. Existing allowance admission remains enforced.
- Approvals persist observed target context, payload hash, task revision and browser generation. Changed page/form payloads invalidate approval. Dispatch journals persist acceptance before input and retrieve lost acknowledgments without resending. An input acknowledgment is not a verified external effect.
- Structural privacy gates run before screenshot/DOM/input and after screenshot capture. DOM privacy and extraction share a JavaScript turn. Visible credential fields, file inputs, visible frames and sensitive shadow-root inputs require human takeover. This conservative frame policy intentionally escalates some otherwise ordinary embedded content.
- VNC reconnect uses bounded backoff, fresh owner-authenticated grants, current epoch validation and explicit old-channel revocation. Grant renewal does not grant control or extend the compute deadline. Approval cards show bounded observed form previews and offer takeover. Closing a viewer does not stop the Task.
- Migration `0020_computer_workflow` adds evidence/candidates, capability/decision/outcome metadata and model-call roles; output uniqueness allows distinct immutable candidate revisions. This migration explicitly rejects downgrade to preserve evidence and candidate revisions; runtime rollback disables admission without downgrading the schema.

## Local activation

1. Apply the existing migration chain through `0020_computer_workflow` with the normal project migration command.
2. Set `COMPUTER_WORKFLOW_VERSION=2` and `COMPUTER_ENGINE=jev` for the canary API/worker environment. Restart those processes to reload settings.
3. Create a new browser Task. Existing Task snapshots retain their original version; do not rewrite active Task policies.
4. Use the upgrade action only on an upgrade-blocked, stopped, unowned retained workspace. Normal compute caps and maximum sessions apply. No reset of the stored profile is required.

The default remains version 1 pending acceptance. Disabling new v2 admission does not automatically rewrite or replay v2 Tasks. No production resources were upgraded by these probes.

## Verification

- Disposable integration suites: computer-v2 **21**, computer **51**, browser-runtime **14**, permissions **34**, tasks **56**, files **47**, quotas **46** contracts passed. Total **269**. These use controlled I/O where stated; they are not 269 live website tasks.
- Chromium structural privacy probe: **8** scenarios passed. Reproduce with `uv run --project apps/backend python scripts/probe_computer_privacy.py` (requires `agent-browser`).
- Real E2B + Jev multi-source probe read three synthetic sources across causal new tabs, stored three source URLs, recorded Jev decisions plus separate synthesis/verifier calls, and delivered a verified report. The HTML contents are explicitly synthetic, injected at example-domain URLs; this does not establish real-world research accuracy.
- Real E2B/Jev approval regression: **7** scenarios passed, including private takeover, routine search, exact mutation approval, verified result and cleanup. See [live approval evidence](evidence/computer-v2/jev-approval.json).
- `make check`, `make build`, `make docs-check`, and whitespace checks passed during implementation. `make computer-v2-inspect` and `make computer-v2-probe` provide repeatable entry points; the latter makes paid E2B/model calls and deletes its disposable resources.
- Local application browser walkthrough reached Clerk login in an isolated session. Authenticated VNC reconnection/mobile interaction was not observed in that session.

Committed-location evidence: [contracts](evidence/computer-v2/contracts.json), [privacy](evidence/computer-v2/privacy.json). [Live Jev and maintenance](evidence/computer-v2/live.json): six checks passed, including retained-runtime upgrade, filesystem pause/cold resume and resource deletion.

## Remaining rollout gates and limits

- The planned **30 supported tasks × 3 repetitions, at least 90% verified completion** pilot has not been run. No latency/cost superiority claim or production-ready claim follows from the synthetic probes.
- Authenticated UI acceptance still needs the VNC 300-second expiry, network interruption, two-tab channel handoff, mobile input and Stop walkthroughs. Backend authorization/RFB contracts do not replace those walkthroughs.
- Research evidence covers observed viewport excerpts, not complete articles. Reconciliation uses bounded polling/readiness, not a general model of every site's asynchronous navigation. Very late popups, native dialogs and ambiguous target closure remain escalation cases.
- Privacy is structural and conservative, not a guarantee of detecting arbitrary secrets in rendered prose or unrelated native windows. Native applications and arbitrary closed shadow trees are outside the supported DOM acceptance corpus.
- Approval previews are bounded form context. Generic sites without enough trustworthy effect context can require takeover; semantic postconditions for every third-party mutation are not implemented.
- Approval waiting retains the existing finite session deadline. A separate idle-pause/resume UX preserving pending intent across generations is not yet implemented; expiration never approves or replays an effect.
- Full crash/fault matrix, maintenance rollback fault injection/profile sentinel tests, external-service tests and p50/p95 instrumentation remain rollout work. Keep v2 opt-in until those gates are satisfied.

## Local testing activation

At the user's request, the local `ngertiin` database on localhost:5433 was migrated from `0019_browser_continuation` to `0020_computer_workflow`. `.env`, `.env.example`, and the configuration default now select workflow 2; the engine remains Jev with `jev-1.13.0`. The earlier opt-in/default-1 description above records the initial implementation state and is superseded for local testing. API, worker and frontend were restarted. Existing Task snapshots retain their versions. This activation does not establish the remaining production acceptance gates.

Configuration now parses numeric version values from environment strings while enforcing the range 1–2. Versions 1 and 2 were checked as accepted; 0 and 3 were rejected.
