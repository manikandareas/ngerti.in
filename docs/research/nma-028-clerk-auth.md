# Real Clerk authentication for the native baseline

Date: 2026-10-25. This closes the fixed-account authentication gap in the
NMA-028 experiment. It is development-instance acceptance, not a production
deployment or a claim about a production Clerk tenant.

The fixture authenticates two recorded disposable users through the actual
Clerk JavaScript client. It sends their real, signed session JWTs to the running
`ngertiin.api.app` API. The application's original `current_account` dependency,
signature verification, `authorized_parties`, session-token requirement and
account mapping remain active; no dependency override or fake owner is installed.
PostgreSQL is the separately migrated disposable database created by the parent
fixture. Users have generated usernames and no email/phone identifiers, and this
flow sends no messages.

## Observed mechanism and result

The first Backend API `sessions.create_token` attempt produced a signed token
without `azp`. The production authentication options rejected it with HTTP 401
and `TOKEN_INVALID_AUTHORIZED_PARTIES`. That unsuccessful attempt is retained in
the parent's private run log; no authentication rule was relaxed.

Clerk defines `azp` from the original Frontend API request's Origin. The fixture
therefore uses an actual browser at `http://127.0.0.1:3028`, consumes a short-lived
Backend API sign-in ticket with `Clerk.client.signIn.create`, activates that
session and calls `Clerk.session.getToken({skipCache:true})`. The returned tokens
contain the expected origin, and the original application `/me` endpoint returns
HTTP 200 with the expected Clerk subject and newly mapped owner UUID for both
users. Missing and invalid bearer tokens return HTTP 401.
([Session-token claims](https://clerk.com/docs/guides/sessions/session-tokens),
[sign-in token API](https://clerk.com/docs/reference/backend/sign-in-tokens/create-sign-in-token),
[authenticated requests](https://clerk.com/docs/guides/development/making-requests).)

ClerkJS reports runtime version **4.73.14** in this instance. After measuring that
version, the fixture pins its official instance asset URL to `@4.73.14` and records
the downloaded asset's SHA-256 and byte count in
[auth-proof.json](evidence/nma-028-closure/auth-proof.json). Backend verification
uses the installed application SDK and its existing configuration. This is not a
new production SDK dependency or a token-template workaround.

The successful `/me` responses establish actual authentication and owner mapping.
The later [authenticated history proof](evidence/nma-028-closure/auth-history-proof.json)
also populates two separate disposable partition mappings and reads settled
history with model invocation disabled. Each valid identity receives its own
agent list with HTTP 200; the two lists are disjoint. The first identity can read
the selected thread and its three persisted message IDs. The second valid
identity receives HTTP 404 for that foreign thread, including when it supplies a
forged owner header. Recorded history and command-receipt hashes remain unchanged.

The [UI screenshot](evidence/nma-028-closure/authenticated-ui-history.png) shows
the production DM components rendering the previously completed native form
interaction and `NMA028_SAVED` response through this real authentication path.
The walkthrough reads existing settled fixture results; it does not make another
model call or claim that a new browser task executed during the walkthrough.
This closes authenticated history/presentation and the measured cross-owner
resource case. It does not establish production deployment or every possible
tenant/isolation interleaving.

## Reproduction and private-state boundary

Run with the application's backend interpreter, after the recorded disposable
identities/database/API have been prepared:

```bash
uv run --project apps/backend python scripts/spikes/nma028/clerk_browser_auth.py \
  --state .dev/nma-028-closure/auth/private2.json \
  --evidence docs/research/evidence/nma-028-closure/auth-proof.json
```

Open `/user/0` and `/user/1` in separate named disposable browser contexts on
`http://127.0.0.1:3028`. A page reports success only after the signed browser token
has been accepted by the production `/me` endpoint and mapped to the expected
subject. The browser refreshes every 15 seconds; the server atomically saves the
latest JWT and frontend session ID in the existing private state file with mode
0600. The private state, sign-in tickets, cookies, JWTs and full browser network
logs must not be published. Checked-in evidence contains only result metadata,
origin, issuer, IDs, expiry and source provenance.

`GET /session?identity=0` (or `1`) supplies the current disposable token and its
verified identity to the local UI test bridge. This endpoint exists only in the
loopback fixture; it is not an application route and must not be deployed. The
isolated model tool containers have no host network and cannot reach it. The
actual application API continues to validate every token independently.

For a production-components UI walkthrough on the same origin, stop only the
recorded loopback server PID and restart the capture server with:

```bash
uv run --project apps/backend python scripts/spikes/nma028/clerk_browser_auth.py \
  --state .dev/nma-028-closure/auth/private2.json \
  --evidence docs/research/evidence/nma-028-closure/auth-proof.json \
  --port 3029 --origin http://127.0.0.1:3028
```

The UI Vite server on 3028 proxies `/capture` and `/session` to 3029. The already
open Clerk pages keep their original origin and continue refreshing through the
proxy. Listening port and authorized origin are independent; the production
application's permitted origin is unchanged. The UI authentication adapter reads
the real token/verified identity rather than returning a fixed user or null token.

Stop the browser refreshers/server before freezing the evidence manifest, because
`auth-proof.json` updates with fresh verification timestamps. The parent's cleanup
revokes recorded sessions, deletes only the two disposable users (including their
other sessions) and drops only the recorded disposable database. No existing
user, account, configuration or authentication state is modified by this proof.

## Cleanup

The delegated fixture and its two named browser sessions were stopped after the
walkthrough, along with only the recorded Vite proxy. The existing
`auth_fixture.py cleanup` command revoked the two recorded frontend sessions,
deleted the two disposable users and dropped the recorded isolated PostgreSQL
database. [Cleanup evidence](evidence/nma-028-closure/auth-cleanup.json) records
the subsequent user-not-found/database-absence checks, process checks, private
state permission and frozen evidence hashes. Private JWT fields were removed;
the private ledger remains mode 0600 for audit. Existing development gateways,
users and databases were not targeted.
