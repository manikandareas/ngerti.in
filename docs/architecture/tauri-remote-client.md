# Tauri account client

[NMA-081](../backlog/NMA-081.md) implements remote sessions in the existing macOS ARM64 Tauri host and shared web-client. The [authentication contract](user-authentication.md) defines the server's native OAuth protocol. The [verification report](../development/history.md#verification-archive--2026-11-17 "Archive: docs/verification/nma-081/README.md at 043f7c9") owns executed results and remaining acceptance conditions.

## Profiles and server identity

`profile.json` version 2 selects exactly one account-authenticated `serverOrigin`, manager UUID, private UI port and UI source root. There is no client/auth mode selector or backend environment/state/provider configuration. Release builds require HTTPS; debug builds additionally support canonical IPv4 loopback HTTP. Existing profiles are preserved; use a separate directory for the new client. `bun dev` uses `.dev/development-client`.

```sh
NGERTIIN_DESKTOP_HOME="/absolute/private/account-profile" bun run setup:desktop -- --server https://ngertiin.example.com
NGERTIIN_DESKTOP_HOME="/absolute/private/account-profile" bun run dev:desktop
```

Server/profile changes preserve private projection and Keychain boundaries. Browser organization choice remains tab-local; native choice is profile-local and server/user-keyed. Logout clears that identity's private UI state.

An operator-selected private CA is supported through `--certificate /absolute/path/to/public-ca.pem`. This adds the selected certificate to native TLS trust; it does not disable certificate or hostname validation and does not modify OS trust. The external system browser must independently trust that server. Ordinary public HTTPS needs no certificate option.

An optional `--invitation https://ngertiin.example.com/invitations/<uuid>` selects a validated initial invitation route on that exact server. Credentials, fragments, queries and another origin are rejected. Login returns to the existing invitation review UI. This implements invitation handoff; a custom OS URL-scheme registration is not introduced.

## Native authentication

1. Native code fetches `/v1/auth/native` over certificate-validated HTTPS and validates the exact issuer, audience, client identifier, authorization/token endpoints and IPv4 loopback callback.
2. A sign-in action creates independent 32-byte OS-random state and verifier values, an S256 challenge and a five-minute deadline. It binds the configured callback port before opening the system browser. A busy callback port is an actionable failure; the client never silently changes the registered redirect.
3. The listener accepts one matching callback with the expected Host/path, unique code/state/issuer fields, constant-time state comparison and no error/fragment/credentials. Invalid requests cannot consume a valid flow. The listener closes after success, cancellation or deadline.
4. Native code exchanges the code and verifier on the selected origin. The rotating renewal credential goes into macOS Keychain through pinned `security-framework` 3.7.0; access tokens remain in native memory. Neither token nor the verifier is returned to WebView JavaScript. Provider credentials remain server-owned.
5. A single native state lock coordinates restoration and renewal before token expiry. The rotated renewal credential is saved before its access token is published. The Keychain account includes the profile manager and exact server origin. Other platforms fail closed until they have an accepted secure-store backend; there is no plaintext credential fallback.

Transient transport failures retain renewal credentials and return a recoverable API failure. A server-rejected renewal clears the credential and requires sign-in. An access rejection discards only the matching access generation before the next renewal check. Viewer-ticket rejection does not log out the account. No mutating request is automatically replayed by the native gateway.

## Gateway and media

The renderer uses the existing narrow loopback gateway. Its Host, local Origin, fetch-site and relative-path checks run before any credential is attached. Encoded separators/traversal, absolute-form targets and redirects cannot change the selected destination. Renderer Authorization, cookies and forwarding/control credentials are removed. The gateway supplies the selected native access token and the selected server Origin; the server retains its own origin and authorization checks. Remote token-exchange routes are not exposed to the renderer, and remote API cookies are not installed into WebKit.

Authenticated REST, SSE, files and uploads stream through the gateway. Error bodies remain readable when a session stream is cancelled. Logout and application exit close this client's streams; server-side revocation continues to fence every scoped stream and media session.

Contract **2.2.0** adds the issuing-session authenticated WebSocket route `/v1/machine/viewer/:viewerId/media`. Account-mode `StreamService/OpenMedia` returns `media?ticket=...`, resolved against that viewer's opaque API base. The pinned viewer resolves paths after removing a leading slash, so an origin-relative duplicated API path is incorrect. The gateway upgrades only the expected opaque media route, uses the same selected HTTPS/TLS client for its upstream handshake, and carries media over that connection. Native OAuth tokens never enter WebSocket query strings. Legacy local viewers retain their historical loopback media path.

The outer account HTTP server owns the WebSocket upgrade. Both upgrade and subsequent media operations validate the issuing device/viewer lease; member removal, session revocation, ticket expiry and control revision changes continue to close media. Viewer collectors run outside the first opening request context, so an expired or revoked creator cannot invalidate a later authorized login; each ticket still checks its own issuing session. NMA-082 must configure deployed HTTPS/WSS proxy upgrades and limits; local TLS development proof does not establish that deployment.

## Lifecycle and retained work

The client never reads backend environment/installation credentials, supervises processes, starts a Cua machine or runs a local recovery loop. `bun dev` owns its local server/Vite processes separately; the account protocol is identical for development and deployed servers.

| Action | Client effect | Server effect |
| --- | --- | --- |
| Close/hide/minimize | Hand back this client's viewers and its exact eligible human-input revision | Durable work and other devices continue |
| Reload | Revoke retained viewer tickets; preserve scoped drafts and pending operation identities | No backend/harness shutdown |
| Quit | Hand back viewers/input, close streams and discard in-memory access | Renewal remains in Keychain for relaunch; responsibilities continue |
| Logout | Revoke this native device, close streams/viewers, clear its Keychain credential and private UI storage | Other devices and durable responsibilities remain independent |
| Reconnect/retry | Renew native transport when eligible; preserve the original scoped command identity | No automatic local fallback or blind mutation replay |

Viewer registration carries the native presentation generation. A late response from a hidden/reloaded presentation is revoked instead of retained. Human-input release checks the exact organization and lease revision so it cannot hand back a newer consumer's control. Exit bounds best-effort remote cleanup to five seconds; an unavailable server or an OS credential interaction cannot indefinitely hold Quit. Server-side ticket/input expiry remains authoritative when cleanup cannot reach the server.

Fresh-device distribution, signing/notarization, other OS backends, central deployment and integrated multi-organization acceptance remain their separate milestones.
