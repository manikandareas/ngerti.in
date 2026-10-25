# Native closure reproduction

Read [the current decision and outstanding acceptance](../../../docs/research/nma-028-native-contract-closure.md).
The older README and `protocol.json` describe the immutable first baseline.
`protocol-closure.json` is the separately frozen native placement candidate.
No command below deploys a runtime or migrates a real account.

## No-model verification

```bash
uv run --project apps/backend ruff check scripts/spikes/nma028
uv run --project apps/backend ruff format --check scripts/spikes/nma028
.dev/nma-006-closure/runtime/bin/python -m pytest \
  scripts/spikes/nma028/test_baseline.py scripts/spikes/nma028/test_closure_results.py -q
docker build -f scripts/spikes/nma028/isolation.Dockerfile \
  -t ngertiin-nma028-isolated:local .
NMA028_ISOLATION_TEST=1 NMA028_ISOLATION_OUTPUT=/tmp/NEW-isolation-proof.json \
  .dev/nma-006-closure/runtime/bin/python -m pytest scripts/spikes/nma028/test_isolated_tools.py -q -s
.dev/nma-006-closure/runtime/bin/python scripts/spikes/nma028/backend_measurements.py \
  --control-dir .dev/NEW-nma028-measurement-control --output .dev/NEW-nma028-measurement.json
```

Use new output/control paths. The selected image uses the metadata-only
local-CDP browser-harness profile, ordinary dependency resolution and unchanged
native modules/notices. The earlier research Dockerfile is historical; its
fetch-use distribution is not the selected package profile.

## Actual authenticated live runs

Prerequisites: exact verified Hermes source, reviewed foundation interpreter,
Docker, local PostgreSQL, configured Clerk **development** keys and a funded model
route in root `.env`. The recorded fixture users and database were cleaned up;
old private JWTs are removed. Prepare a fresh ledger rather than reusing them.

```bash
uv run --project apps/backend python scripts/spikes/nma028/auth_fixture.py prepare \
  --state .dev/NEW-nma028-auth/private.json
uv run --project apps/backend python scripts/spikes/nma028/auth_fixture.py start \
  --state .dev/NEW-nma028-auth/private.json
uv run --project apps/backend python scripts/spikes/nma028/clerk_browser_auth.py \
  --state .dev/NEW-nma028-auth/private.json --port 3028 --origin http://127.0.0.1:3028 \
  --evidence .dev/NEW-nma028-auth/auth-proof.json
```

The last server stays running while two separate disposable browser contexts open
`http://127.0.0.1:3028/user/0` and `/user/1`. Wait for both to report that the real
Clerk session is verified by production `current_account`. ClerkJS supplies JWTs
with the actual authorized origin; the Backend API token negative control lacked
that claim and was rejected. The fixture no longer offers that invalid token
refresh path. Private state must stay mode 0600 and must never be published.

Run each surface serially, replacing the surface and all output/control paths
for the next batch. The adapter/application use separate recorded owners.

```bash
HERMES_SOURCE="$PWD/.dev/nma-001/source" \
PYTHONPATH="$PWD/apps/engine/src:$PWD/.dev/nma-001/source" \
  .dev/nma-006-closure/runtime/bin/python scripts/spikes/nma028/complete_baseline.py \
  --source .dev/nma-001/source --env-file .env \
  --auth-state .dev/NEW-nma028-auth/private.json \
  --surface application --control-dir .dev/NEW-application-control \
  --output .dev/NEW-application.jsonl
```

`--scenario CASE_ID` may select a fresh whole-family rerun, three repeats. Keep all
previous batches and report why settings/selection changed. Do not substitute
successful pilot cells for failures. Native offline/group use the companion
launcher documented in [native lifecycle evidence](../../../docs/research/nma-028-native-lifecycle.md).
A changed model/provider needs a new paired settings record, not silent pooling.

The controlled-model authenticated stop test is separate:

```bash
HERMES_SOURCE="$PWD/.dev/nma-001/source" \
PYTHONPATH="$PWD/apps/engine/src:$PWD/.dev/nma-001/source:$PWD/apps/engine/tests:$PWD/scripts/spikes/nma028" \
NMA028_AUTH_STATE="$PWD/.dev/NEW-nma028-auth/private.json" \
NMA028_GATEWAY_PROOF_OUTPUT="$PWD/.dev/NEW-gateway-stop-proof.json" \
  .dev/nma-006-closure/runtime/bin/python -m pytest scripts/spikes/nma028/test_gateway_isolation.py -q -s
```

Close only the two recorded browser sessions and stop the loopback auth server
before cleanup. Cleanup revokes/deletes only ledger-recorded disposable identities,
stops the recorded API and drops its temporary database:

```bash
uv run --project apps/backend python scripts/spikes/nma028/auth_fixture.py cleanup \
  --state .dev/NEW-nma028-auth/private.json
```

## Read-only review and replay

`receipt_review.py ATTEMPTS --database /ABS/DISPOSABLE/state.db --output NEW.json`
reads only the matching disposable owner's native terminal receipts and verifies
that original database/WAL bytes stay unchanged. Direct saved final cards do not
need a database argument. Only hashes, canonical lineage and credit-failure flags
are exported; whole private native results are not published.

```bash
.dev/nma-006-closure/runtime/bin/python scripts/spikes/nma028/closure_results.py \
  --batch docs/research/evidence/nma-028-closure/final-direct.jsonl \
  --batch docs/research/evidence/nma-028-closure/final-adapter.jsonl \
  --batch docs/research/evidence/nma-028-closure/final-application.jsonl \
  --batch docs/research/evidence/nma-028-closure/native-lifecycle-groups-recovered-final.jsonl \
  --batch docs/research/evidence/nma-028-closure/native-lifecycle-offline-provider.jsonl \
  --review docs/research/evidence/nma-028-closure/receipt-review-direct.json \
  --review docs/research/evidence/nma-028-closure/receipt-review-adapter.json \
  --review docs/research/evidence/nma-028-closure/receipt-review-application.json \
  --output .dev/NEW-closure-summary.json
```

This only reads JSON and calculates statistics. It rejects duplicate cells or
mixed protocol hashes, preserves original scores, never upgrades provider failures
to passes and fills unexecuted cells as blocked. It starts no gateway, tool,
scheduler or model. Compare its derived bytes with the archived paired summary.

Verify the archived source/evidence hashes without replaying actions:

```bash
.dev/nma-006-closure/runtime/bin/python scripts/spikes/nma028/verify_closure.py
```
