# Shared persistent Linux machine

Implemented on 2026-11-04 after the user's approval. One retained local machine belongs to the installation/owner; every agent's browser, terminal and working-file tools use it. Ngertiin still owns lifecycle, queues, scope, receipts and recovery. Codex/Muse retain their inner loops. Remote/VPS attachment, multiple-machine selection and a distributed installer remain future work.

## Run locally

On the tested macOS ARM64 host, with Bun 1.3.10 and Docker running:

```sh
bun install
bun run setup
bun run setup:machine
bun run import:machine
bun run dev:api
```

In another terminal:

```sh
bun run dev:web-client
```

If Muse is not on PATH, set `NGERTIIN_MUSE_EXECUTABLE` to its installed binary before starting the API. The local verification used the retained `.dev/nma050/muse`; this is not an automatic installation.

Open http://127.0.0.1:3001. In a conversation, open Details → Computer → Open shared desktop. The viewer starts read-only. **Take control** pauses conflicting agent mouse/keyboard input; **Return control** revokes the activation stream and restores viewing. Independent terminal work continues. Closing an interactive viewer releases control; a disconnected tab expires after 60 seconds without a live interactive media connection. An unknown input/media outcome requires **Reconnect control**, then a fresh agent observation.

Library → **Working files** lists the live shared machine root, including `inputs`, `downloads`, `projects` and explicit `imports/<old-workspace-id>`. Saved artifacts remain immutable conversation-linked snapshots; editing a working file cannot change a previously published download. Attachment working copies are shared on the machine. Private transcripts, memory, native sessions, provider credentials and artifact storage stay on the backend host.

`setup:machine` creates private `machine.json`/`machine.env` under `NGERTIIN_STATE_DIR` (default `.dev/harness-first`). Keep both private. It starts/attaches the retained compose project and home volume; no host repo, home, provider state or Docker socket is mounted. `import:machine` explicitly copies bounded, permitted managed legacy files into named directories, verifies hashes and keeps host sources. External project directories are skipped for a separate explicit import. This implementation imported 335 files; the private manifest is `.dev/harness-first/machine-import.json`.

Backend stop detaches clients and viewers; it does not stop the machine. Use the installation's compose project for deliberate machine administration. Do not use `down -v` as a routine shutdown. Container stop/start retains the writable OS layer and home; recreation is a different operation and does not preserve OS packages installed outside retained volumes. Running jobs are not promised to survive a machine reboot.

## Versions and provenance

- Bun 1.3.10; `@trycua/cua` 0.10.1; `@bufbuild/protobuf` 2.15.0.
- Pinned full Linux image: `ghcr.io/trycua/linux:24.04@sha256:9ac0d6f6f7dd95392554ec95163f83c5061de3db05b64977696c78d71cd4861c`.
- Actual ARM64 service: spacesd 0.8.0; Driver tool contract `1`. SDK, image and service versions are independent.
- Reviewed source: Cua `33db0d554751b5f8b816d9c7deb7449d84278346`; [research/source paths](../../research/agent-desktop-machine-options-2026-11-03.md#2026-11-04-cua-source-and-compatibility-addendum), [plan](../../architecture/shared-machine-cua-plan-2026-11-04.md), and generated viewer [provenance/license](../../../apps/server/src/machines/protocol/UPSTREAM.md).
- Contract 1.29.0 replaces browser-use routes/tools in the production machine runtime. The legacy browser backend remains reachable only in explicit no-machine historical test fixtures. Its UI and noVNC dependency were removed. There is no automatic runtime fallback.

The stock Cua account has passwordless sudo. This dedicated cooperative OS uses explicitly acknowledged unrestricted Driver startup because the tested bounded manifest cannot represent arbitrary desktop resources/profile attachment. Ngertiin's gateway serializes approved computer tools; it is not an adversarial isolation boundary against an agent with same-user/admin shell access. Backend-private data is outside that OS. Licensing classification is handled separately by the user; no legal acceptance is asserted here.

## Evidence and reproduction

Run from the repository root unless noted:

```sh
bun run test:server
bun run --filter @ngertiin/server typecheck
bun run --filter @ngertiin/server lint
bun scripts/verification/machine/compatibility.ts
bun scripts/verification/machine/native.ts
bun scripts/verification/machine/harnesses.ts
bun scripts/verification/machine/persistence.ts
bun run --filter @ngertiin/web-client test:machine
bun run --filter @ngertiin/web-client test:work
```

`harnesses.ts` uses an isolated temporary application/credential context: Codex file login copied privately from the configured local connection, and the explicitly configured Muse API key. It removes those temporary copies on exit. It never switches billing methods. No provider login or credentials are installed in the machine. The retained dedicated Muse binary under `.dev/nma050/muse` is required for this native proof; normal setup still discovers/pins installed harness executables independently.

- [Verification summary](verification.json): backend 368/368 (2310 assertions); server/web lint and typecheck passed; web production build passed with its existing large-chunk warning. Work UI regression initially passed 66/68, then both unchanged failing scenarios passed individually on fresh state (2/2). Initial deadlines and the earlier overloaded Muse fixture timeout are recorded separately; there is no claimed first-attempt clean 68/68 run.
- [Native machine/API report](native-machine.json): shared cross-agent files, immutable publication, overlapping processes, native screenshot and multimodal MCP, exact attachment to retained Chromium, real Cua iframe/media, human pointer input, upstream read-only enforcement, stale activation rejection, per-run stop isolation, backend restart and running-process reattachment/output replay. Harness identities are fixtures in this cohort.
- [Harness report](harnesses.json): two completed useful native runs. Codex 0.166.0 uses ChatGPT subscription; Muse 1.4.14-R7309.1/SDK 1.4.14 uses explicit API-key billing. Both write/read machine files and obtain the desktop through scoped product tools, with zero native host shell/file tool calls. Initial rejected schema attempts are retained in the owned proof answers; successful retries are not represented as first-attempt success. Muse subscription is unverified.
- [Live installation browser check](online.json): the retained browser attached exactly and loaded `https://example.com/`, observing the page title `Example Domain`; no provider inference or account login. Reproduce with `bun scripts/verification/machine/online.ts` while the local app is running and desktop input is idle.
- [Persistence report](persistence.json): shared file, writable OS marker and persistent cookie for an owned loopback test site survived retained-container restart. GUI startup was polled separately from service health; no external account-login claim.
- [API export](api-contract.json): actual installed machine router, schemas, tool catalog and readiness. Contract/fixture evidence is separate from native inference and UI evidence.
- Native UI: 2/2 scenarios passed (desktop 1440×1000 and mobile 390×844), covering read-only connection, takeover, native canvas input, handback, viewer renewal and live file preview. Screenshots: [desktop](ui-desktop.png), [mobile](ui-mobile.png). Both were visually inspected.

Bun 1.3.10's `Server.stop(true)` can remain pending after a fully closed WebSocket because `pendingWebSockets` stays nonzero. A framework-independent minimal reproduction confirmed this. Only viewer media uses a private loopback listener, whose sockets/listener are explicitly closed and unreferenced without awaiting that stale counter. Main HTTP/gRPC/static/file responses remain same-origin; the main API drains normally. Media URLs are rewritten using the pinned generated protobuf schema. Native shutdown/restart verification covers this workaround. This local media address is not remote viewer support.

A single post-restart idle sample observed approximately 1.9% container CPU and 433 MiB RAM on the local Docker VM; this is not a load benchmark or resource guarantee.

No production release, external-site account-login persistence, container recreation/restore, adversarial same-OS isolation or remote/VPS enrollment is claimed.

## Automatic task cleanup — contract 1.30.0

Temporary browser/GUI-terminal work now uses tracked task-owned windows through `ngertiin.machine_window`. After the entire successful task/handoff and its processes finish, Ngertiin gracefully closes temporary windows and their tabs, preserving files, artifacts and browser profile/logins. Existing windows, explicit previews and potentially human-edited windows are retained. Uncertain close outcomes and save prompts are never force-closed or blindly replayed. See [behavior, verification and limits](cleanup-2026-11-04.md) and [native receipts](cleanup-native-2026-11-04.json).

## Brave real-case check — 2026-11-04

The retained app was exercised in the user's actual Brave Browser through native computer use. In **Uji Machine · Brave 4 Nov**, Tobi opened the Python CSV documentation in the shared Linux browser, wrote four working files, and ran the analysis in the desktop terminal. Skinny read those same files and independently checked the arithmetic. Both reports were opened in Library; the downloaded summary matched the artifact hash. The result was 14 units and Rp255,000 revenue. Human takeover/handback, live CSV preview/filtering, reload persistence and reading the same files from another conversation were also observed.

This check exposed and fixed a group-opener revision mismatch and a stalled event connection after backend restart. Both have failing-before/passing-after regressions; the final Brave restart check showed a new answer without a manual reload. Final checks passed: 369 backend tests, 30 frontend tests, server/web lint and typecheck, and the web build (existing chunk-size warning).

See the [real-case report](brave-realcase-2026-11-04.json) and [check excerpts](brave-checks-2026-11-04.md). Both product agents used Codex in this cohort. Skinny checked the program and arithmetic without rerunning it. The GUI-terminal workflow does not establish headless-process concurrency; earlier native/API evidence covers that separately.
