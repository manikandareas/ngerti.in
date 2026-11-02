# Durable observed native interactions — API 1.18.0

This narrow application-owned journal supports settled/reopened native question and
permission cards. It records **observed requests and response acknowledgements**,
not every event emitted by an engine and not completion of an approved action.
The existing Codex/Muse capability boundaries remain unchanged.

## Contract

`GET /v1/runs/:id/interactions/history` requires the installation bearer token.
It reads only application persistence, works without a connected broker after run
completion/restart, and never opens a session or replays a native response.

```ts
interface NativeInteractionHistory {
  run_id: string;
  run_status: RunStatus;
  cancellation: "none" | "requested" | "confirmed";
  coverage: "observed_requests_only";
  records: NativeInteraction[];
}
interface NativeInteraction {
  id: string; // Application UUID, stable across reads/restart.
  type: "approval" | "user_input";
  request_id: string;
  source_index: number | null; // Native approval stage; null for user input.
  anchor_message_id: string | null;
  anchor_text_offset: number | null; // UTF-16 code units, not bytes/code points.
  anchor_prefix_sha256: string | null; // SHA-256 of the UTF-8 prefix.
  request: ApprovalDisplay | UserInputDisplay;
  observed_at: string;
  last_observed_at: string;
  observed_state: "pending" | "not_pending";
  submission: null | {
    attempt_id: string;
    fingerprint: string; // SHA-256 of the original normalized answer.
    answer: InteractionAnswer; // Redacted display copy, not a dispatch payload.
    state: "submitting" | "submitted" | "not_dispatched" | "unknown";
    started_at: string;
    updated_at: string;
    diagnostic: null | {
      code: string;
      category: "temporary" | "authentication" | "configuration" | "provider" | "unknown";
      outcome: "not_dispatched" | "unknown";
    };
  };
}
```

The exact bounded schemas are in `harness/interaction-contracts.ts` and the
published [1.18.0 contract](../../../contracts/1.18.0.json). Existing runs default
to `native_interactions: []`; no database format change/reset is required. The
field follows the existing scoped run/snapshot/event projection. The history
endpoint does not expose another installation's state or become a product-tool
scope bypass.

Existing `GET /v1/runs/:id/interactions` retains its pending snapshot shape and
live authorization rules. Successfully authorized snapshots, including the fresh
read before a response, enter the journal. Identical repeated polls do not write
new revisions; `last_observed_at` is the last persisted meaningful observation.
A request absent from a subsequent complete observed snapshot is `not_pending`.
On first observation only, the record anchors to the existing agent conversation
message for that same run and its current JavaScript `text.length`; the SHA-256
hash covers that observed UTF-8 prefix without storing duplicate private text.
If no agent message exists, it anchors to the run's input message with null
offset/hash. Polling, submission, disappearance, completion and restart never
move this anchor. Older records default all anchor fields to null and are not
retroactively positioned. A client may insert a card at a verified unchanged
prefix; missing/changed prefixes use an honest per-run fallback, never fabricated
engine ordering or timestamps.
Run termination/cancellation is reported separately, without inventing a final
native request event when no such observation was received.

Existing POST answer bodies and successful `{ "status": "submitted" }` responses
remain compatible. The application commits `submitting` before calling native
`respond`, keyed by run/type/request/approval-stage identity. Concurrent response
attempts conflict. Repeating the same acknowledged answer returns its receipt
without dispatch, including after the run finishes; a changed answer conflicts.
Ambiguous transport errors, effect timeouts, graceful close and startup recovery
fence an in-flight attempt as `unknown`. Such attempts are never retransmitted.
A late actual acknowledgement can settle **that same attempt** to `submitted`.
An explicit `not_dispatched` rejection may be retried only after a fresh native
pending read and application grant validation.

`submitted` means native acknowledgement only. It never means permission was
exercised, a tool finished, a run succeeded, or an external action completed.
The latest response attempt is retained per observed native stage; a definitively
not-dispatched attempt can be replaced by an explicit new attempt. Submitted and
unknown attempts cannot be overwritten/replayed. This is not an exhaustive audit
of all rejected UI inputs, pre-poll requests or engine events.

## Privacy and bounds

Only normalized display fields are retained. Known credentials and token-shaped
strings are redacted in persisted request/answer displays; original answer hashes
serve replay comparison. Native transport replies, opaque raw events and exception
messages are discarded rather than stored/logged. These records remain private
conversation data, not public diagnostic logs. Submitted answer displays are never
reused as native dispatch arguments.

Bounds: 100 pending approvals and 100 pending user-input requests per observed
snapshot, bounded question/choice/text fields, 128 KiB normalized snapshot, 1,000
journal records/run and 2 MiB journal budget. Space is reserved for acknowledgement
metadata of in-flight attempts. Oversize/identity-conflicting observations fail
explicitly; settled history is not silently truncated.

## Verification

Use isolated fixture state only. No user development service or credentials are
needed. The new `tests/interaction-journal.test.ts` covers HTTP/Store restart,
acknowledged versus completed state, disappeared requests, run cancellation,
concurrent and changed retries, lost HTTP acknowledgement, native ambiguity,
timeout/late acknowledgement, revoked grants, approval stages, redacted display
versus original fingerprint, payload bounds, immutable UTF-16/hash anchors across
append/replacement/restart, no-agent/legacy fallback and conversation isolation.

The existing NMA-060 consumer verifier additionally revalidates published router
schemas, HTTP commands, SSE/cursor/replay and SQLite restart. Its current output
is in [consumer/consumer.json](consumer/consumer.json); this fixture cohort does
not claim live provider inference. Full backend suite results and preserved user
work identities are recorded alongside the final verification summary.

Pre-existing dirty backend/key-onboarding work was snapshotted privately before
edits in `.dev/native-interaction-journal-baseline/`. API-key source/storage/service
changes and contract 1.17.0 are retained; only version assertions move to 1.18.0
where the current publication changed.
