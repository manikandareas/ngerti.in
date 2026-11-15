# Execution domains — NMA-076

Contract **1.33.0** adds durable organization/user execution domains to the retained Cua integration. [The verification report](../verification/nma-076/README.md) separates PostgreSQL/HTTP fixtures, native Cua, native harnesses and remaining delivery gates. [The main plan](server-organizations-plan-2026-11-12.md#8-agent-sharing-memory-and-files) owns the product privacy model.

## Resolution and persistence

`machines/domains.ts` resolves exactly one `execution_domain` per `(organization_id, user_id)`. PostgreSQL migration 3 adds a unique principal index and a deferred guard requiring every scoped `machine_id` reference to match both organization and actor. It leaves migrations 1 and 2 unchanged. The guarded legacy binding flushes the additive deferred guard before re-enabling its original trigger.

Domain identity and generation are durable application records. States are `pending`, `provisioning`, `ready`, `offline`, `missing`, `failed` and `retired`. `ready` describes the retained environment; the machine projection separately validates spacesd/Driver capabilities. A capacity or isolation failure is exposed through the domain and machine error codes. Configuration is private operator state under `execution-domains/<domain-id>.json`; tokens and endpoints are absent from entity/event projections.

Resolution creates metadata without starting Docker. The first native operation lazily provisions the retained environment after explicit operator setup. A persisted `creating` intent precedes external provisioning. Missing or uncertain environments require operator reconciliation: they cannot become a fresh empty machine, nor fall back to the legacy shared desktop. Retained container IDs, image, mounts, namespace/network configuration, credentials and resource limits are attested before native access; successful attestation is cached for at most one second. A changed endpoint invalidates the SDK client before reattachment.

Each domain has a named home volume, its own browser profile, PID/IPC/network namespaces, private control token, loopback control port and resource limits. Containers use the pinned full Cua image, default Docker seccomp/capability constraints, explicit dangerous-capability drops and `no-new-privileges`. The only host bind mounts are the three fixed, read-only browser startup/policy assets. Backend data, host homes, provider homes, installation credentials and the Docker socket are not mounted.

NMA-082 adds an attested 64-MiB `noexec,nosuid,nodev` tmpfs at `/run` so Docker stop/start cannot reuse stale X/DBus session files. Authenticated domain startup requires native `desktop_stream` support before publishing readiness; healthy control HTTP alone is insufficient. Existing containers require an explicit operator recreation with their named home volume retained. The [deployed report](../verification/nma-082/README.md) records the original startup race, two-domain recreation and repeated restart proof.

This is container isolation on a trusted operator's kernel, not hypervisor certification or protection against the infrastructure administrator. Cua control authority is trusted within its own domain. The same human's authorized agents cooperate inside that domain; their working copies and browser state are mutually visible. Conversation provenance, private metadata and immutable artifact bytes retain their separate application scope.

## Files, processes and adapters

Workspace binding, working-file reads/writes, attachment materialization, terminal processes, native browser targets and Computer resolve through the same domain. New scoped requests never return the installation-wide machine. Existing legacy records and bytes are preserved; they do not implicitly authorize importing a host project or mounting the former shared home. Logical workspaces remain conversation-scoped even when their working root is shared by that human's agents.

Asynchronous collectors use a resource context bound to the principal and authorization generations, independently of the initiating login session. Database access keeps the membership fence. Product-tool leases capture that context, restore it on loopback MCP calls, reject a conflicting caller scope and recheck current grants. Backend/client shutdown detaches process handles; it does not destroy containers or volumes. Native process ledgers and output offsets support reattachment. Cancelling one run signals its attributed process group, leaving other domains running.

Codex continues to disable native shell/unified exec and deny host work-file writes through its permissions profile. Muse retains the MCP-only toolset and disabled native shell/write tools. Harness control directories and provider credentials remain on the trusted backend. Session instructions name the authorized domain and its cooperative limit.

NMA-077 verifies private provider credential routing. NMA-078 supplies app/MCP/skill isolation and NMA-079 verifies normal scoped `claimNext`/broker execution at [contract 2.0.0](server-organizations-api.md), with [fresh native Cua/provider evidence](../verification/nma-079/README.md). NMA-076's native adapter probe uses a single-owner fixture attached to an environment resolved for a fixture principal. It proves useful native tool execution and absence of the requested forbidden host write; it does not claim public multi-user provider admission.

## Viewer and input authority

The gateway resolves opaque viewer handles to one machine instance. Tickets bind machine generation, user, issuing device session, organization, allowed file root and input-lease revision. Account-mode HTTP requests and media upgrades must authenticate as the issuing session; possession of a copied viewer URL alone is insufficient. An explicitly supplied organization header cannot retarget the view.

Interactive tickets require that same session's human lease. Control receipts include session identity in their fingerprint. Stale revisions and another session's release are rejected. Read-only viewers reject clipboard mutation and filesystem RPCs; Cua's ticket policy independently enforces those restrictions. Normal handback revokes interactive media before granting new input. Session revocation aborts existing proxy bodies and peers, and the membership/generation sweep closes affected media even when machine-state maintenance is itself denied. The private native `CloseMedia` path remains usable after normal authorization is revoked.

The retained viewer media bridge is local loopback transport, as in the earlier Cua baseline. This milestone verifies its scope and revocation. Remote HTTPS/WSS ingress, proxy routing and actual remote Tauri consumption retain **NMA-081/082** gates; local native/fixture evidence does not establish deployed transport readiness.

## Operator setup and recovery

After measuring the intended host, explicitly select limits, for example:

```sh
bun run setup:execution-domains --max-domains 2 --memory-mib 768 --cpus 1 --pids 512
```

The command exclusively creates a private `execution-domains.json`; it does not provision, replace or delete machines. All limits are required and validated. Two 768 MiB environments were exercised on the declared OrbStack host; this example is not a production capacity guarantee. Admission counts retained containers, including stopped ones. Changing an existing environment's configured CPU/memory/PID envelope without reconciling its native configuration fails attestation.

Keep application PostgreSQL state and the private domain configuration together with the named home volumes and retained container identity. `missing` or an interrupted `creating` intent requires inspection of the exact labeled container/network/volume before explicit repair. Never remove the intent file to obtain an implicit replacement. Retiring an environment is an operator operation, outside the agent catalog: the native boundary verifies ownership/identity, removes only that container/network and retains the named home volume. Deleting retained data requires a separate deliberate operator action. Fixture cleanup removes only its own labeled resources.

NMA-079 owns the expanded API readiness gate; NMA-080/081 own real web/Tauri journeys; NMA-082 owns deployment/restore; NMA-083 owns integrated multi-organization acceptance. Desktop-rs source was retired by the November 15 owner cleanup; historical evidence is retained.
