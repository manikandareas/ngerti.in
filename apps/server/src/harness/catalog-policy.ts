import { existsSync, lstatSync, readFileSync } from "node:fs";
import { dirname, join, parse, resolve, sep } from "node:path";
import type { LaunchContext } from "./context";
import { HarnessError } from "./contracts";

/** Supported app catalogs use the product gateway. Scoped homes never inherit native
 * MCP/plugin configuration, including configuration discovered in ancestor directories. */
export function assertScopedCatalog(
  context: LaunchContext,
  trusted?: {
    nativeMcpPath: string;
    nativeSettingsPath?: string;
    nativeModelsPath?: string;
    emptyNativeAuthPath?: string;
  },
) {
  if (!context.scoped) return;
  const files = new Set([
    join(context.env.CODEX_HOME, "config.toml"),
    join(context.env.HOME, ".muse/config.toml"),
    join(context.env.HOME, ".muse/config.json"),
    join(context.env.HOME, ".config/muse/config.toml"),
    "/etc/codex/config.toml",
    "/etc/muse/config.toml",
    join(context.env.HOME, ".claude/settings.json"),
    join(context.env.HOME, ".claude/settings.local.json"),
    join(context.env.HOME, ".claude.json"),
    join(context.env.HOME, ".config/opencode/opencode.json"),
    join(context.env.HOME, ".config/opencode/opencode.jsonc"),
    join(context.env.HOME, ".pi/agent/settings.json"),
    join(context.env.HOME, ".pi/agent/mcp.json"),
    join(context.env.HOME, ".pi/agent/auth.json"),
    join(context.env.HOME, ".pi/agent/models.json"),
    join(context.env.HOME, ".local/share/opencode/auth.json"),
  ]);
  for (const start of [context.state_directory, context.workspace?.root].filter(
    (path): path is string => !!path,
  )) {
    // Native project discovery stops at the containing repository. The real user's
    // home above it is not the isolated HOME supplied to these processes.
    const repository = Bun.spawnSync(["git", "-C", start, "rev-parse", "--show-toplevel"], {
      env: { ...context.env, GIT_CONFIG_NOSYSTEM: "1" },
      stderr: "ignore",
    });
    const root = repository.exitCode === 0 ? repository.stdout.toString().trim() : "";
    const boundary =
      root && (resolve(start) === root || resolve(start).startsWith(`${root}${sep}`)) ? root : null;
    let directory = start;
    while (true) {
      for (const relative of [
        ".codex/config.toml",
        ".mcp.json",
        ".muse/config.toml",
        ".muse/config.json",
        ".claude/settings.json",
        ".claude/settings.local.json",
        ".opencode/opencode.json",
        ".opencode/opencode.jsonc",
        "opencode.json",
        "opencode.jsonc",
        ".pi/settings.json",
        ".pi/mcp.json",
        ".pi/extensions",
      ])
        files.add(join(directory, relative));
      if (directory === boundary || directory === parse(directory).root) break;
      directory = dirname(directory);
    }
  }
  // lstat also rejects dangling links: configuration indirection is not a supported catalog.
  for (const file of files) {
    if (
      trusted?.emptyNativeAuthPath === file &&
      file === join(context.env.HOME, ".pi/agent/auth.json")
    ) {
      try {
        const info = lstatSync(file);
        if (!info.isFile() || info.isSymbolicLink() || info.size > 4096)
          throw new HarnessError("CAPABILITY_UNSUPPORTED");
        const value = JSON.parse(readFileSync(file, "utf8"));
        if (
          !value ||
          typeof value !== "object" ||
          Array.isArray(value) ||
          Object.keys(value).length
        )
          throw new HarnessError("BILLING_MISMATCH");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      continue;
    }
    // The Pi hook replaces this one private file from the supplied session MCP configuration
    // before starting Pi. It never reads the previous contents or permits project overrides.
    const generated =
      (trusted?.nativeMcpPath === file && file === join(context.env.HOME, ".pi/agent/mcp.json")) ||
      (trusted?.nativeSettingsPath === file &&
        file === join(context.env.HOME, ".pi/agent/settings.json")) ||
      (trusted?.nativeModelsPath === file &&
        file === join(context.env.HOME, ".pi/agent/models.json"));
    if (generated) {
      try {
        const info = lstatSync(file);
        if (!info.isFile() || info.isSymbolicLink())
          throw new HarnessError("CAPABILITY_UNSUPPORTED");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      continue;
    }
    let present = existsSync(file);
    try {
      lstatSync(file);
      present = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        throw new HarnessError("CAPABILITY_UNSUPPORTED");
    }
    if (present) throw new HarnessError("CAPABILITY_UNSUPPORTED");
  }
}
