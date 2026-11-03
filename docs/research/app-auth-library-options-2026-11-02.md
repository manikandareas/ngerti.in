# Application authentication and authorization options

Research date: 2026-11-02. This is a proposal for review, not an implementation or an expansion of the active Notion roadmap. No dependency, credential, account, runtime configuration, or application code was changed for this research.

## Recommendation

Use **Better Auth** for application login and sessions if Ngertiin keeps its self-hosted/local installation model. Start with its core package, the React client, and the built-in `bun:sqlite` adapter. Keep resource authorization inside Ngertiin's application authority. A dedicated authorization engine and an ORM are not required for the initial single-owner deployment.

Choose **Clerk** instead if the priority is the shortest route to managed login and account screens, and dependence on a hosted identity service is acceptable. This is an engineering judgment based on the integration and operational differences below, not a benchmark proving that one library is universally faster or more secure.

## Current repository evidence

- `package.json` pins Bun 1.3.10.
- `apps/server/package.json` uses Elysia 1.4.30 and currently has no dedicated application authentication package.
- `apps/web-client/package.json` is the current React/Vite client and has no Clerk or Better Auth dependency.
- `apps/web/package.json` retains `@clerk/tanstack-react-start` 1.7.1 and Clerk localizations. This belongs to the separate TanStack Start application; its presence does not mean the Vite client or current backend is protected by Clerk. Reuse provider decisions or UI patterns only after auditing that integration.
- The parent audit found an installation bearer token and one configured owner in the current API/store. The server binds loopback and its current configuration rejects non-development operation. This is a development installation access boundary, not a per-person login or a shared multi-user data model. The Vite proxy validates loopback host/origin and then injects the installation token. In application-session mode that injection must be removed or explicitly disabled, otherwise proxy requests would bypass the new login boundary.
- The domain store has an application ID and a schema/table whitelist, and its configured owner is an installation-level value. Get/list queries do not provide a per-human partition. A separate auth store avoids making library-owned tables conflict with the domain schema authority; admitting a second human still requires domain isolation work.
- The old Clerk application's `/api/agent-engine/v1` route path differs from the current `/v1` API. Reuse UX ideas only after inspection; it is not an end-to-end auth implementation for the current client.

Exact local audit entry points: `apps/server/src/api/http.ts`, `config.ts`, `main.ts`, `store.ts`, `api-contract.ts`, `event-stream.ts`, `browser/view.ts`; `apps/web-client/vite.config.ts` and `src/lib/api-client.ts`. Knowledge-graph tools were unavailable in this session, so code discovery used the permitted filesystem fallback.

The current Notion [feature decisions](https://app.notion.com/p/409abdd61873813284bbf75698073d8e) defer full login/pairing (A05) and multi-human/team RBAC (X08). This request authorizes researching the next decision; it does not silently promote all collaboration features into scope. The [product scope](https://app.notion.com/p/402abdd61873816e871ae24804345b56) retains one human owner with multiple agents. The actual [NMA-060 gate record](https://app.notion.com/p/409abdd61873819b80c4dd2b3e593834) was fetched as Done for contract 1.16.0; the older main index summary is stale. An auth boundary amendment requires its own verification without rewriting that historical result.

## Deployment models are a separate decision

| Model | Human access and data | Authorization needed | Effect on this repository |
| --- | --- | --- | --- |
| One owner per installation | The same person can sign in on several devices; all access the same private agents and data | Verified account mapped to the installation owner, plus existing agent/thread/resource grants | Smallest extension of the existing Store and lifecycle boundary; recommended starting point |
| Multiple independent owners on one server | Each person has private agents, files, credentials, browser profiles, goals, and event streams | Every operation and background dispatch selects and validates the authenticated owner's partition | Requires explicit owner partitions throughout storage and runtime; could use separate stores/state directories or an audited shared schema; PostgreSQL is not inherently required |
| Human team sharing resources | Humans can be invited to shared resources with different powers | Membership, role/action checks, sharing rules, audit and revocation, plus owner/tenant isolation | A distinct product expansion; changes the current one-human group semantics and requires a privacy/sharing design |

Multiple independent users do not by themselves require organizations or team RBAC. Conversely, one person using several devices does not require a multi-user server. These distinctions determine scope more than the choice of login library.

## Library comparison

| Option | What it supplies | Work that remains in Ngertiin | Fit and tradeoff |
| --- | --- | --- | --- |
| Better Auth | Self-hosted TypeScript auth; email/password and social login; React client; sessions; extension plugins | Login/account UI, deployment secrets, email delivery if needed, upgrades, owner mapping, every resource policy | Strong fit for the existing Bun/Elysia/SQLite server and independently installable application |
| Clerk | Hosted identity flows, prebuilt sign-in/sign-up/profile UI, frontend SDKs and backend request verification | Local domain identity mapping, owner isolation, application access rules, integration with all API/stream/viewer paths | Likely shortest UI path; identity service and its lifecycle remain external dependencies |
| Auth.js | Framework integrations, OAuth/magic-link/credentials/WebAuthn methods and session strategies | More framework integration work for this Elysia/Vite arrangement; credentials/account UX and application resource checks | Existing mature ecosystem, but not the preferred new adoption here given maintainer direction and current stack |
| Keycloak | Separate self-hosted identity server, OIDC clients, realms, account administration, and identity-provider connections | Operating the identity service and its production database/TLS, app integration, and every domain resource policy | Consider when central identity/enterprise integration is an actual requirement; adds more deployment work than an embedded library |

Better Auth has an official Elysia guide explicitly targeting Bun, including mounting its handler and resolving a session before protected routes. Its SQLite guide directly supports `bun:sqlite` and schema generation/migration. Its installation guide documents separate frontend/backend installation and the `better-auth/react` client. These are concrete compatibility signals; local integration has not been run in this research. [Elysia integration](https://better-auth.com/docs/integrations/elysia), [SQLite adapter](https://better-auth.com/docs/adapters/sqlite), [installation and React client](https://better-auth.com/docs/installation).

Clerk's current React quickstart uses `@clerk/react`, a provider, and built-in account components. Its backend SDK accepts a standard `Request` through `authenticateRequest`; explicit `authorizedParties` are recommended. Existing Core 2 installations use different package/component names, so the old TanStack Start dependency should not be upgraded incidentally during auth work. [React quickstart](https://clerk.com/docs/react/getting-started/quickstart), [backend request verification](https://clerk.com/docs/reference/backend/authenticate-request).

Clerk hosts the frontend API used by sign-in and session flows. Prebuilt components reduce implementation effort; fully custom flows increase maintenance. Same-origin requests carry the session cookie, while cross-origin API requests need the session token passed as a bearer header. Backend verification can be networkless with a configured public key, but this does not make the entire identity lifecycle independent of Clerk. [Clerk architecture](https://clerk.com/docs/guides/how-clerk-works/overview), [authenticated requests](https://clerk.com/docs/guides/development/making-requests).

Auth.js documents Next.js, Qwik, SvelteKit, and Express as its main setup choices. Its maintainers continue security patches and critical fixes but explicitly recommend Better Auth for new projects. This is a reason to avoid introducing it here, rather than a claim that existing Auth.js deployments are broken or must migrate immediately. [Auth.js overview](https://authjs.dev/getting-started), [maintainer migration guidance](https://better-auth.com/docs/guides/next-auth-migration-guide).

Keycloak's official setup runs an identity server, creates realms and OIDC clients, and distinguishes development mode from production database/TLS configuration. Its account console supports two-factor authentication and identity-provider accounts. The operational-cost assessment above is an inference from those deployment responsibilities, not a runtime benchmark. [Keycloak Docker guide](https://www.keycloak.org/getting-started/getting-started-docker).

## What “mature” means for this decision

Evidence supports choosing established auth primitives instead of building password/session/OAuth machinery ourselves. Better Auth publishes an MIT-licensed implementation, framework/database guides, session lifecycle APIs, security guidance, upgrade documentation, and a public security advisory channel. Those are useful maintenance signals, not proof that every release and plugin is equally safe. Before implementation, select a patched stable version, review its advisories and upgrade guide, pin it in both workspaces, and verify it on the exact Bun/Elysia versions in this repo. The docs displayed Better Auth 1.7.15 during this review; that is a documentation observation, not an installed or tested version. [Source repository](https://github.com/better-auth/better-auth), [security guidance](https://better-auth.com/docs/reference/security), [published advisories](https://github.com/better-auth/better-auth/security/advisories).

## Minimal dependencies and session design

For the proposed self-hosted path:

- Add `better-auth` to `apps/server` and `apps/web-client`; use `better-auth/react` as an import from that package.
- Use the already available `bun:sqlite`; no Prisma, Drizzle, PostgreSQL, or Redis migration is needed just to implement login.
- Consider a separate `auth.sqlite` under the installation state directory for library-owned user/account/session/verification tables. This is a proposed storage boundary, not an upstream requirement. Keep the domain owner mapping in Ngertiin's authoritative domain state, and include both stores and secrets in the operational backup plan. Explicitly handle partial account-provisioning failures; separate files do not provide a shared transaction automatically.
- Prefer the same browser origin for `/api/auth`, product APIs, event streams, and viewer proxy paths. A same-origin dev proxy can preserve this arrangement locally. Different top-level domains can cause browser cookie restrictions, including Safari ITP. [SQLite support](https://better-auth.com/docs/adapters/sqlite), [cookie deployment guidance](https://better-auth.com/docs/concepts/cookies).

Use database-backed opaque cookie sessions initially. Better Auth provides expiration, session listing, and revocation. Keep cookie caching disabled initially: when enabled, another device's revoked session can remain valid until the cache expires. This keeps the initial revocation behavior easier to verify. Long-lived streams still need an explicit policy for revalidation and disconnection after expiry/revocation. [Session lifecycle and cache caveats](https://better-auth.com/docs/concepts/session-management).

Better Auth sets HttpOnly cookies and secure cookies in production, and uses SameSite=Lax by default. Its auth endpoints include origin/CSRF safeguards. Those protections must not be assumed to automatically protect Ngertiin's separate mutation endpoints: changing the product API from an explicit bearer credential to automatically attached cookies requires an application-wide origin/CSRF review. Use exact trusted origins and preserve the protections. [Cookies](https://better-auth.com/docs/concepts/cookies), [security model](https://better-auth.com/docs/reference/security).

The built-in rate limiter is enabled by default in production, uses memory by default, and can use database storage. Calls through server-side `auth.api` are not limited by that limiter. Configure trusted proxy/IP handling and appropriate route limits; do not mistake auth-route limiting for a complete product API limiter. No extra rate-limit infrastructure is necessary for the first single-process installation. [Rate limiting](https://better-auth.com/docs/concepts/rate-limit).

## Login methods are a separate choice

| Initial method | Advantages | Additional obligations |
| --- | --- | --- |
| Local email/password | Can authenticate without a hosted identity provider once configured; natural fit for a private installation | Initial owner provisioning, password policy, recovery mechanism; reliable mail is needed if email reset/verification is offered |
| Google or GitHub OAuth | Less password/recovery handling inside Ngertiin | Provider application credentials, callback URLs, network dependency, account-linking rules; each self-host deployment needs a viable provider configuration |
| Email link or OTP | No password UX | Reliable delivery service and anti-abuse protections; not simpler for an offline/local installation |

Better Auth includes email/password and social sign-on support; verification and reset delivery must be configured rather than assumed. Its password implementation uses scrypt by default. Choose the first method according to the installation model instead of enabling every available method. [Supported methods](https://better-auth.com/docs/installation), [email/password flows](https://better-auth.com/docs/authentication/email-password), [password hashing](https://better-auth.com/docs/reference/security).

For one-owner installations, account admission must bind the approved account to the configured owner. Do not expose an unauthenticated, raceable “first person to register becomes owner” endpoint on a remotely reachable installation. Prefer an explicit setup/bootstrap step or a restricted identity allowlist. Public registration is a different product decision from installing an auth library.

## Authorization: start with the domain boundary

Authentication establishes a human identity. Authorization decides whether that identity may read or mutate a particular agent, conversation, goal, file, browser session, connection, or account configuration.

For the current single-owner installation, resolve a verified human principal, map it to the installation owner, then enforce ownership at the server boundary. A second authenticated account must not inherit the configured owner's data. Keep native harness/product-tool credentials separate: an autonomous Routine must not acquire a user's browser session or stop working merely because the user logs out. Its execution remains governed by persisted owner identity, grants, and the application's lifecycle authority.

For a shared installation with multiple humans, login is the smaller part. The domain store and all reads, mutations, events, artifacts, browser viewers, Composio connections, harness credentials, and background dispatch must be partitioned by owner. A session `userId`, organization ID, or role field cannot substitute for that partitioning. Likewise, a group containing one human and several agents is not evidence that multi-human collaboration is implemented.

| Authorization option | Use when | Initial recommendation |
| --- | --- | --- |
| Central Ngertiin owner policy | One human owner per installation, simple resource ownership and persisted agent grants | Use now; avoid duplicated route-by-route ad hoc checks |
| Better Auth organization plugin | Product explicitly adds human organizations, memberships, invitations, roles | Defer; it manages organization membership but cannot retrofit domain isolation |
| CASL (`@casl/ability`, optionally `@casl/react`) | Many subject/action/attribute rules need a shared vocabulary across backend and UI | Consider later; server remains authoritative and database filters still matter |
| Casbin | Policies need a generalized in-process RBAC/ABAC engine and policy storage | Defer until actual policy complexity justifies it |
| OpenFGA | Relationship sharing becomes a separate cross-service authorization problem | Defer; introduces a service/data model and synchronization work |

The organization plugin provides memberships, teams, roles, and permissions. CASL is a JavaScript resource/attribute permission library. Casbin is an in-process policy library, while OpenFGA is a relationship-oriented server queried over the network. Their features explain the later adoption triggers above; choosing not to add them initially is a scope/complexity judgment. [Organization plugin](https://better-auth.com/docs/plugins/organization), [CASL source](https://github.com/stalniy/casl), [Casbin comparison](https://casbin.apache.org/docs/casbin-vs-openfga/), [OpenFGA overview](https://openfga.dev/).

## Suggested delivery order

1. Record the product decision: one-owner private installation versus a shared multi-user service; choose initial login method and account-admission policy. Reconcile the current Notion scope before scheduling implementation.
2. Add auth persistence, explicit owner binding, session verification, and a default-deny application principal boundary. Keep health/auth endpoints explicitly allowlisted. Establish exact origin and cookie behavior.
3. Cover product routes and alternate entry points: API, SSE, WebSocket/viewer upgrades, artifacts/files, callback handoff, queued work, and internal tool boundaries. Keep webhook/machine credentials distinct from human login.
4. Prove backend admission, ownership, revocation, recovery, and background continuation before integrating visible login/account screens.
5. Add minimal client login/logout/session-expired states and account controls. Preserve an explicit protocol for logout and account switching: clear caches, terminate subscribed streams/viewers, and avoid stale-user data flashes.
6. Re-run affected API acceptance and then browser acceptance. For a shared-user decision, insert the full data-partitioning slice before admitting the second user; do not claim shared-user readiness from a successful login screen.

Required evidence should include unauthenticated denial, authenticated wrong-owner denial, no cross-owner list/event/file/viewer leakage, logout and session revocation, untrusted-origin rejection, restart persistence, safe bootstrap, and continued authorized Routine execution after browser logout. These checks validate application integration; upstream library documentation alone does not.

The parent audit observed that the current SSE stream lasts at most 60 seconds without checking an application session again. Browser/VNC tickets are single-use and valid for 60 seconds, with ongoing browser-resource checks. Session integration should define stream revalidation, bind viewer tickets to the issuing user/session, and enforce revocation on an already-open viewer. Logout should close the browser's subscriptions without stopping goals/Routines or revoking the user's Codex/Muse harness login.

## Concrete implementation slices for the recommended model

1. **Compatibility and contract spike.** Pin one patched stable Better Auth version across the server and client. Prove its handler, `bun:sqlite` migrations, cookie forwarding, and session lookup against this exact Bun/Elysia stack using temporary state. Specify public health/auth routes and human versus run-lease authentication in the API contract. Acceptance: a real HTTP login produces a session and an unauthenticated product request is denied.
2. **Account admission and durable owner binding.** Add library-owned tables in `auth.sqlite`, preserve the existing installation `owner_id`, and define an explicit local bootstrap/recovery path. Bind one permitted auth user ID to that owner with uniqueness and retry/reconciliation rules. Account existence alone never grants installation access. With separate databases, keep intermediate provisioning states and reconcile partial completion rather than claiming cross-file atomicity. Acceptance: concurrent setup cannot bind two accounts, restart preserves the mapping, and an unrelated valid account receives no domain access.
3. **Central human request principal.** Replace installation-token auth for browser product requests in `api/http.ts` and wire it through `api.ts`/`main.ts`. Resolve the verified user/session to the server-owned owner binding. Preserve the scoped MCP run-lease path as a distinct credential class. Remove automatic installation-token injection in `apps/web-client/vite.config.ts` for the new mode and proxy `/api/auth` on the same origin. Acceptance: direct API and proxy traffic enforce identical session/owner rules; human cookies cannot substitute for a run lease or vice versa.
4. **Domain access and live connection coverage.** Apply the principal to all reads, lists, commands, downloads, uploads, integration authorization handoffs, and event replay. Keep existing agent/thread/grant checks. Bind SSE subscriptions and VNC ticket issuance/peers to session lifetime with documented revocation bounds. Configure exact origins, mutation CSRF protection, auth rate limits, and proxy trust. Acceptance: revocation ends access through every transport within the specified bound, including already-open streams/viewers.
5. **Backend evidence and contract publication.** Add focused HTTP integration tests for setup, login/logout, wrong-owner denial, expired/revoked sessions, resource scopes, alternate transports, restart, and exact idempotent retries. Amend `api-contract.ts`, response/errors, examples, and the versioned consumer contract. Re-run affected backend/consumer checks before depending on the boundary in UI; rerun native checks where dispatch/grants or credential ownership changed.
6. **Minimal client account flow.** Add the React auth client, login/session-loading/session-expired states, logout, and device/session revocation where included in the accepted scope. Update `apps/web-client/src/lib/api-client.ts` and the app route boundary. Terminate connections and clear private in-memory projections and user-scoped pending work on logout/account switch. Reconcile uncertain commands before resubmission; reauthentication must not duplicate effects or create another Tobi/primary DM. Acceptance: reload/relogin returns to the same domain identity, and stale private data is not displayed to a signed-out or different account.
7. **Lifecycle and release boundary verification.** Prove that user logout removes interactive access while existing authorized goals/Routines continue under persisted owner/grants. App login, harness subscription/API-key authentication, and Composio connected-account authorization remain distinct. Test real browser cookies, expiry/revocation, and recovery. Record results separately from deployment/distribution; remote serving, HTTPS gateway, and other-host installation remain separately scoped work.

If multiple independent owners are selected, insert a storage/runtime partition design before slice 3 and prove at least two owners across all query/event/file/browser/credential/queue paths before any shared-server readiness claim. Team collaboration additionally needs membership and sharing semantics before enabling an organization plugin.

## Research limits

This research read official docs and repository manifests. It did not install or benchmark the candidates, conduct a security audit, create provider accounts, perform OAuth/email delivery, or establish production acceptance. Firecrawl search returned HTTP 402; primary-source reading continued with the web tool. Pricing was not needed to choose the initial self-hosted architecture and was not compared.
