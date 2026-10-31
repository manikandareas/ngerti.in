import { existsSync } from "node:fs";
import { deniedWorkspaceNames } from "../../workspace-files";
import type { LaunchContext } from "../context";

/** Native command permissions; provider authentication remains outside the model's filesystem. */
export function workspacePolicy(context: LaunchContext) {
  if (!context.workspace) return [];
  const temporary = context.env.TMPDIR;
  if (!temporary) throw new Error("A private workspace temporary directory is required.");
  const profile = {
    filesystem: {
      ":root": "deny",
      [context.state_directory]: "deny",
      ":minimal": "read",
      ":tmpdir": "write",
      ":slash_tmp": "deny",
      ...Object.fromEntries(
        ["/Library/Developer/CommandLineTools", "/Applications/Xcode.app/Contents/Developer"]
          .filter(existsSync)
          .map((path) => [path, "read"]),
      ),
      ":workspace_roots": {
        ...Object.fromEntries(
          deniedWorkspaceNames.flatMap((name) => [
            [name, "deny"],
            [`**/${name}`, "deny"],
          ]),
        ),
        "**/.env.*": "deny",
        "**/*.p12": "deny",
        "**/*.pfx": "deny",
        ".": context.purpose === "routing" ? "read" : "write",
        ".codex": "deny",
        ".muse": "deny",
        ".agents": "read",
        ".git": "read",
        ".env": "deny",
        ".env.*": "deny",
        "**/*.pem": "deny",
        "**/*.key": "deny",
      },
    },
    network: { enabled: false },
  };
  // CLI overrides have priority over connection/project configuration. No legacy sandbox selector.
  return [
    "-c",
    'default_permissions="ngertiin"',
    "-c",
    `permissions.ngertiin=${toml(profile)}`,
    "-c",
    'shell_environment_policy.inherit="none"',
    "-c",
    `shell_environment_policy.set=${toml({ HOME: context.workspace.root, TMPDIR: temporary, PATH: "/usr/bin:/bin:/usr/sbin:/sbin" })}`,
  ];
}
function toml(value: unknown): string {
  if (typeof value === "object" && value !== null)
    return `{${Object.entries(value)
      .map(([key, item]) => `${JSON.stringify(key)}=${toml(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
