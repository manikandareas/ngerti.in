# ACP native context, output and account domains

Date: 2026-11-16. Status: **this Codex cohort passed; the full multi-profile migration remains In Progress**. This follows the immutable [source cutover/shared-picker capture](../cutover/README.md). The [migration checklist](../../../architecture/acp-harnesses.md) owns the remaining gates; native Claude remains unverified by owner choice.

## Corrected publication behavior

The legacy `Artifacts.publish` guard required `run.native_run_id`, preventing an otherwise authorized ACP run from publishing requested output. A new [regression first failed with `SCOPE_DENIED`](artifact-before.log). Publication now requires the application binding and current running dispatch authority. Provider turn identity remains nullable in artifact provenance. No RPC ID or dispatch receipt is substituted for it. Existing workspace/grant checks, reauthorization before publication, immutable bytes and run/path/hash deduplication remain enforced.

The already-nullable 2.3.0 artifact schema is unchanged. This is an execution correction, not a new public field. The [workspace contract](../../../architecture/workspace-artifact-api.md) records the authority boundary. The full affected file/attachment cohort passed **35/35 tests, 249 assertions**: local workspace publication/retry/stop/restart/revocation/symlink negatives, attachments and organization/group attachment scope. [Regression](regression.log), [server typecheck](typecheck.log), [changed-source checks](source-check.log), [docs checks](docs-check.log).

## Real Codex context and research

One managed Codex ACP **2.6.0** / native Codex **0.169.0**, SDK **2.7.0**, wire **1** test completed four turns with **57 assertions**. [Result](native-context.json), [log](native-context.log). It uses the retained explicitly selected subscription, short-lived access token only, disposable owner-mode PostgreSQL, real HTTP ProductTools and app-owned local files. It does not copy a refresh token, change the retained authority or switch billing. Exact executable and affected-source SHA-256 values are in the result.

| Turn | Observation |
| --- | --- |
| DM file output | Native inference read the private source through `ngertiin.read_file`, created output and published an artifact. Persisted bytes and authenticated download exactly matched the random source bytes. Provider-native turn ID remained null. The group workspace download was rejected with 403. |
| Changed instructions | Changing persona and workspace guidance produced a new native session and instruction revision. The answer used both new words, excluded their obsolete values and remembered the prior published filename through authorized thread history. |
| Same agent in a group | A distinct native session read the group's own same-named file. The answer contained the group source and current persona, excluded DM memory/source/workspace words, and used the scoped memory-list tool. No Goal or Routine was created. |
| Native research | A completed native search produced an answer with `sessionId`, `mcpServers` and a direct HTTPS Markdown citation to the [official ACP session guide](https://agentclientprotocol.com/protocol/v1/session-setup). The guide was independently opened for the expected facts. This certifies the native search observation and final direct link; `run.sources` remained empty, so no dedicated Sources-panel acceptance is claimed. |

After process shutdown, the private fixture files were scanned for the provider access-token bytes: absent, with zero oversized files skipped. This is a scan of those verification files, not a general claim against a trusted server operator or arbitrary native process memory access.

## Two application users and real Cua domains

The account-mode journey passed **one test, 40 assertions**. [Result](native-accounts.json), [log](native-accounts.log), [executed source](native-accounts-executed.ts.txt). It uses two synthetic verified app accounts, one organization and the same persistent Team agent. Both disposable connections explicitly use the **same selected provider subscription**. This proves the app-user and execution-domain boundary for that provider identity, not two distinct vendor accounts or provider-account switching.

Each user used normal authenticated HTTP selection/admission and a separately provisioned real Cua domain. The source path was the same (`source.txt`), with different random bytes. Both native runs completed `read_run_context`, file read, file creation and publication; authenticated downloads matched their own source. The other app user received 404 for the private conversation and artifact. Domain IDs, bindings and native sessions were distinct, and each admitted run retained its own selected connection and subscription billing.

Revoking the first user's disposable selected connection then rejected another admission with **403**, without another token request and without selecting another provider or billing route. This covers a settled connection revoke; an in-flight late callback and actual provider-token expiry/renewal remain separate gates.

Native storage readiness used the existing development FileVault check. FileVault was observed On, and no `NGERTIIN_PROVIDER_NATIVE_STORAGE` operator override was present. Cua provisioning uses the existing pinned `DomainRuntime` image/configuration and attestation; native harnesses remain on the backend, with working files in the user's Linux domain. The six owned container/network/volume resources were verified absent after cleanup. [Cleanup audit](cleanup-audit.json). Unrelated machines, volumes, user data and credentials were preserved.

The executed fixture redundantly tried to remove each network after `DomainRuntime.retire` had already removed it, so its raw report records `removed:false` for those second removals. The separate audit verifies absence. The current fixture reports the successful combined container/network retirement directly; that cleanup-report-only change followed the accepted run. The executed source snapshot preserves the actual variant used.

## Retained attempts and source

The first account fixture omitted native session preparation after seeding a synthetic unauthenticated connection. Admission correctly remained queued with `LOGIN_REQUIRED`, without a provider/tool call. Adding the normal `/sessions` preparation produced the accepted journey; this was fixture setup, not a relaxed production gate. [Attempt result](accounts-setup-attempt.json), [attempt log](accounts-setup-attempt.log).

The [manifest](manifest.json), [compressed source archive](source.patch.gz) and [archive receipt](source-archive.json) capture the current affected source against Git `8e92fda1c581c8dc363de16a8d3b4870e09ad1f9`, including retired paths and the artifact correction. Apply and every reconstructed source hash are checked using a private temporary index. The existing cutover archive and older raw evidence remain unchanged. No commit, push, deployment or fresh-device installation is claimed.

```sh
bun scripts/verification/nma072/run-tests.ts tests/workspaces.test.ts tests/attachments.test.ts tests/organizations/attachments.test.ts tests/groups/attachments.test.ts
NGERTIIN_ACP_NATIVE_CONTEXT=1 bun scripts/verification/nma072/run-tests.ts ../../scripts/verification/acp/native-context.test.ts
NGERTIIN_ACP_NATIVE_ACCOUNTS=1 bun scripts/verification/nma072/run-tests.ts ../../scripts/verification/acp/native-accounts.test.ts
bun scripts/verification/acp/capture-native-context.ts
```

Remaining limits include native Claude by owner choice, OpenAI API-key quota blocking the OpenCode/Pi inference comparison, the same native cohort across both Pi candidates, distinct provider identities, actual authority renewal/expiry and further native skill/background-work checks. Setup, fixtures, local FileVault and these Codex results do not certify those other profiles or deployment environments. The overall goal remains open.
