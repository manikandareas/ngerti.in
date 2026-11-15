# NMA-082 deployment and recovery verification

Historical disposable-target report. Current deployment results are in the [main report](README.md).

Captured status: **In Progress**. The owner requested implementation on November 15 and confirmed that no server/domain exists yet. The repository now contains a pinned Ubuntu 24.04 ARM64 deployment profile, HTTPS ingress, systemd/bootstrap, checksum-verified runtime installer, operator backup/verify/restore commands and the [runbook](../../architecture/server-deployment.md). Public deployment, actual Tauri journeys against this target and useful authenticated provider recovery remain open gates.

## Declared setup and evidence boundaries

The disposable OrbStack machine `ngertiin-nma082` runs Ubuntu 24.04.5 ARM64, with two virtual CPUs and a 4-GiB memory limit. Its actual [OS/package versions](target-versions.txt), [runtime/image pins](../../../infra/server/versions.json) and retained [source manifest](local-arm64-manifest.json) define the setup. The two-domain workload uses 768 MiB, one CPU and 512 PIDs per domain, with admission capped at two. This is a measured fixture workload, not a user-count or production-capacity promise. The [listener inventory](listeners.txt), [domain policy](domain-policy.json) and [idle resource sample](resource-sample.json) retain the target observations. The workstation backing the VM reports FileVault enabled; no other server's at-rest encryption is attested.

Production account mode runs under the `ngertiin` systemd account, with a separate non-owner/non-superuser/non-bypass-RLS application login. PostgreSQL, backend and Cua control ports bind loopback. Caddy serves the built web client, account API, SSE, uploads and session-bound viewer media over HTTPS. The lab uses a Caddy local CA trusted per request; no system/browser certificate trust is weakened. The operator control account owns Docker access; organization roles do not.

## Executed cohorts

| Cohort | Result | Proof and limit |
| --- | --- | --- |
| Affected backend tests | 21/21, 132 assertions | [Log](backend-tests.log): bootstrap, authentication/security/schema, viewer authorization and operator config/encryption/authority exclusion |
| Harness and domain regression | 52/52, 225 assertions | [Log](runtime-domain-tests.log): existing native-process/protocol fixtures, selection, isolation, recovery and domain behavior; separate from live provider proof |
| Linux transport/restore rehearsal | 25/25 | [Report](rehearsal.json): real API TLS login/cookie, private routes, two real Cua environments, HTTPS viewer, WSS upgrades, SSE, full 42-table fingerprint restore, private working bytes and newer provider tombstone |
| Stable assets/upgrade/rollback | 8/8 | [Report](upgrade.json): retained home survives explicit container recreation, candidate failure observed, every database fingerprint unchanged by a known pre-data failure, previous release/session resumes, final backup verifies |
| Actual artifact/vault restore | 10/10 | [Report](artifact-restore.json): real upload/download bytes, cross-organization denial before/after restore, encrypted synthetic provider credential and master-key recovery, latest independent tombstone, issuing browser session and two private Computer domains |
| Restore durability follow-up | 10/10 | [Report](artifact-restore-durable.json): exclusive durable backup publication, durable restore intent/environment and filesystem flush before clearing the fence; real artifact/vault/session/domain recovery repeated |
| Restored workspace API | 2/2 | [Report](working-file-restore.json): actual working-file bytes and cross-organization denial after restore |
| Runtime installation | Pass | [Installer](runtime-install.log) verifies all pinned public artifacts and the service restarts; [active-service refusal](runtime-install-active-refusal.log) is separate |
| Linux authentication startup | 80/80 initializations | [Log](schema-startup.log): 40 sequential and 40 in concurrent batches; implemented as two passing tests. The historical intermittent mismatch was not reproduced or diagnosed as fixed |
| Real native adapter protocol | 2/2 | [Report](native-protocol.json): exact Codex/Muse initialize, unauthenticated inspection and close with empty private homes; no credentials, model inference, billing or useful product-tool execution |
| macOS client → Linux ingress | 5/5 | [Report](remote-ingress.json): web/liveness, missing-session denial and private routes through an operator stdio relay, with original certificate identity/chain validation. Direct VM routing and public ingress remain unverified |

The first restore cohort used raw immutable/refresh file fixtures; the later artifact/vault cohort adds real application artifact metadata/HTTP bytes and actual encrypted-vault recovery. The durability follow-up repeats that real artifact/vault restore after adding exclusive, synced publication and a durable startup fence. Its key is synthetic and never sent to a model provider. Native account/provider refresh is not inferred from file or protocol recovery.

The native protocol fixture initially omitted Codex's required private `TMPDIR`; [its initial result](native-protocol-initial.json) is retained separately. The final context includes private HOME/XDG/CODEX_HOME/TMPDIR and no ambient provider credentials. Runtime/binary probes alone do not establish provider capability or useful work.

## Timing and capacity observations

The first full 42-table/two-volume restore command took 3,235 ms. The final artifact/vault restore took 16,806 ms, and cached-host recovery through API validation plus private Computer recreation took 48,760 ms. Its coordinated backup recorded 30,687 ms stopped time. The durability follow-up records 7,625 ms restore, 33,260 ms cached-host recovery through validation and 30,234 ms stopped backup. Other backup/restore timings remain in their own reports; different cache/contention conditions are not combined into an SLO.

These timings exclude provisioning a replacement host, runtime/image download, off-host backup transfer, public certificates/DNS and operator validation. An operational RPO/RTO and off-host retention target have not been selected. Zero restored-table fingerprint mismatches means the chosen snapshot was recovered consistently; it is not zero business-data-loss or complete operational-RTO acceptance.

Two full desktop domains on two virtual CPUs can contend with the control plane: a three-second executable startup probe failed during an early restart. Operator preflight now allows a bounded 15 seconds and reports state/load failures; normal runtime probes retain their original three-second behavior. Keep control-plane headroom when choosing capacity. The shipped bootstrap starts with one domain slot; no arbitrary concurrency claim follows from this rehearsal.

## Reproduction and failure handling

Follow the runbook on a new declared host. Verification scripts in `scripts/verification/nma082/` require `NGERTIIN_DISPOSABLE_REHEARSAL=nma082` before changing the named fixture state. `rehearsal.ts` establishes synthetic verified actors/organizations, exercises real HTTPS/Cua/SSE/WSS, then restores into a new database. `upgrade.ts` explicitly recreates fixture containers with preserved homes on stable operator-owned assets and injects a pre-data startup failure. `artifact-restore.ts` tests application artifacts, credential/key restore and an independent newest tombstone directory. Native and schema probes have their own separate boundaries.

The remote test uses a local operator stdio relay because the isolated VM is not directly routed from macOS. The relay reaches the VM's declared IP interface so its IP certificate can be selected without changing the client-expected hostname. It is a test transport, not a product VPN integration. All HTTP assertions still require normal application authorization. The direct routing failure and the initial loopback/IP-certificate relay failure are not relabeled as public deployment passes.

Development iterations identified and corrected the pinned PostgreSQL image's uid-70 parent-directory requirement, the `libc6-dev` prerequisite and Caddy's directive ordering for private-route denial. One backup attempt returned a Docker failure during concurrent synthetic schema stress; its cause remains unconfirmed. No archive was published, data remained stopped for inspection, and the subsequent isolated complete backup/verify passed. Operator errors now identify controlled stages and exit codes without printing native output or secrets. This report does not claim all attempts passed first time.

Backup/restore refuses an existing destination, another lifecycle authority, inconsistent database selection, foreign/nonempty state, existing domain resources, mismatched key/origin and unknown domain state. Authentication is verified before archive extraction/mutation. Newest provider tombstones are merged, never rolled back. Partial restore preserves a durably published intent that blocks service startup. Backup publication is exclusive and directory-synced; restore flushes filesystem/volume/configuration bytes before durably clearing that fence. An actual power-cut fault injection was not performed. No production data or unrelated workstation installation was reset.

## Checks and remaining gates

Server typecheck/lint, web production builds on macOS and the declared Linux target, shell syntax and Python compilation pass in the retained logs. The web build retains its existing large-chunk warning. The full documentation check retains eight broken links in unchanged imported GPUI guides; a bounded check excludes only those byte-verified unchanged files. The bounded result is separate from the full failure.

Remaining NMA-082 acceptance includes the owner's actual host/domain and certificate/network setup; actual remote web/Tauri journeys on that host; completed native Codex/Muse provider/tool work and refresh after restore; an operational off-host recovery drill with declared RPO/RTO; and target-specific capacity. Optional VPN infrastructure is documented but was not enrolled or tested. General installers, signing/notarization, desktop-rs, managed hosting/billing and arbitrary remote worker enrollment remain outside this milestone.

The [cleanup receipt](cleanup.json) confirms removal of the disposable VM, services, credentials, databases and Cua volumes after evidence capture. The [preservation receipt](preserved-work.json) verifies the preexisting tracked diffs outside the shared backlog index. This leaves no deployed server running and does not complete NMA-083 or installation/production gates.
