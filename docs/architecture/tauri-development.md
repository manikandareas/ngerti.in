# Tauri development application

The November 15 owner instruction makes account authentication the sole supported path. Tauri is an account client of the server, including the loopback server started by `bun dev`. The launcher owns development processes; quitting the client leaves server work alive. The local supervisor and installation-token gateway are removed. See [account sessions](tauri-remote-client.md) and [current verification](../verification/accounts-only-2026-11-15/README.md).

## Run and build

Requirements: Bun 1.3.10, PostgreSQL, Rust stable (minimum 1.90) and Xcode Command Line Tools.

```sh
bun install --frozen-lockfile
bun dev
```

The launcher builds shared assets, starts API/Vite, opens Tauri and starts the local email inbox. Defaults are API port 8000, web/auth origin 3001 and inbox 8025. Occupied ports fail visibly; another process is never reused or stopped. The persistent desktop profile is `.dev/development-client`. Sign up and open the inbox to verify the email. The first verified local account becomes Owner and can create an organization. Other accounts use ordinary invitations and permissions.

`bun run dev:api` and `bun run dev:web-client` start individual services. A standalone native client uses one account-server profile:

```sh
NGERTIIN_DESKTOP_HOME="/absolute/private/account-profile" bun run setup:desktop -- --server https://ngertiin.example.com
NGERTIIN_DESKTOP_HOME="/absolute/private/account-profile" bun run dev:desktop
bun run package:desktop
```

Version-2 profiles identify one server, native manager, private UI port and UI source root. They contain no backend environment, state directory, provider executable or installation credential. Version-1 profiles, Keychain entries, server records and installed applications are preserved; use a new profile for this client.

Debug builds permit explicit IPv4 loopback HTTP for development. Release clients require canonical HTTPS and certificate/hostname validation. Both use the same PKCE, account/device sessions and organization authorization.

## Lifecycle and packaging

Native code owns the narrow gateway, PKCE callback, renewal/Keychain storage, downloads and presentation-scoped Computer viewers. Close/hide/reload/Quit retire only this client's streams and viewers. Server responsibilities and other clients remain independent. Explicit Ctrl+C in `bun dev` stops the processes owned by that development command.

The bundle contains the Rust client and built web assets without a Bun sidecar, backend source/dependencies, private configuration or credentials. Asset preparation removes obsolete generated sidecar staging. Shared UI has HMR; Rust/backend changes require restarting their owning development command.

Run `bun run test:desktop`, `bun run typecheck:desktop` and `bun run lint:desktop`. The [current report](../verification/accounts-only-2026-11-15/README.md) separates source/contract, native tests, browser development journeys and unchanged provider evidence. NMA-063/NMA-064 remain separate product/distribution gates. The retired supervisor source and its [original evidence](../verification/tauri-development/README.md) are available through [historical recovery](../development/history.md#retired-installation-token-authentication--2026-11-15).
