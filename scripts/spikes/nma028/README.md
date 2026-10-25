# Native capability baseline

This is disposable engineering tooling for [NMA-028](https://app.notion.com/p/404abdd6187381baa12cdeca39c310b1).
It does not change the product executor, runtime pin, account data or production packaging.
Read [the findings and open gates](../../../docs/research/nma-028-baseline-and-native-contract.md)
and [the source/seam audit](../../../docs/research/nma-028-native-seams.md) before interpreting results.

The checked-in `protocol.json` was frozen before the live runs and any runtime fixes.
Three repeats are a smoke sample. Every planned cell, including unavailable cells,
is retained. The release thresholds require a larger representative corpus in NMA-039.
Use a new protocol ID for changed tasks/settings/oracles/thresholds; preserve unsuccessful attempts.

## Paired real-model smoke run

Use the exact verified Hermes source and the reviewed foundation interpreter with
test dependencies, prepared through `apps/engine/build_runtime.py --tests`.
`OPENAI_API_KEY`, `OPENAI_MODEL` and optional `OPENAI_BASE_URL` are read from the
explicit environment file. No other credentials are passed to the direct gateway.
The adapter fixture imports the same pinned gateway and uses its live provider route.

```bash
runtime=.dev/nma-006-closure/runtime/bin/python
source=.dev/nma-001/source
mkdir -p .dev/nma-028-reproduction
"$runtime" scripts/spikes/nma028/audit.py capture --source "$source" \
  --output .dev/nma-028-reproduction/before.json
"$runtime" scripts/spikes/nma028/audit.py coverage --source "$source" \
  --output .dev/nma-028-reproduction/capabilities.json
"$runtime" scripts/spikes/nma028/baseline.py --source "$source" \
  --surface direct --env-file .env --output .dev/nma-028-reproduction/direct.jsonl
"$runtime" scripts/spikes/nma028/baseline.py --source "$source" \
  --surface adapter --env-file .env --output .dev/nma-028-reproduction/adapter.jsonl
"$runtime" scripts/spikes/nma028/baseline.py --source "$source" \
  --surface application --env-file .env --output .dev/nma-028-reproduction/application.jsonl
```

The application surface uses actual HTTP routing and signed gateway requests with
the existing **fixed disposable account dependency**. Production Clerk authentication
is an explicit unverified prerequisite. Product context/goal tools differ from
native Hermes; these differences are recorded and prevent causal latency claims.
Only five scenario families are automated by this worker; the remaining six
families emit explicit blocked cells. The separate live lifecycle, UI and native
tool evidence supplements them without becoming paired passes.

Output paths must be new. Profiles/databases/logs stay in private disposable `/tmp`
directories. The worker tears down its own processes, and never targets an existing
development or user partition. Test logs and databases may contain credentials;
publish only redacted selected evidence, never the entire profile or environment file.

## Read-only replay

Concatenate the three JSONL files into a new file, then run:

```bash
"$runtime" scripts/spikes/nma028/results.py .dev/nma-028-reproduction/paired.jsonl
"$runtime" -m pytest scripts/spikes/nma028/test_baseline.py -q
```

`results.py` reads JSONL and calculates counts, Wilson intervals and nearest-rank
p50/p95 with sample sizes. It rejects missing/duplicate cells and mixed protocol
hashes. It cannot invoke gateways, browsers, models or tools. `--rescore` emits
derived JSONL from retained native todo results, preserving the prior score; this
was used to correct the initial scorer's handling of native `tool_call` batching.
It never re-executes the recorded action. Do not merge successive live batches
into one selected sample; report all batches and instrumentation corrections.

## Native browser and terminal research container

The Dockerfile verifies the exact source archive and upstream lock inputs. It
includes `browser-harness`/`fetch-use` for research and excludes only unrelated
HEIF support. **The missing fetch-use notice remains a distribution blocker.**
This image is local research evidence and must not be pushed/deployed as a release.
Debian Chromium is selected through local CDP; the exact apt/package versions,
image digest and probe hash are recorded in the evidence inventory.

```bash
docker build -f scripts/spikes/nma028/Dockerfile -t ngertiin-nma028-research:local .
docker run --rm --name ngertiin-nma028-native --network none --read-only \
  --cap-drop ALL --security-opt no-new-privileges --pids-limit 512 \
  --memory 2g --cpus 2 --shm-size 512m \
  --tmpfs /work:uid=10001,gid=10001,mode=700 --tmpfs /tmp:mode=1777 \
  --tmpfs /home/probe:uid=10001,gid=10001,mode=700 \
  ngertiin-nma028-research:local > .dev/nma-028-reproduction/native.json
```

Wait for the build to finish before running the image. The probe calls the actual
native tools using fixed Python, a synthetic loopback form and file bytes, with
separate action/observation checks. It makes no model requests. Chromium uses
`--no-sandbox` inside the outer disposable container. There are no host mounts,
Docker sockets, provider keys or external network access. A writable private home
is required for Chromium crashpad, even with a separate user-data directory.

The synthetic control-file canary deliberately proves that **same-UID runtime
files remain readable by browser Python**. This is a negative security control,
not a successful secret-isolation test. Do not put real runtime secrets in this
container. Browser Python uses urllib for the CSV transfer; browser-managed
download events/attachments remain an unverified operation.

## Real model through the production UI components

```bash
"$runtime" scripts/spikes/nma028/ui.py --source "$source" --env-file .env \
  --output .dev/nma-028/ui.json
```

In another terminal, link `apps/engine/tests/browser/node_modules` to
`../../../web/node_modules` if absent, then start:

```bash
bun apps/web/node_modules/vite/bin/vite.js --config apps/engine/tests/browser/nma028.config.ts
```

Open `http://127.0.0.1:3028`, open the baseline-browser DM and use the synthetic
httpbin form prompt recorded in the report. This provisions real E2B resources
through the existing bridge and makes live provider requests. Capture the UI,
native tool results and effect receipts. Fixed-account authentication remains
explicit; never point this harness at an existing account partition. Stop the UI
client/proxy, then terminate `ui.py`; its finalizer records the snapshot/diagnoses
and deletes the disposable browser resource. Remove only a symlink created for
this run. Existing development services and historical evidence stay intact.
