# Local engine startup correction

The real signed-in `/agents` page returned `ENGINE_UNAVAILABLE` after the single-runtime cutover. The local `.env` had no partition registry and retained 58 inactive configuration names. The development supervisor started API/web only. Earlier fixed-account browser acceptance did not verify provisioning of the real signed-in account.

`scripts/dev_engine.py` now provisions explicitly selected existing PostgreSQL accounts from `NMA_DEV_OWNER_IDS` and supervises their pinned native gateways with `make dev`. The launcher is development-only, rejects replacement of external partition mappings and duplicate supervisors, and preserves private signing keys and durable state across restart. Model/capability catalogs refresh from the current environment. Each account retains exclusive native locks; this launcher does not schedule runs or implement another execution lifecycle.

The local environment was refreshed from the current template while preserving all retained values. Removed inactive values are recoverable from a private ignored `.dev/env-backups/` copy. No secret values are recorded here. Source/runtime paths and the account-to-socket registry are now configured. Existing historical database/object data was not changed.

Verification on 2026-10-24:

- The actual existing Clerk browser session loads `/agents` without the availability error; create-agent is enabled and the model selector contains the configured `gpt-6.1-sol`. No agent or conversation was created for this check.
- Complete development-stack stop/start succeeds; signing key hashes remain unchanged.
- Signed `agent.list` through the real API transport returns model and capability catalogs.
- A second local supervisor is rejected before provisioning.
- `make check`, `make docs-check`, and `git diff --check` pass.

This closes the local development startup gap. Production provisioning remains separate; no production deployment or new model-response acceptance is claimed by this correction.
