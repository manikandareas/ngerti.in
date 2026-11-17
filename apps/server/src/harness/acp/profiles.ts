import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import type { HarnessId } from "../availability";
import { versionState } from "../availability";
import { assertScopedCatalog } from "../catalog-policy";
import type { HarnessAdapter } from "../client";
import { locateNativeCodex } from "../codex/native";
import { workspacePolicy } from "../codex/workspace-policy";
import { HarnessError } from "../contracts";
import { codexExtension } from "./codex-extension";
import { opencodeExtension } from "./opencode-extension";
import { openmaExtension, piExtension } from "./pi-extension";

export type AcpHarness = Exclude<HarnessId, "muse">;
export type PiCandidate = "upstream" | "openma";
export const acpProfiles = {
  codex: {
    executable: "codex-acp",
    package: "@agentclientprotocol/codex-acp",
    version: "2.6.0",
    runtime_version: "0.169.0",
  },
  claude: {
    executable: "claude-agent-acp",
    package: "@agentclientprotocol/claude-agent-acp",
    version: "0.107.0",
    runtime_version: "0.3.323",
  },
  opencode: {
    executable: "opencode",
    package: "opencode-ai",
    version: "1.19.5",
    runtime_version: "1.19.5",
  },
  pi: { executable: "pi-acp", package: "pi-acp", version: "0.0.34", runtime_version: "1.5.2" },
} as const;

type Context = Parameters<HarnessAdapter["connect"]>[0];
export type ProfileLaunch = {
  executable: string;
  args: string[];
  context: Context;
  metadata: Record<string, unknown>;
  instruction_route: "system_prompt" | "profile";
  adapter_version: string;
  runtime_version: string;
  native_event_prefix?: string;
};
function nativePiDirectory(executable: string) {
  let directory = dirname(realpathSync(executable));
  while (true) {
    const manifest = join(directory, "package.json");
    if (existsSync(manifest)) {
      const info = JSON.parse(readFileSync(manifest, "utf8"));
      if (info.name === "@earendil-works/pi-coding-agent") {
        if (info.version !== "1.5.2") throw new HarnessError("VERSION_UNKNOWN");
        return directory;
      }
    }
    const parent = dirname(directory);
    if (parent === directory) throw new HarnessError("VERSION_UNKNOWN");
    directory = parent;
  }
}
const verifiedNative = new Map<string, string>();
async function nativeCodex(executable: string, context: Context) {
  const path = realpathSync(executable);
  const stat = statSync(path);
  const fingerprint = `${path}:${stat.size}:${stat.mtimeMs}`;
  if (verifiedNative.has(fingerprint)) return path;
  const child = Bun.spawn([path, "--version"], {
    env: { PATH: context.env.PATH, HOME: context.env.HOME },
    stdout: "pipe",
    stderr: "ignore",
  });
  const timer = setTimeout(() => child.kill("SIGKILL"), 15000);
  try {
    const output = await new Response(child.stdout).text();
    if (
      (await child.exited) !== 0 ||
      output.length > 4096 ||
      versionState(output, "0.169.0").version !== "0.169.0"
    )
      throw new HarnessError("VERSION_UNKNOWN");
    verifiedNative.set(fingerprint, path);
    return path;
  } finally {
    clearTimeout(timer);
  }
}

/** Profiles supply launch/auth/configuration facts. All prompt/update/cancel behavior stays shared. */
export async function profileLaunch(
  harness: AcpHarness,
  input: Context,
  options: { native_codex?: string; pi_candidate?: PiCandidate; native_pi?: string } = {},
): Promise<ProfileLaunch> {
  assertScopedCatalog(
    input,
    harness === "pi"
      ? {
          nativeMcpPath: join(input.env.PI_CODING_AGENT_DIR, "mcp.json"),
          nativeSettingsPath: join(input.env.PI_CODING_AGENT_DIR, "settings.json"),
          nativeModelsPath: input.nativeConfiguration
            ? join(input.env.PI_CODING_AGENT_DIR, "models.json")
            : undefined,
          emptyNativeAuthPath: join(input.env.PI_CODING_AGENT_DIR, "auth.json"),
        }
      : undefined,
  );
  const context = { ...input, env: { ...input.env } };
  if (!context.env.TMPDIR) {
    const temporary = join(context.state_directory, "acp-temporary");
    mkdirSync(temporary, { recursive: true, mode: 0o700 });
    Object.assign(context.env, { TMPDIR: temporary, TMP: temporary, TEMP: temporary });
  }
  const profile = acpProfiles[harness];
  const result: ProfileLaunch = {
    executable: input.executable,
    args: [],
    context,
    metadata: {},
    instruction_route: "system_prompt",
    adapter_version: profile.version,
    runtime_version: profile.runtime_version,
  };
  const directory = join(context.state_directory, "acp-instructions");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const instructions = join(directory, `${context.agent_id}-${context.thread_id}.md`);
  writeFileSync(instructions, context.instructions ?? "", { mode: 0o600 });
  if (harness === "codex") {
    // Keep the retained account authority and pre-ACP rollouts outside the execution process.
    context.env.CODEX_HOME = join(context.env.CODEX_HOME, "acp-execution");
    mkdirSync(context.env.CODEX_HOME, { recursive: true, mode: 0o700 });
    assertScopedCatalog(context);
    const native = locateNativeCodex(options.native_codex, input.executable);
    if (!native) throw new HarnessError("EXECUTABLE_MISSING");
    context.env.CODEX_PATH = await nativeCodex(native, context);
    const node = Bun.which("node");
    if (!node) throw new HarnessError("EXECUTABLE_MISSING");
    const patched = codexExtension(input.executable, context.state_directory);
    result.executable = node;
    result.args = [patched.path];
    const policyContext = context.workspace
      ? context
      : {
          ...context,
          purpose: "routing" as const,
          workspace: { root: context.state_directory, id: "discovery", revision: 1 },
        };
    context.env.NGERTIIN_CODEX_STARTUP_ARGS = JSON.stringify([
      "-c",
      'cli_auth_credentials_store="ephemeral"',
      "-c",
      `forced_login_method="${context.env.OPENAI_API_KEY ? "api" : "chatgpt"}"`,
      "-c",
      'model_provider="openai"',
      ...workspacePolicy(policyContext),
      "--disable",
      "shell_tool",
      "--disable",
      "unified_exec",
      "--disable",
      "computer_use",
      "--disable",
      "browser_use",
      "--disable",
      "multi_agent",
      "--disable",
      "apps",
      "--disable",
      "plugins",
      "--disable",
      "skill_mcp_dependency_install",
    ]);
    context.env.CODEX_CONFIG = JSON.stringify({
      project_doc_max_bytes: 0,
      web_search: context.purpose === "routing" ? "disabled" : "live",
    });
    context.env.NO_BROWSER = "1";
  } else if (harness === "claude") {
    mkdirSync(context.env.CLAUDE_CONFIG_DIR, { recursive: true, mode: 0o700 });
    result.args = ["--hide-claude-auth"];
    result.metadata = {
      claudeCode: {
        options: {
          settingSources: [],
          tools: [],
          hooks: {},
          plugins: [],
          promptSuggestions: false,
          allowDangerouslySkipPermissions: false,
        },
      },
    };
  } else if (harness === "opencode") {
    const provider = context.connection?.provider_id;
    if (!provider) throw new HarnessError("CAPABILITY_UNSUPPORTED");
    result.args = ["acp"];
    result.instruction_route = "profile";
    const extension = opencodeExtension(context.state_directory);
    result.native_event_prefix = extension.prefix;
    Object.assign(context.env, {
      NGERTIIN_OPENCODE_EVENTS: extension.prefix,
      OPENCODE_DISABLE_PROJECT_CONFIG: "1",
      OPENCODE_DISABLE_AUTOUPDATE: "1",
      OPENCODE_CONFIG_CONTENT: JSON.stringify({
        enabled_providers: [provider],
        instructions: [instructions],
        plugin: [pathToFileURL(extension.path).href],
        permission: { "*": "deny", "ngertiin_*": "allow" },
      }),
    });
  } else {
    result.instruction_route = "profile";
    const node = Bun.which("node");
    if (!node) throw new HarnessError("EXECUTABLE_MISSING");
    result.executable = node;
    mkdirSync(context.env.PI_CODING_AGENT_DIR, { recursive: true, mode: 0o700 });
    if (context.nativeConfiguration) {
      if (
        !context.connection?.provider_id ||
        context.connection.authentication !== "harness_config"
      )
        throw new HarnessError("BILLING_MISMATCH");
      const configuration = context.nativeConfiguration;
      // Preserve the selected native provider's configuration without persisting its key
      // in the execution home or introducing another provider-specific key environment.
      context.env.NGERTIIN_PI_CREDENTIAL = configuration.apiKey;
      writeFileSync(
        join(context.env.PI_CODING_AGENT_DIR, "models.json"),
        JSON.stringify({
          providers: {
            [context.connection.provider_id]: {
              ...configuration,
              apiKey: "$NGERTIIN_PI_CREDENTIAL",
            },
          },
        }),
        { mode: 0o600 },
      );
    }
    // Rebuild app-owned configuration before native startup; remembered defaults cannot
    // select another provider or add packages/hooks to a later run.
    writeFileSync(
      join(context.env.PI_CODING_AGENT_DIR, "settings.json"),
      JSON.stringify({ packages: [], enableSkillCommands: false }),
      { mode: 0o600 },
    );
    if ((options.pi_candidate ?? "upstream") === "upstream") {
      const native =
        options.native_pi ?? Bun.which(join(dirname(input.executable), "pi")) ?? Bun.which("pi");
      if (!native) throw new HarnessError("EXECUTABLE_MISSING");
      context.env.PI_ACP_PI_COMMAND = native;
      const packageDirectory = nativePiDirectory(native);
      context.env.NGERTIIN_PI_STARTUP_ARGS = JSON.stringify([
        "--no-extensions",
        "-e",
        join(packageDirectory, "dist/extensions/mcp/index.js"),
        "--no-skills",
        "--no-context-files",
        "--no-prompt-templates",
        "--tools",
        "mcp__ngertiin__*",
        "--append-system-prompt",
        instructions,
      ]);
      result.args = [piExtension(input.executable, context.state_directory).path];
    } else {
      const patched = openmaExtension(input.executable, context.state_directory);
      const entry = join(context.state_directory, "acp-adapters", `${patched.hash}-entry.mjs`);
      writeFileSync(entry, patched.entry, { mode: 0o600 });
      context.env.NGERTIIN_PI_INSTRUCTIONS = instructions;
      result.args = [entry, "--agent-dir", context.env.PI_CODING_AGENT_DIR];
      result.adapter_version = "0.1.8";
    }
  }
  return result;
}
