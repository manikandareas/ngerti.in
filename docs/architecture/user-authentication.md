# User authentication and device sessions

November 15 owner amendment: account authentication is always enabled. The mode selector, installation-bearer API path and local desktop supervisor are removed. The [current report](../development/history.md#verification-archive--2026-11-17 "Archive: docs/verification/accounts-only-2026-11-15/README.md at 043f7c9") records development defaults and verification. Earlier evidence retains its captured source/configuration; the executable account contract remains 2.2.0.

[NMA-073](../backlog/NMA-073.md) implements account authentication in the server on Bun 1.3.10, Better Auth 1.7.23, `@better-auth/oauth-provider` 1.7.23, Elysia 1.4.30 and `pg` 8.23.1. [Evidence](../development/history.md#verification-archive--2026-11-17 "Archive: docs/verification/nma-073/README.md at 043f7c9") distinguishes HTTP/PostgreSQL and headless native-client proof from product UI, real email-provider delivery and deployment.

## Web consumer — NMA-080

The web-client implements account onboarding and consumes the verified [2.1.0 contract delta](server-organizations-api.md#additive-web-consumer-delta--210). Browser credentials remain HttpOnly; private workspace reads/writes and SSE carry explicit organization context. Sign-in, invitations, password reset, browser renewal and logout retain the server's current session checks. The [NMA-080 report](../development/history.md#verification-archive--2026-11-17 "Archive: docs/verification/nma-080/README.md at 043f7c9") separates real HTTP/browser behavior from controlled delivery/provider adapters and native Cua observations.

The loopback Vite bridge forwards cookie/native-token authentication and never reads installation credentials or injects an owner bearer. Its Host/Origin/fetch-site guard runs before forwarding; upstream Origin matches the browser-visible auth origin. Tauri always uses [native account transport](tauri-remote-client.md). A missing server/session produces a connection or sign-in state, never another auth mode.

## Account and installation boundary

Authentication is mandatory at server construction and startup. APIs accept verified browser sessions or scoped native OAuth access tokens. Product-tool run leases and issuing-session viewer tickets remain narrow credentials. There is no auth-mode variable, installation-token client or uncredentialed fallback. Operator elevation remains a local CLI capability.

Organization membership, roles, grants and device status are rechecked on private operations. Workspace requests carry organization/user context with PostgreSQL RLS. Retained unbound historical records remain quarantined without blocking new organizations. Guarded data import/binding remains a separate administrative recovery boundary rather than an authentication mode.

## Configuration and schema

Use [.env.example](../../.env.example). Development defaults to `http://127.0.0.1:3001`; a missing secret is generated once at `<state>/authentication/secret` with mode 0600 inside a private directory. Email defaults to `local`, with messages under `<state>/authentication/mail`. `bun dev` starts the loopback inbox at `http://127.0.0.1:8025`; `bun run auth:inbox` runs it independently. No secret or verification link is logged. The first verified local account atomically claims the otherwise unbound initial Owner; organization permissions still apply.

Production requires canonical HTTPS, an explicit `NGERTIIN_AUTH_SECRET` of at least 32 characters and Resend sender/API credentials. Generated secrets and local inbox delivery are development-only. Development can explicitly select Resend through `NGERTIIN_AUTH_EMAIL_DELIVERY=resend`. Both strategies use the same verification/recovery/invitation callbacks; email verification is never skipped. Native callbacks remain exact IPv4 loopback addresses and auth/application schemas remain separate.

The same PostgreSQL instance hosts separate application and auth schemas. The privileged auth path uses a dedicated pool; Better Auth receives an explicit PostgreSQL dialect and `schemaName`, while internal auth SQL retains its pinned search path. The retained [SQL migration](../../apps/server/src/auth/schema.sql) and its SHA-256 are checked at startup under an auth-schema advisory lock. Schema generation is checked against the exact provider options. Tables cover Better Auth `user`, `session`, `account`, `verification`, `rateLimit`, OAuth clients/resources/resource links/access tokens/refresh tokens/consents/client assertion replay and Ngertiin owner binding/bootstrap. Password hashing is Better Auth's scrypt; OAuth tokens and bootstrap grants use explicit SHA-256 base64url lookup hashes. Browser session tokens are private Better Auth server records. Authentication tables are never domain entities/events/command receipts. NMA-075 owns application RLS and restricted tenant-query roles; the disposable test database uses a privileged fixture role.

Forwarded IP headers are deliberately not trusted. Database-backed rate limits use a shared per-path bucket when no trusted address is available: 10 sign-ins, 5 signups and 5 recovery requests per minute; the default is 60 requests/minute. NMA-082 must establish the deployed ingress/client-IP trust contract before scaling those limits. Supplying arbitrary `X-Forwarded-For` cannot reset a bucket.

## Operator-controlled first Owner

Use this procedure for production and externally delivered email. Default loopback development assigns the first verified account automatically.

1. Configure account authentication and start the backend. Register the intended account and verify its email.
2. On the server, run `bun apps/server/src/auth/operator.ts issue-owner owner@example.com`. The CLI intentionally prints a one-use secret to the operator terminal. Do not paste it into chat, logs or source control. The default expiry is 15 minutes; issuing another grant invalidates the previous one.
3. With that verified user's browser cookie or native OAuth access token, submit `POST /v1/auth/bootstrap` with `{"token":"<one-use grant>"}`. Cookie mutations require the selected origin.

The grant binds the exact normalized verified email. Public signup, a user-supplied role, installation-token authentication or a different verified account cannot claim ownership. Binding and consumption commit atomically under a row lock; expired, replayed or concurrent losing claims fail. Once bound, the CLI cannot issue another initial-owner grant. This is an installation entitlement, not implementation of organization Owner/Admin/Member roles or operator elevation.

## Web HTTP contract

The allowlisted Better Auth handler lives at `/api/auth`:

| Method and path | Behavior |
| --- | --- |
| `GET /ok` | Public compatibility/liveness response |
| `POST /sign-up/email` | `name`, `email`, `password`; sends verification, no automatic session |
| `POST /sign-in/email` | Verified email/password login; HttpOnly cookie; JSON session token removed |
| `POST /send-verification-email` | Sends a new verification link |
| `GET /verify-email` | Validates the emailed token and trusted callback |
| `POST /request-password-reset` | Requests controlled email delivery; optional same-origin `redirectTo` |
| `GET /reset-password/:token` | Validates recovery link and redirects to the same-origin reset screen |
| `POST /reset-password` | One-use `token`, `newPassword`; revokes all browser/native sessions and OAuth offline credentials |
| `GET /oauth2/authorize` | Registered public native client, authenticated browser, S256 PKCE |
| `POST /oauth2/token` | Form-encoded code exchange or refresh; exact native client and API resource |
| `POST /oauth2/revoke` | OAuth token revocation, with the registered client identifier |

Other Better Auth endpoints, including raw session/token-list endpoints, internal verification and all client/resource administration, are not publicly mounted. General-purpose bearer/device-authorization/JWT plugins are not enabled. Error bodies are generic or a bounded OAuth error code; input values and provider errors are never reflected. Responses carry `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.

The application authentication endpoints are:

| Method and path | Result |
| --- | --- |
| `GET /v1/auth/native` | Public issuer/audience/client/endpoint/callback metadata, without secrets |
| `GET /v1/auth/session` | Current safe user projection, session ID, authentication kind and expiry |
| `GET /v1/auth/sessions` | Up to 100 active devices, creation/update/expiry, user agent and current-device flag; no credentials |
| `POST /v1/auth/renew` | Browser renewal using the HttpOnly cookie; refresh remains subject to Better Auth's update interval |
| `POST /v1/auth/sessions/:sessionId/revoke` | Empty body; revokes only a session belonging to the authenticated account |
| `POST /v1/auth/logout` | Empty body; revokes this device and clears its browser cookie |
| `POST /v1/auth/bootstrap` | Explicit one-use operator grant binding |

Web cookies are Secure, HttpOnly, SameSite=Lax and host scoped. Sessions last seven days, with a one-day renewal interval and no cookie session cache. Every request checks current server state and email verification. Cookie mutations require exact Origin; foreign Origin or cross-site fetch metadata is rejected. The only HTTP-cookie exception requires explicit `NGERTIIN_AUTH_ALLOW_INSECURE_LOOPBACK=true` in development on loopback. There is no frontend session-token storage.

NMA-082's deployed email follow-up permits external document navigation only for the allowlisted GET verification/recovery links, with no Origin header and navigation/document fetch metadata when present. The pinned provider still validates the signed verification token or one-use recovery token and the same-origin callback. Cross-site fetches and all cookie mutations retain their Origin checks; email verification does not automatically sign in a browser. This fixes links opened from webmail without changing API schemas or weakening general request authentication.

## Public native client and renewal

The only registered client is `ngertiin-tauri`, with no client secret, `authorization_code`/`refresh_token`, required S256 PKCE, exact callback and scopes `ngertiin offline_access`. The first-party client is operator pinned and skips the generic OAuth consent screen; an external browser login is still required. Dynamic registration/client administration are disabled. NMA-080 implements the browser login screen and NMA-081 implements native callback/OS storage; their reports remain separate from the original headless proof.

The native gateway creates random state/verifier, opens the configured authorization endpoint in the system browser, and accepts one callback on loopback. Validate callback origin/path, state, issuer, duplicate parameters, bounded deadline and one-use consumption before exchanging a code. Exchange over the selected HTTPS origin with `resource=<server origin>`. [The headless helper](../../apps/server/src/auth/native-client.ts) demonstrates the five-minute state/issuer/callback contract; it does not install a Tauri callback listener.

Opaque `ng_at_` access tokens last five minutes; rotating `ng_rt_` renewal credentials last up to 30 days. At code exchange Ngertiin rebinds the issued tokens to a separate native device session, preserving the authorizing browser's session independently. Native token verification checks provider lookup, issuer, exact API audience, native client, required scope, subject, expiry, current verified user and live matching session. Native renewal additionally rejects absent, expired or revoked device sessions, including the upstream offline-access behavior that would otherwise detach credentials from an ended session. ID tokens, first-party session tokens, installation bearers, run leases and viewer tickets are not interchangeable.

NMA-081 stores long-lived renewal credentials in macOS Keychain and short-lived access tokens in native memory; renderer JavaScript never receives them. The [native contract](tauri-remote-client.md) and [verification report](../development/history.md#verification-archive--2026-11-17 "Archive: docs/verification/nma-081/README.md at 043f7c9") retain the implementation and actual proof separately from this backend milestone.

## Revocation and continuous delivery

Session revocation updates all bound OAuth access/refresh tokens and removes the device session in one transaction. Password recovery also revokes offline credentials before the session is removed. Logout preserves durable runs, Goals and Routine. The authenticated account can revoke its own devices, not another account's devices.

SSE validates the device before every event and closes on local revocation. Active session leases poll at 500 ms to fence expiry, externally changed sessions and OAuth token revocation. Viewer gateway requests, media messages and existing streams retain that device lease; revocation aborts the view and closes media. Viewer renew/delete requires the issuing session. Existing run-lease and ticket-only machine ingress retain their own authentication classes. Machine/native transport acceptance is separate from fixture-backed session fencing; execution-domain isolation remains NMA-076.

In account mode `/v1/contracts` adds authentication contract `nma-073.1` and describes the applicable authentication classes. The existing application contract remains 1.32.0 for the retained local client; this does not close NMA-079's later breaking-version decision or API/isolation gate. The export explicitly reports `pending_nma_079` for the account/multi-user contract.
