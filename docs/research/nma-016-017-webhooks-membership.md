# Durable webhooks and group membership

Implementation date: 2026-10-24. Authority: live Notion Ngertiin Multi Agent,
NMA-016 / NMA-017, product documents 01–04/07, ADR-03/04/05. Dependencies
NMA-015, NMA-005 and NMA-011 were read as Done. The working tree was clean
before this work. Hermes remains the only execution and recovery owner.

## External event contract

`POST /api/agent-engine/v1/webhooks/{route_id}` resolves an operator-provisioned
owner partition. It forwards the exact body bytes, delivery identity, event type
and signature through the existing signed service channel. It does not execute
models, acknowledge on behalf of an unavailable engine, or accept a target from
the request. The engine authenticates HMAC-SHA256 before filters or persistence.
The 512 KiB body bound is enforced while streaming at the HTTP boundary.

The provider sends `X-Hub-Signature-256: sha256=<hex>` over the exact request body,
`X-GitHub-Delivery` / `X-Webhook-ID`, and `X-GitHub-Event` / `X-Webhook-Event`.
No unauthenticated mode or default secret is provided. The secret file contains
at least 32 raw bytes (including a trailing newline if present).

Set `NMA_WEBHOOK_ROUTES_FILE` in both API and engine processes. The API needs
route-to-owner mapping; the owner engine needs the full configuration, for example:

```json
{
  "research-updates": {
    "owner_id": "<provisioned owner UUID>",
    "agent_id": "<responsible agent UUID>",
    "goal_id": "<existing product goal UUID>",
    "secret_file": "/run/secrets/research-webhook",
    "events": ["push"],
    "filters": [{"field": "ref", "equals": "refs/heads/main"}],
    "coalesce": {
      "key": "repository.full_name",
      "window_seconds": 30,
      "max_wait_seconds": 300
    }
  }
}
```

Provision this configuration as an owner-only file; it is not a browser command
or an agent-selected credential path. Replace the file atomically when editing.
Disable a route with `enabled: false`. These routes must not also be registered
with native webhook execution: the native process-local coalescer is not used.
Payloads remain untrusted external data in the internal continuation prompt.

A 202 response means the owner committed the event and batch receipt. It does
not claim model completion or a remote side effect. Retry a lost response using
the same delivery ID and exact payload. Identity is owner + route + delivery ID;
a changed payload under the same identity is a conflict. Filtered events return
200/ignored and do not create work. Terminal event receipts are retained; this
slice introduces no receipt compaction.

Every accepted event retains its payload and supersession link. Compatible bursts
share a persisted batch, quiet deadline and maximum wait cap. Compatibility includes
route configuration, goal generation, thread/context, membership revision and
agent configuration/access generation. Distinct or unresolved entities do not merge.
The latest payload is passed to the run; all contributing payloads remain in the
receipt chain. A server restart restores the deadline. Busy threads defer admission;
existing user interruption and goal pause/stop fences retain priority.

Admission atomically creates the existing continuation/run/outbox and updates the
batch. Native Kanban and admission retain their own durable reconciliation protocol.
Known stale/revoked targets become rejected receipts. Transient authority/service
errors retain pending work. Existing indeterminate-effect handling remains unchanged;
there is no exactly-once external-effect claim.

## Group membership and transcript

Authenticated `thread.create` creates a group of 2–6 existing owner agents. Only the
account owner is human; there is no human-member field or invite API. Persistent
agent identity/configuration is resolved on read and shared with DM.

`member.add` and `member.remove` take `thread_id`, `agent_id`, and an envelope
`expected_revision` equal to the current **membership_revision** (decimal string).
Successful retries return the stored receipt. Unknown/cross-owner agents, stale
revisions, duplicate additions and additions above six members are rejected.
Removal can reduce the roster below two so revocation is never prevented by a
minimum-size constraint; execution is refused until the roster again has at least two agents.

Roster changes increment membership revision and access generations. They fence
all outstanding work based on the former group roster before native cancellation.
This preserves deterministic roster semantics and prevents remove/re-add from
reviving old queued work. Unrelated DM work is outside that fence. Context generation
and historical transcript remain intact; removal does not erase conversation data.
Restart invokes the existing native cancellation recovery.

Group snapshot and event endpoints now expose the durable ordered transcript with
explicit user/agent authors and persistent agent IDs. Membership changes are separate
system events. Existing scoped-context retrieval prevents automatic copying of private
DM transcript or memory. Public group message routing, mentions, peer handoff and
multi-agent discussion execution remain NMA-018; this slice tests multi-author writes
through the existing private runtime boundary. No new UI was added.

## Provenance and upgrade

Hermes `7489b22af47ce91b366dde81d5831ea422577498`, MIT: import native
`WebhookRouteProcessor` for payload filters and field resolution. Reviewed webhook
feature documentation and `webhook_coalesce.py`; hashes are added to the runtime pin.
The durable receipt/coalescing extension is Ngertiin-authored, not a claim that native
Hermes has durable webhook buffering. Native source is not patched or copied.

Nakama `ac0643f8196fdf9133e66f5a13eef86103c45d0c`, MIT: reviewed
`apps/server/src/services/agent-group-store.ts` as an ownership/author/order reference.
Its owner-scoped joins and author profile IDs are reference patterns; its application
store/queue are not imported. Existing Ngertiin owner-scoped tables remain authoritative.

Migration 10 adds `nma_webhook_batches`, `nma_webhook_events` and a due index.
Migrations 1–9 remain byte-identical. Before upgrade, stop ingress and the sole owner,
back up the complete partition including SQLite/WAL and native Kanban/session state,
then upgrade under exclusive ownership. Verify checksums, integrity, foreign keys,
transcript replay and pending receipts before reopening ingress. Older binaries reject
schema 10. Rollback preserves new receipts and restores a complete isolated backup;
never drop production tables to force an older binary to run.

## Verification and limits

Results, commands and file hashes are recorded in
[evidence/nma-016-017/verification.json](evidence/nma-016-017/verification.json).
Tests exercise real gateway subprocesses and SQLite with a controlled model provider.
Fault injection covers event transaction rollback, commit-before-ack, continuation
transaction rollback, committed outbox and native-admission acknowledgement loss.
HTTP integration exercises the actual backend-to-engine transport with test account
authentication. Provider internet delivery, TLS deployment and production credentials
are not tested. No new real-model behavior is claimed.

Initial focused tests passed. An expanded fault test initially failed because the
shared test marker was not reset between parameterized crashes; the marker is now
cleared explicitly. That failure is retained in the evidence directory. The first broad regression also
identified predecessor fixtures asserting schema 9 and retaining new tables while
reconstructing older schemas. These disposable fixtures now remove schema 10
tables and assert the upgraded version. An intermediate regression was deliberately
interrupted to finish those fixture updates. No failed or interrupted invocation is
counted as a successful suite.

Author self-review covers authentication before acceptance, server-side target binding,
dedup conflicts, durable deadlines/payload chains, generation fences, membership
revocation, transcript retention and additive migration. No independent review,
production deployment/migration, commit or push is claimed. Generic HMAC JSON ingress
is supported; provider-specific SVIX/GitLab token protocols, route-creation UX,
notification channels, and high-volume throughput benchmarking are outside this slice.

## Recorded results

- Complete engine regression: **94 passed, 4 skipped**, 383.38 seconds. Skips are
  three opt-in real-provider tests and the opt-in browser-closure test.
- Final membership checks after review: **3 passed**, 6.59 seconds; separate
  deferred-publication/restart case: **1 passed**, 7.11 seconds. These include
  coverage added after collection of the full suite; overlapping tests are not
  added to the full-suite count.
- Expanded focused webhook/membership run: **10 passed**, 60.07 seconds.
- Backend HTTP contract tests: **9 passed**. Make check, engine Ruff/format,
  wheel/sdist build, package/source equality, docs-check and diff-check passed.
- All nine predecessor migration definitions were compared with the baseline
  commit and remain identical. Schema-9 upgrade preserves commands, goals and
  transcript; integrity and foreign keys pass.
- No UX change, real-provider evaluation, deployment or production migration was
  performed for these tickets. The existing browser/provider tests were not opted in.
