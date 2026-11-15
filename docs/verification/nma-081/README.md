# NMA-081 Tauri remote verification

Date: 2026-11-15. Status: **Done for the bounded macOS development remote-client scope**. [Milestone](../../backlog/NMA-081.md), [implementation contract](../../architecture/tauri-remote-client.md), [API export](../../contracts/2.2.0.json).

## Implemented scope

Explicit remote/local profiles, native browser PKCE callback, macOS Keychain renewal credentials, serialized access renewal, remote REST/SSE/upload/download/viewer transport, account-mode media WebSocket upgrades, origin/path/header/redirect restrictions and client-only lifecycle cleanup. The existing NMA-080 account/organization UI and scoped request/draft/command journal are reused.

## Executed checks

| Cohort | Result |
| --- | --- |
| Current backend authentication/readiness/media | **34/34**, 811 assertions; [accepted log](backend-accepted.log) |
| Profile validation | **2/2**; [log](profile-tests.log) |
| Scoped client requests and reconnect | **12/12**, 33 assertions; [log](web-tests-accepted.log) |
| Explicit native Keychain probe | **1/1**; unique fixture entry created, updated, origin-isolated, reopened and removed; [log](keychain.log) |
| Native Rust regression | **15/15**, two explicit native probes excluded and executed separately; [accepted log](native-accepted.log) |
| Selected TLS trust and issuer | **1/1**; untrusted certificate and wrong issuer rejected, selected CA accepted; [log](native-tls.log) |
| Media session replacement | **3/3**, 21 assertions; real application-origin sockets close on revocation/member removal, and a new login survives the old login's revocation; [log](media-session-replacement-after.log) |
| API access inventory | **147 registered routes**, **144 missing-credential denials**; [matrix](api-access/authentication-matrix.json), [log](api-access.log) |
| Server/web/desktop static checks | Typecheck, lint, rustfmt and clippy pass; retained logs distinguish revisions |
| Shared web build | Pass; existing large-chunk advisory retained; [log](web-build-accepted.log) |
| Actual development Tauri bundle | Built with an isolated verification identifier; [accepted build](tauri-final-build.log) |

[Source manifest](manifest.json) and [native journeys](native-journeys.json) identify the accepted source, bundle and test boundaries. Earlier failed diagnostic iterations are retained and do not count as passing acceptance.

The full documentation checker reports eight existing broken links in three unchanged imported GPUI skill files. The bounded checker verifies their hashes against HEAD and passes the remaining repository documentation; [exclusions](docs-scoped-exclusions.json), [scoped log](docs-scoped.log), [full log](docs-check.log).

## Native development setup and observations

The actual macOS ARM64 WKWebView application uses the development build with `identifier=in.ngertiin.desktop.tauri.nma081` and `productName=Ngertiin NMA081` to distinguish it from other local bundles. Native code, gateway and the shared UI are the application implementation. The journeys use isolated ignored `.dev/nma081/client-a`, `client-b` and `client-invite` directories; the final bundle replay uses `client-final`. No installed profile or database is reset.

The HTTPS fixture runs the real API, Better Auth/OAuth Provider 1.7.23, PostgreSQL, organization/grant checks, lifecycle, receipts, SSE, uploads and scoped machine gateway. PostgreSQL is a separately labelled, loopback-bound disposable 18.1 container. A test certificate signed by the machine's existing mkcert CA is selected explicitly in the native profile; certificate validation stays enabled. No global CA trust is added by this workflow. Email delivery and model/provider inference are controlled fixtures. The native Cua lane uses separate Linux execution domains and real viewer/media/control.

Native observations include system-browser PKCE login, Keychain relaunch, eligible private connection selection, plain-text fixture task completion and SSE, native file upload/preview/download, actual decoded Cua video and human-input return, organization creation/default-agent provisioning, invitation review/acceptance, and separate server/profile/account contexts. The native organization selection survives relaunch and restores its own draft. A second server outage shows Retry/sign-in without falling back to a local backend. Closing one client and signing out another leave the server and its independent seeded browser session alive.

The file transport case uploaded and previewed the exact two-line fixture in the native UI; the 95-byte downloaded file matched SHA-256 `4d3fe8a7ae3f18ea8148d4c569f10cb7ac88958802d28a0daf688a2a365d143f`. One attachment-bearing fixture task ended `NATIVE_UNKNOWN`; that is a failed inference case, not successful file grounding. Subsequent plain-text and idempotent-command fixture tasks completed. Native/provider grounding remains separately bounded.

Corrections found through the real app were selected-origin rewriting after local gateway validation, relative media paths resolved against the opaque viewer base, readable unauthorized response bodies, separation of viewer expiry from account expiry, persistent native organization selection, and viewer collectors detached from their first request's session. The replacement-session regression fails before that final collector fix and passes afterward; [before](media-session-replacement-before.log), [after](media-session-replacement-after.log).

The final bundle replay passes login, native API/SSE/idempotency, decoded Cua video, active input return on window close, Quit/relaunch with the retained draft, and remote device revocation. Revocation returns the UI to sign-in, rejects the native API with 401, and removes the Keychain credential (metadata-only lookup exit 44); the seeded browser session remains alive. [Gateway receipt](gateway-probe-final.json), [input before close](control-before-window-close.json), [input after close](control-after-window-close.json), [server after revoke](server-after-revocation.json), [secure-store receipt](keychain-after-revocation.json).

Seven bounded journey cases pass, with zero skipped. One auxiliary attachment-inference attempt fails as described above. Earlier file/invitation/two-server/multi-organization observations preceded the final collector/exit fixes; the final replay and manifest distinguish their revisions. The final code adds session-detached viewer collectors and bounded exit without changing those UI/HTTP workflows.

## Reproduction

Generate only a disposable local server certificate using an already installed/trusted development CA; keep its private key under ignored `.dev/nma081`. Start the disposable server with its CA in `NODE_EXTRA_CA_CERTS`:

```sh
NODE_EXTRA_CA_CERTS="/absolute/path/to/existing/public-root-ca.pem" \
  NGERTIIN_NMA081_NATIVE_CUA=1 bun scripts/verification/nma081/run-native.ts

NGERTIIN_DESKTOP_HOME="$PWD/.dev/nma081/client-a" \
  bun run setup:desktop -- --remote https://127.0.0.1:44431 \
  --certificate /absolute/path/to/existing/public-root-ca.pem

bun scripts/verification/nma081/run-native.ts --checks
bun apps/desktop/scripts/cargo.ts test -j 2 native_keychain -- --ignored
bun scripts/verification/nma072/run-tests.ts tests/auth \
  tests/machines/authorization.test.ts tests/organizations/readiness.test.ts
```

The fixture control listener is loopback-only and belongs to the verification process. Its data and credential-bearing runtime/profile files remain ignored. The wrapper removes its own disposable PostgreSQL container; native fixture shutdown retires only its test execution domains and volumes.

## Limits

This is local certificate-validated HTTPS development proof. It is separate from deployed proxy/WSS/backup/restore, native provider/billing, general distribution and production capacity. Existing provider acceptance retains its original revision. No desktop-rs changes or installer acceptance are included.

Bun 1.3.10 can retain a stale WebSocket count after all observed peers have closed. Media/session revocation assertions check actual closed sockets and upstream media retirement; fixture shutdown bounds that runtime counter wait and unreferences its stopped listener. Central-server deployment/shutdown rehearsal remains NMA-082.

Two intermittent pinned authentication schema-introspection startup failures were observed in earlier backend/secondary-server attempts. The accepted unchanged authentication cohort passes 34/34; 40 sequential and 40 concurrent isolated startup probes pass. The cause is unconfirmed, production authentication initialization is unchanged, and this remains a setup/deployment limitation for NMA-082. See [failed cohort](backend-final.log), [failed startup](secondary-server.log), [sequential probe](schema-startup-before.log), [concurrent probe](schema-concurrent-before.log).

Rebuilding the unsigned development application also produced a macOS Keychain read waiting for OS interaction on one existing disposable credential. No ACL or OS protection was weakened. The final replay uses a separately named disposable profile and the same final binary for login/relaunch. Quit now bounds cleanup while credential access is waiting; secure-store persistence is proved separately from distribution/code-signing acceptance.

## Cleanup

All four named disposable Keychain accounts are removed or already absent. The native app and both fixture servers are stopped; their labelled PostgreSQL containers, the two actual Cua execution domains, networks and volumes are absent. Only named test resources were touched; installed user profiles/databases and the pre-existing trusted CA remain unchanged. [Resource receipt](cleanup.json), [credential receipt](credential-cleanup.json). The final development bundle is retained as the built artifact.

## Scoped commit verification

The [commit receipt](commit-verification.json) records an independent staged snapshot without the existing PostgreSQL cutover changes: backend 34/34, web 12/12, profile 2/2, server/web typecheck and lint, and scoped documentation pass. Native source blobs match the tested manifest. The two excluded context files are recorded separately from the captured runtime evidence. Raw terminal logs retain their original whitespace and blank EOF lines; the receipt lists the exact hash-verified exceptions. Authored source, documentation and JSON pass ordinary staged whitespace validation.
