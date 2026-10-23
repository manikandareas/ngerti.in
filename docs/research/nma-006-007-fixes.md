# NMA-006/007 review fixes — 2026-10-23

Both defects in the [review](nma-006-007-review.md) are fixed in the local working tree.
Historical failure evidence remains unchanged.

## Pending native receipt reconciliation (P1)

After validating the original command digest, runtime.submit now looks up the pending command's
stored binding and native admission identity before enforcing current configuration on new work.
An existing native receipt repairs the extension mapping and returns the original run/configuration;
it does not submit another native operation. Fresh or prepared-but-never-admitted requests still
fail after a revision change or archive.

Two regression cases reconstruct the committed-native/pending-extension boundary in a disposable
database, configure or archive the agent, restart the real engine, and retry. They verify the same
run and revision, one native admission, no second model execution, and refusal of stale requests
without native receipts. This is boundary-state reconstruction, not precise crash injection.

## Encoded transport budgets and pagination (P2)

The signed request budget is 2 MiB and the response budget is 16 MiB. Canonical serialization and
payload hashes are unchanged. The API rejects oversized encoded input with HTTP 413 and
retryable=false before opening a socket. Engine framing has explicit oversized-request/response
errors. Agent pages are capped at 4 MiB as well as the requested row limit, with continuation cursors.

Regression tests submit 44,000 CJK characters to the real runtime and create 100 profiles with
maximum-length mixed Unicode persona fields. All profiles are retrieved without omission or
duplication through byte-bounded pages. HTTP contracts cover Unicode signing and preflight rejection.
An authenticated browser API probe against the real disposable partition also confirms 16,000 emoji
per persona field round-trip, exact create replay, and non-retryable HTTP 413 for oversized input.

## Verification

- Real pinned Hermes runtime: **17/17 macOS arm64**, **17/17 Linux aarch64**, Python 3.14.9,
  SQLite 3.53.1/WAL, deterministic loopback provider. Linux runs as UID 10001 and retains one
  non-failing pytest-cache permission warning.
- HTTP boundary contracts: **6/6 passed**.
- Full `make check` passed after correcting the previously reported inventory script import order.
- Evidence: [macOS](evidence/nma-006-007-fixes/macos-tests.log),
  [Linux](evidence/nma-006-007-fixes/linux-tests.log),
  [HTTP](evidence/nma-006-007-fixes/http-tests.log),
  [browser HTTP probe](evidence/nma-006-007-fixes/unicode-http.json),
  [static checks](evidence/nma-006-007-fixes/make-check.log).

Both tasks remain Review. Missing dependency notices and pillow-heif codec clearance still gate
NMA-006; full DM/group consumers and that dependency still gate NMA-007. Run-revision acceptance
is restored. General recovery/descendant fencing remains NMA-010/023. No paid-provider, production
deployment, distribution clearance, commit or push is claimed.
