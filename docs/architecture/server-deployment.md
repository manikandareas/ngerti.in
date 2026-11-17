# Single-server deployment and recovery

NMA-082 implements the owner-operated profile in `infra/server/`. Its [verification report](../development/history.md#verification-archive--2026-11-17 "Archive: docs/verification/nma-082/README.md at 043f7c9") owns the executed results and remaining gates. The owner selected SSH alias `mamvps` and `https://demo.ngerti.in` on November 15, 2026. That existing Ubuntu 24.04 AMD64 host uses the [shared-host profile](../../infra/server/shared-host/README.md), preserving Dokploy/Traefik and unrelated applications. The historical disposable ARM64 rehearsal and actual deployment are recorded separately in the report.

## Profile and storage

The [version manifest](../../infra/server/versions.json) pins Ubuntu 24.04 ARM64, Bun 1.3.10, PostgreSQL 18.1 Alpine, Caddy 2.11.2, Codex 0.169.0, Muse 1.4.14-R7309.1/SDK 1.4.14, Cua SDK 0.10.1 and the existing Cua image/observed spacesd 0.8.0/Driver contract 1. Executable downloads have SHA-256 pins; container references include immutable digests. The [AMD64 manifest](../../infra/server/versions.amd64.json) selects the architecture-specific official artifacts with the same runtime tuple and immutable multi-platform image index. The selected AMD64 profile has current deployed evidence. ARM64 retains its earlier disposable cohort; the final runtime tmpfs/readiness delta was physically reverified on AMD64 only. Other architectures remain unverified. Retain the exact checkout, lockfile, binary checksums, OS/packages and configuration with each installation and backup.

The backend runs under one systemd unit. PostgreSQL and HTTPS ingress use Docker Compose. The backend's existing execution-domain resolver creates private Cua containers; the application, database, provider homes and Docker socket never enter those domains. The `ngertiin` service account has Docker control-plane access and is an infrastructure-trusted principal, not an organization Admin. Restrict SSH/operator access accordingly.

| Location | Purpose |
| --- | --- |
| `/opt/ngertiin/releases/<revision>` | Immutable source, lockfile, dependencies and web build |
| `/opt/ngertiin/current` | Operator-selected release symlink |
| `/opt/ngertiin/bin` | Checksum-verified native runtimes and Codex resources |
| `/opt/ngertiin/machine-assets` | Stable root-owned Cua startup assets; checked against each selected release |
| `/etc/ngertiin/server.env`, `compose.env`, `operations.json` | Private configuration; never commit or include in diagnostics |
| `/etc/ngertiin/backup.key` | Binary 32-byte AES-256-GCM backup key; escrow independently of backups |
| `/srv/ngertiin/state` | Installation identity, artifacts, native/provider state and domain bindings |
| `/srv/ngertiin/trust/provider.key` | Binary 32-byte provider encryption key |
| `/srv/ngertiin/trust/revocations` | Monotonic provider revocation tombstones, outside state rollback |
| `/srv/ngertiin/postgres` | Dedicated PostgreSQL storage; pinned image's uid/gid 70 owns its parent |
| `/srv/ngertiin/tls` | Caddy certificates and issuer state; root-owned private directory |
| Docker volumes `ngertiin-domain-<UUID>-home` | Retained private home/browser/working data |

Verify encryption at rest for `/etc/ngertiin`, `/srv/ngertiin` and Docker's data root before setting `NGERTIIN_PROVIDER_NATIVE_STORAGE=encrypted-volume`. File modes are not encryption. The selected VPS stores application state, configuration, PostgreSQL, temporary files and its dedicated engine/domain homes on a reserved LUKS2 filesystem. Its unlock key stays on the operator's FileVault-protected Mac; a VPS reboot requires operator-assisted unlock using the shared-host runbook. Existing unrelated services and public source/binaries remain outside that encryption scope. Keep the latest revocation ledger in independently retained storage, including tombstones newer than a backup. Protect and escrow the backup key separately; losing it makes encrypted backups unrecoverable.

## New-host setup

These commands are for a new dedicated host. Do not repurpose another application's database, Docker volumes or service. Select an exact reviewed checkout under `/opt/ngertiin/releases/<revision>`; preserve any existing installation and keys. The release needs all workspace package manifests, server/web sources, avatar, machine assets, `package.json` and `bun.lock`.

```sh
sudo apt-get update
sudo apt-get install docker.io docker-compose-v2 ca-certificates curl python3 libc6-dev
sudo systemctl enable --now docker
sudo python3 infra/server/install-runtime.py
/opt/ngertiin/bin/bun install --frozen-lockfile
/opt/ngertiin/bin/bun run build:web-client
sudo bash infra/server/bootstrap.sh "$PWD" ngertiin.example.com
```

`libc6-dev` is required by Bun's compiled descriptor-relative `openat.c` boundary. Bootstrap creates private configuration, fresh secrets, one initial domain slot and the service unit. It preserves existing keys/configuration and refuses a different active release. The initial `max_domains=1`, 1024 MiB, one CPU and 512-PID limits are admission configuration, not measured host capacity. Tune only after a declared workload measurement with capacity reserved for the control plane.

Runtime installation refuses an active application service or a different installed version. Cua assets live outside release directories so existing Docker bind mounts survive a code release switch. Changed asset content fails preflight and requires a coordinated domain recreation with its retained home preserved.

Complete `/etc/ngertiin/server.env`: public HTTPS origin, verified email sender/Resend key and verified encryption attestation. Its native callback is exactly `http://127.0.0.1:43119/callback`; remote Tauri uses its system browser and native secure store. Preserve the same origin in DNS, certificates, authentication issuer/resource and clients. Set `NGERTIIN_SERVER_HOST` in `compose.env` to that hostname. Public DNS points to the host and TCP 80/443 reaches Caddy; UDP 443 is optional HTTP/3. Leave `NGERTIIN_SERVER_TLS` empty for automatic public certificate issuance.

```sh
sudo docker compose --env-file /etc/ngertiin/compose.env -f /opt/ngertiin/current/infra/server/compose.yaml up -d postgres
sudo docker pull ghcr.io/trycua/linux:24.04@sha256:9ac0d6f6f7dd95392554ec95163f83c5061de3db05b64977696c78d71cd4861c
cd /opt/ngertiin/current
sudo /opt/ngertiin/bin/bun apps/server/src/operations/cli.ts database-login /etc/ngertiin/operations.json
sudo /opt/ngertiin/bin/bun apps/server/src/operations/cli.ts check /etc/ngertiin/operations.json
sudo systemctl enable --now ngertiin
sudo docker compose --env-file /etc/ngertiin/compose.env -f infra/server/compose.yaml up -d ingress
```

The dedicated application login has no superuser, database/role creation, replication or RLS bypass capability and belongs to `ngertiin_runtime`. Login provisioning refuses to overwrite an existing role. Startup checks the declared platform, native filesystem boundary, account/encryption configuration, pinned executables and Cua image, policy and database availability. Operator executable probes have a bounded 15-second deadline; normal application probes retain their existing three-second deadline. A version or capability failure never selects another runtime or billing lane.

Create/verify the intended account, issue its bootstrap grant with `sudo /opt/ngertiin/bin/bun --env-file=/etc/ngertiin/server.env apps/server/src/auth/operator.ts issue-owner <email>` in a private operator terminal, then consume it through the existing account bootstrap flow. The command intentionally prints a one-time secret; do not send it to logs or evidence. Use the existing guarded legacy binding only for the installation's intended organization/owner. Normal clients cannot grant themselves bootstrap or infrastructure access.

## Ingress and client checks

Only Caddy's application ingress is public. Backend port 8000, database port 55482 and each Cua endpoint bind host loopback. The proxy denies `/v1/harness/tools` and `/health/ready`; its admin API is disabled. There is no public Docker/harness/Driver transport. Do not open database/control ports in a firewall or VPN ACL. Keep the host service and Docker socket inaccessible to execution domains.

Caddy preserves SSE flushing and WebSocket upgrades without buffering entire responses. Its request-body ceiling is 24 MiB; the backend retains narrower non-upload limits. Forwarded host/protocol values are overwritten at ingress. The account-mode viewer binds its HTTPS base to configured server identity and exact public Host, with live issuing-session/domain grants; it does not derive trust from arbitrary forwarding headers. See the [Caddy proxy reference](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy) and [body-limit reference](https://caddyserver.com/docs/caddyfile/directives/request_body).

Exercise certificate validation, browser login, native PKCE/renewal, authenticated SSE, upload/download and viewer media/input over WSS from the actual remote clients. Deny missing/other-device viewer credentials and revoke existing media on logout/removal. A `curl --cacert` or Bun request-scoped CA is suitable for a disposable lab; never disable certificate verification or ship the lab CA configuration as public HTTPS acceptance. Local browser/Tauri evidence from NMA-080/081 retains its original scope.

## Coordinated backup

Reserve space for state/volume archives, a plaintext bundle and its encrypted copy during the operation (at least three times the measured uncompressed payload plus database/temp headroom). Temporary plaintext stays in private storage on the verified encrypted filesystem and is removed in `finally`. Arrange an off-host encrypted backup destination/copy and independently retained latest tombstones; the shipped command does not silently configure cloud storage or a scheduler.

```sh
cd /opt/ngertiin/current
sudo /opt/ngertiin/bin/bun apps/server/src/operations/cli.ts backup /etc/ngertiin/operations.json /srv/ngertiin/backups/CHOOSE-NEW-SNAPSHOT.ngb
sudo /opt/ngertiin/bin/bun apps/server/src/operations/cli.ts verify /etc/ngertiin/operations.json /srv/ngertiin/backups/CHOOSE-NEW-SNAPSHOT.ngb
```

The operator lock serializes maintenance. Backup stops the named systemd service, acquires the same PostgreSQL authority lock as the application, attests the installation's recorded domains and stops only its running containers. Unrecorded, missing, uncertain or isolation-mismatched domains fail closed. It captures application/authentication schemas, row counts/order-independent row fingerprints, immutable/native state, environment, provider key/tombstones and every retained domain home. Full authentication/credential-bearing bytes are encrypted with streaming AES-256-GCM before a new destination is exclusively published and directory-synced. The key is excluded. Ciphertext, manifest inventory and each component digest are checked by `verify` before restore.

The `.ngb.json` sidecar contains only snapshot time, ciphertext digest, table/domain counts and observed stopped duration. It is written after backup completion. If subsequent service restart fails, the completed backup remains available; inspect service status and verify the archive rather than rerunning against the same filename. Failed/uncertain maintenance remains stopped for inspection. `backup-offline` performs the same operation and deliberately leaves backend/domains stopped for cutover or upgrade. Existing unrelated state is not included or deleted.

This is a coordinated cold snapshot. Live processes and external effects do not roll back. Cua restore recreates the pinned OS and restores `/home/cua`; packages or files installed outside that retained home are not a full-machine image backup. Native refresh bytes in state are included. The deployed drill separately verifies restored byte identity, an actual Codex access/refresh-token rotation, and useful post-restore work from both selected providers. Refresh-token rotation may invalidate an older native authority snapshot: after rotation, take and escrow a new coordinated snapshot before relying on recovery. Keep the former local Ngertiin backend stopped; the selected VPS owns the copied application-managed Codex authority. Global Codex application credentials were not migrated.

## Restore and cutover

Use a fresh declared host/database, the matching source release and the original public origin/state layout. Provision the dedicated restricted login first. Configure `operations.json` and its target environment for the new database. State must be absent/empty; both application/authentication schemas must have no tables; named restored domain containers/networks/volumes must be absent. The command refuses overwrite rather than deleting an installation. Keep old infrastructure stopped and retained until comparison is complete.

```sh
sudo /opt/ngertiin/bin/bun apps/server/src/operations/cli.ts restore /etc/ngertiin/operations.json /srv/ngertiin/backups/VERIFIED-SNAPSHOT.ngb /PATH/TO/INDEPENDENT-LATEST-REVOCATIONS
sudo /opt/ngertiin/bin/bun apps/server/src/operations/cli.ts check /etc/ngertiin/operations.json
```

Restore authenticates the entire envelope before extraction or database mutation, verifies installation/schema/domain identity and component hashes, and unions snapshot/current/independently retained tombstones. A different existing provider master key or changed public issuer is rejected. PostgreSQL restore is one transaction into empty schemas; restored table fingerprints must match exactly. It preserves logical domain IDs and private volume associations while clearing obsolete physical container IDs for explicit pinned-image recreation. Target database/path/binary settings are retained while original authentication secret and saved state are recovered. Environment/trust predecessors remain private recovery copies. The restore intent and environment are written atomically with file/directory sync; restored filesystems/volumes are flushed before clearing the fence. Startup is blocked by a retained restore-intent file after any partial failure: inspect the named database/volumes before explicitly reconciling that intent, never blindly retry.

Before starting the backend, compare recovered actor/organization IDs and reconcile membership/offboarding changes after the snapshot against independently retained current operator records. Goals/Routine can resume as soon as the backend starts; do this offline first. Then start `ngertiin` and compare events/receipts/history, artifact and working bytes, per-domain browser/profile data, credential identity, newest tombstones and useful native provider refresh before reopening ingress/cutting over DNS. Reconcile membership/offboarding changes after the snapshot against current operator records within the declared RPO; restoring an older database cannot recover changes that were never backed up. Keep one lifecycle authority and never merge divergent writers. Preserve the former deployment/database/volumes until the cutover is accepted.

The authenticated domain profile now requires a 64-MiB tmpfs at `/run` and native desktop capability. When upgrading an older retained container, first take `backup-offline` with its compatible old release, explicitly retire only its attested container/network while retaining its named home, durably clear that configuration's physical ID to phase `new`, then recreate under the new release. Keep the logical ID, generation, token and home association. Do this while the backend is stopped and its offline PostgreSQL authority is held; do not change a live container or bypass failed attestation. Recheck exact working bytes, desktop capability and media after a stop/start. The bounded deployed upgrade script and report retain the executed procedure.

## Upgrade and rollback

1. Stage a separate reviewed release with its frozen dependencies and web build. Make public release files readable/traversable by the service account (`chmod -R a+rX` on the secret-free release only), then run preflight as that service account before cutover. Use the declared runtime pins; native runtime updates require compatibility verification and retained previous binaries.
2. Take and verify `backup-offline`. Preserve its source/config/version record and latest tombstones. Backend and domain processes remain stopped throughout cutover.
3. Atomically replace `/opt/ngertiin/current` with a symlink to the candidate release. Force-recreate only the named ingress container so its resolved release bind mount changes, then start the one systemd service. Check migrations, authority, login, events, artifacts and Computer before reopening clients.
4. On failure, stop the candidate. Keep failure diagnostics redacted. Do not attempt hand-written down migrations or start an old binary against an uncertain newer schema. Restore the verified pre-upgrade database/state/trust/domain set into a fresh target using the previous release, compare it, then cut over with the failed authority stopped.
5. Only a demonstrated failure before any data/native effect permits a simple code symlink rollback on unchanged data. The rehearsal records this bounded case separately from its full snapshot restore; it does not claim arbitrary migration downgrade compatibility.

## Health, capacity and recovery objectives

Monitor systemd result/restart count, private liveness, database/authority health, available encrypted storage, backup age/verification and domain count/resource usage. Read detailed readiness only as the authenticated bootstrap operator. Never publish environment files, Docker `Config.Env`, native homes, cookies, provider tokens or raw database error objects as diagnostics.

Declare a workload and measure control-plane CPU/RAM, per-domain peaks, queue/admission behavior and command/event latency before increasing `max_domains`. CPU-bound desktops can delay executable probes; reserve control-plane headroom. Capacity rejection remains explicit, and an unavailable isolated domain never falls back to a shared machine. Use graceful named-container administration; do not run broad prune or `down -v` operations.

RPO is the interval since the latest durable off-host verified snapshot, plus any failed transfer; this full-snapshot setup has no automatic PITR claim. RTO includes host/runtime provisioning, decryption, database/volume restore, domain startup, validation and network cutover. The report separates measured local restore time from a complete operational RTO. Add PostgreSQL WAL/PITR and coordinated blob/domain recovery only when a selected recovery objective requires that further implementation.

The NMA-081 authentication-introspection failures remain unconfirmed. Mismatch diagnostics now expose only five category counts, never schema data or credentials. Run isolated and concurrent startup probes on the selected target; preserve an actual mismatch before diagnosing or weakening the exact-schema check. No retry hides a schema incompatibility.

On pinned Bun 1.3.10, an authenticated server-closed media socket can leave `pendingWebSockets=1` after the client is closed and `pendingRequests=0`, preventing the ordinary listener stop promise from settling. The account edge has a version-specific adapter: revoke viewers first, force-close connections, require actual HTTP requests to drain within five seconds, preserve awaited lifecycle hooks and unreference the stopped listener. Other Bun versions retain the ordinary adapter. The deployed report records the initial systemd timeout, focused reproduction, regression and corrected live stop measurement. A shutdown failure remains an operator inspection condition; no new writer may start until the former process and PostgreSQL authority are gone.

## Optional private networking

An operator may put the same HTTPS hostname behind VPN/Tailscale, with independently managed membership, ACLs, DNS and certificates. Keep application login, scoped grants and viewer issuing-session checks in either topology. There is no mandatory VPN SDK, remote worker enrollment, managed hosting/billing or client installer change in this milestone.
