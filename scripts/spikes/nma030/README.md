# Native capability and routing acceptance

Run from the repository root. These harnesses create only disposable owner state; real-provider calls use private fixed-model relays to existing configured accounts. The existing product gateway remains the sole actual credential refresh writer. Never put secrets in public evidence or use a production Clerk key for the development authentication fixture.

## Contract and native isolation suites

```sh
HERMES_SOURCE="$PWD/.dev/nma-001/source" \
NMA_TEST_RUNTIME_PYTHON="$PWD/.dev/nma-040/production/bin/python" \
NMA_TEST_NATIVE_IMAGE="$(docker image inspect ngertiin-native-tools:local --format '{{.Id}}')" \
PYTHONPATH="$PWD/apps/engine/src:$PWD/.dev/nma-001/source" \
.dev/nma-008/runtime/bin/python -m pytest apps/engine/tests -q

uv run --project apps/backend python -m unittest discover -s apps/backend/tests -p test_agent_engine.py -q
make check
make build
python3 scripts/check_docs.py
```

Build/verify the image and source through the [operator report](../../../docs/research/nma-030-native-capabilities-routing.md). Run native gateway suites serially. The full suite's optional real-provider/Clerk/E2B cases remain explicit opt-ins; they are not counted as live passes by running the default suite.

## Actual provider and Clerk walkthrough

1. Use `scripts/spikes/nma028/auth_fixture.py prepare/start` with a new private state path and a new local database. Configure `WEB_ORIGIN` for the dedicated fixture origin. Its documented cleanup deletes only the recorded test users/database.
2. Start `clerk_browser_auth.py` against that private state and authenticate both actual ClerkJS users. It records production `current_account` verification and keeps JWTs private. Use the pinned Browser Harness/agent-browser session controls; no backend authentication dependency is overridden.
3. Export only connection metadata to a mode-0600 private file: an array of `{owner, partition_file, connections}`. Each connection row contains only `connection_id`, `provider`, `status` and model IDs. `provider_relay.py --metadata FILE --private-output NEW_FILE --evidence NEW_FILE` chooses existing connected ChatGPT/OpenRouter routes, preferring OAuth. It reads credentials under the original vault lock and delegates refresh to the existing signed gateway command. It never writes provider credentials into disposable partitions.
4. Run `live_acceptance.py --auth PRIVATE_AUTH --routes PRIVATE_ROUTES --private NEW_DIRECTORY --evidence NEW_DIRECTORY` using the native test interpreter and the same Hermes/PYTHONPATH environment. It performs a fresh 8-case batch and keeps its disposable gateway available until SIGTERM for the UI walkthrough. Use fresh evidence paths for every changed route; retain failures and review each oracle. The harness deletes its disposable relay credentials at shutdown.
5. `native-routing.config.ts` mounts the actual production Agents components with actual Clerk tokens and the production backend. Only router/auth-hook plumbing is supplied by the fixture. Its fixture paths/ports are deliberately local and must be adjusted for another new batch. Create its temporary `node_modules -> ../../../web/node_modules` symlink only when absent and remove only that symlink afterward.
6. `owner_isolation.py --help` describes the separate two-owner boundary run. Use the dedicated connection-model API when testing foreign refresh; a disallowed generic command's 422 is not evidence for the intended 404 boundary.
7. Stop each owned helper, close only the created browser sessions and run the recorded auth fixture cleanup. Retain only public redacted evidence and private backups. Never stop or delete the original user partition.

## Offline preservation rehearsal

Stop ingress and the disposable gateway first. The existing backup implementation takes the owner locks and verifies complete file/SQLite inventories. This script compares every domain table's rows and retains restore quarantine:

```sh
PYTHONPATH="$PWD/apps/engine/src:$PWD/.dev/nma-001/source" \
.dev/nma-040/production/bin/python scripts/spikes/nma030/restore_rehearsal.py \
  --home /path/to/stopped/partition \
  --private .dev/new-private-restore-directory \
  --evidence /path/to/public-redacted-result.json
```

Use fresh destinations. Keep private snapshots mode 0700 and reconcile external capsule volumes, secrets and unknown effects separately before any restore activation. This rehearsal never activates a restored partition.

The [report](../../../docs/research/nma-030-native-capabilities-routing.md) and [verification manifest](../../../docs/research/evidence/nma-030/verification.json) distinguish fixtures, fresh real-provider samples, failed attempts, final-source compatibility changes and outstanding release gates.
