import { existsSync, lstatSync } from "node:fs";
import { dirname, join, parse } from "node:path";
import type { LaunchContext } from "./context";
import { HarnessError } from "./contracts";

/** Supported app catalogs use the product gateway. Scoped homes never inherit native
 * MCP/plugin configuration, including configuration discovered in ancestor directories. */
export function assertScopedCatalog(context: LaunchContext) {
  if (!context.scoped) return;
  const files = new Set([
    join(context.env.CODEX_HOME, "config.toml"),
    join(context.env.HOME, ".muse/config.toml"),
    join(context.env.HOME, ".muse/config.json"),
    join(context.env.HOME, ".config/muse/config.toml"),
    "/etc/codex/config.toml",
    "/etc/muse/config.toml",
  ]);
  for (const start of [context.state_directory, context.workspace?.root].filter(
    (path): path is string => !!path,
  )) {
    let directory = start;
    while (true) {
      for (const relative of [
        ".codex/config.toml",
        ".mcp.json",
        ".muse/config.toml",
        ".muse/config.json",
      ])
        files.add(join(directory, relative));
      if (directory === parse(directory).root) break;
      directory = dirname(directory);
    }
  }
  // lstat also rejects dangling links: configuration indirection is not a supported catalog.
  for (const file of files) {
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
