# Browser sessions and direct MCP

Contract `1.9.0` adds backend browser resources. Codex and Muse keep their own model/tool loop. Ngertiin routes a bounded set of direct `browser_use.mcp.server` tools through its existing run-scoped product-tool gateway. The server never invokes browser-use Agent, LLM extraction, `retry_with_browser_use_agent`, CLI-MCP, Browser Harness CLI, or an extra model billing fallback.

## Host and setup

The browser runs in a backend-owned Linux container, rather than the user's personal Chrome. One managed profile is mounted at `/profile`; Chromium, Xvfb `:99`, browser-use's explicit localhost CDP connection, and x11vnc all refer to that same browser. The host mounts no workspaces, provider credential directories or Docker socket. CDP is not published. RFB is published only on backend loopback and the application provides an authenticated WebSocket gateway.

```sh
# Development prerequisite, not the local installer or a UI change.
uv pip compile --python-version 3.12 --python-platform aarch64-unknown-linux-gnu \
  --generate-hashes -o infra/browser/requirements.lock infra/browser/requirements.in
# The checked-in lock is already resolved; regenerate only for an intentional upgrade.
docker build -t ngertiin-browser:nma058 infra/browser
bun run dev:api
```

The checked-in Python lock targets Linux arm64 / Python 3.12. Browser-use minimum/tested version is exactly `0.13.14`, transitive browser-harness `0.1.13`, MCP `2.1.1`, CDP-use `1.4.5`. Tested Python `3.12.12` / Chromium `156.0.8078.73`. Other versions/platforms remain unverified. The adapter resolves the configured image tag once to an immutable image ID, launches that ID, and refuses an existing managed container with a different image. Upgrade requires a deliberate host/image transition, rather than replacing a running profile silently. The retained [provenance](../verification/nma-058/provenance.json) and [verification report](../verification/nma-058/README.md) identify source, image, system package versions and evidence limits.

`infra/browser/patch.py` adds native session/target/tab metadata and explicitly activates the native target after each direct tool action. It applies to exact source anchors and fails on drift. Profile config is explicit and has no default LLM/key. Telemetry, version probes, cloud hints and extensions are disabled. Only browser-use controls the browser; x11vnc transports pixels independently.

## Identity, grants and persistence

A `browser_profile` is an owner-managed account resource, independent of a model provider connection. It contains a name, explicit `{agent_id, thread_id, actions}` grants, a generation, and an optional auth policy. It exposes no filesystem path, cookie, credential or raw CDP endpoint. The same agent's DM and groups require separate explicit grants. A grant with `actions: false` permits scoped visual observation, without write permission. Sharing a profile means deliberately sharing that site's login; separate profiles remain separate accounts.

A `browser_session` binds one profile generation to the managed host. Browser-use reports its actual native session and full target/tab IDs. The application session persists across backend reconnect; closing/detaching/resetting rotates its generation and closes the old binding. UI clients must retain both session ID and generation and refresh after a stale-binding response. Backend restart drops in-memory leases/DOM observations and reconciles dispatched receipts as unknown; it never replays an action.

Cookies and localStorage remain in the private profile between runs and graceful browser/backend restart. Stop-run, disconnect, detach and browser-close preserve the profile. Reset is an explicit destructive operation for that one managed profile. Persistence does not promise that a website session never expires. The optional `auth_policy` provides a site origin and explicit `login_path_prefix` / `authenticated_path_prefix`. A matching login redirect produces `auth: required`; a matching account route produces `authenticated`; other pages/sites remain `unknown`. The gateway does not guess arbitrary websites' authentication from prose. Required authentication blocks indexed write actions with `BROWSER_AUTH_REQUIRED`; it still permits observation and navigation. The current VNC contract is view-only; arbitrary desktop control, secure-input/takeover UI, popups, frames and uploads are not advertised as verified capabilities.

## HTTP contract

Owner routes require the existing private installation bearer. The product MCP route accepts only the existing per-run lease, which does not authorize owner routes. No UI is implemented here.

| Method and route | Behavior |
| --- | --- |
| `GET /v1/browser/contracts` | Exact direct-tool schemas, tested/minimum version, capability states. |
| `GET /v1/browser/profiles?agent_id=…&thread_id=…` | Profiles and sessions explicitly granted to this conversation. |
| `POST /v1/browser/profiles` | Create `{name, grants, auth_policy?}`; durable `Idempotency-Key` required. |
| `POST /v1/browser/profiles/:id/grants` | `{expected_revision, profile:{name, grants, auth_policy?}}`; durable command key, revision check, generation rotation, MCP detach and viewer revocation. |
| `POST /v1/browser/profiles/:id/open` | Body `{agent_id, thread_id}`; attach/create the managed host and current session. Repeating open does not execute a model or replay a browser action. |
| `GET /v1/browser/sessions/:id?agent_id=…&thread_id=…` | Fresh native binding, indexed DOM, screenshot and `auth`; never replays writes. |
| `GET /v1/browser/sessions/:id/receipts?agent_id=…&thread_id=…` | Durable action outcomes, native identity, timing and unknown holds. No raw arguments, result images or page bytes. |
| `POST /v1/browser/sessions/:id/view` | Body scope; mint a single-use, 60-second scoped view ticket. |
| `POST /v1/browser/sessions/:id/control` | Body scope plus `operation: detach | close | reset`; rotates binding generation. Explicit repeat on an old session is stale, rather than repeating reset. |

Profile mutations use the existing revision/command/event transaction. Open is an idempotent resource attach. Asynchronous controls persist control_intent and an unknown session state before native dispatch, then settle the closed binding on acknowledgement. They are serialized and fenced, without pretending a SQL transaction can roll back a browser process effect. A lost control acknowledgement holds the profile: observations cannot restart it, and reset/close is not replayed. Unresolved process-control outcomes require operator/native-state reconciliation; the API does not invent a successful outcome. An uncertain control response is resolved by reading profile/session state, not repeating it on a new binding blindly.

### Product tools

`ngertiin.browser_sessions` returns granted profiles plus exact capability/tool schemas. `ngertiin.browser_open` takes `profile_id`. `ngertiin.browser_action` takes:

```json
{
  "command_id": "a-fresh-uuid",
  "session_id": "the-application-session-uuid",
  "generation": 1,
  "tool": "browser_get_state",
  "arguments": {"include_screenshot": true},
  "expected_target_id": null,
  "observation_id": null
}
```

The allowlist is navigate, indexed click/type, get-state, viewport screenshot, list-tabs, switch-tab, scroll and go-back. `GET /v1/browser/contracts` gives argument schemas. File/JavaScript/CDP URLs, embedded URL credentials, unknown tools and foreign tab IDs are rejected. Frames, arbitrary JavaScript evaluation, local-path uploads, full-page screenshots, autonomous retry and model-backed extraction are unavailable. Auth callback query credentials and raw upstream error details are redacted before returning tool text.

Get-state returns DOM plus a fresh `observation_id` and `expected_target_id`. Indexed click/type must supply both. Before sending input, the gateway refreshes DOM, checks its fingerprint and native target, rechecks run cancellation/authority, membership, provider/product-tool grant and browser grants, then commits an action receipt before sending the native action. A changed page/target/generation requires a fresh observation. Calls serialize per profile; concurrent operations receive `CONFLICT`. The current contract does not claim atomicity against a website mutating itself after that final observation.

Successful receipts include application/native session, target, run, profile/generation, tool, outcome and latency. Arguments are represented by a hash; credentials and typed field values are not appended to domain events. Tool DOM and screenshot content is returned to the authorized harness as MCP text/image blocks. Codex receives `inputImage`; Muse retains MCP image blocks. Screenshots are not converted to transcript text or a public workspace path.

### VNC transport

The view endpoint returns `{session_id, generation, host:"backend", display:":99", mode:"view_only", transport:"rfb_websocket", url, expires_at}`. The URL is an ephemeral bearer and must not be logged or placed in transcript. Connect once using binary WebSocket RFB 3.8 frames. The ticket is consumed even on a failed/foreign-origin attempt; it cannot be reused. The gateway checks scope/generation on every input/output and every 100 ms, and closes on revoke, expiry or shutdown. RFB handshake packets are permitted, while x11vnc enforces view-only: a view grant is not an external-action grant. Slow/disconnected readers are closed rather than buffering unbounded screenshot bytes.

The host field identifies the backend browser host. It never means the laptop desktop is available from some other backend. Browser screenshots, matching framebuffer pixels, active target and tab changes are verified separately; a CDP URL alone is not visual-session acceptance. A standalone client is provided in [rfb.ts](../../scripts/verification/nma058/rfb.ts); local native scenarios use [native.ts](../../scripts/verification/nma058/native.ts). These are verification clients, not UI code.

## Stop, recovery and errors

- Stop-run is application cancellation intent plus the existing harness stop protocol. Late browser calls are rejected. An in-flight browser action may already have happened; transport detach is not proof that it was undone or never happened.
- Detach closes MCP only and rotates the application binding; Chromium/login remain alive. Close stops the managed host and retains the profile. Reset explicitly removes only that stopped managed profile. None is implied by stopping a goal or deleting a message.
- Receipts transition `dispatched → succeeded | unknown`. Upstream errors are conservatively unknown because they may follow a partial effect. Lost acknowledgement, deadline/process loss or startup with a dispatched receipt holds unknown, without blind retry. The `error` state is reserved for future native evidence of definite nonexecution.
- Exact command retry returns the same durable receipt, without reexecuting or republishing page content. A changed payload conflicts. New mutating commands on a profile with an unresolved effect are held; owner observation and receipt reads remain available. There is no invented successful reconciliation where browser-use cannot provide an action receipt.
- Stop-requested/native-stop-confirmed are existing run states. Browser unknown outcomes remain separate, even if the harness turn later confirms stop. A later observer may inspect the real page, but that observation alone does not rewrite an unknown historical effect as success.

Errors include existing scope/stale/conflict/idempotency/control errors plus `BROWSER_UNAVAILABLE`, `BROWSER_UNKNOWN`, `BROWSER_AUTH_REQUIRED`, `BROWSER_ACTION_FAILED` and `RECONCILIATION_REQUIRED`. Failures never silently switch browser mode, provider or billing. API-wide readiness remains NMA-060; UI, installer, remote/multi-host, desktop control and production readiness are separate work.
