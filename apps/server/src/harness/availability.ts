import type { z } from "zod";
import { HarnessError, type harnessId, unknownCapabilities } from "./contracts";

export type HarnessId = z.infer<typeof harnessId>;
export const manifests = {
  codex: {
    executable: "codex-acp",
    minimum_version: "2.6.0",
    tested_native_version: "0.169.0",
    protocol: "acp_v1",
    sdk_version: "2.7.0",
    evidence: "native_subscription_acp_tool_reload_receipt",
    authentication_methods: ["native_login", "api_key"],
    capabilities: { ...unknownCapabilities },
  },
  muse: {
    executable: "muse",
    minimum_version: "1.4.20",
    tested_native_version: "1.4.20-R8619.1",
    protocol: "msp_v1",
    sdk_version: "1.4.20",
    evidence: "native_api_key_http_subscription_unverified",
    authentication_methods: ["native_login", "api_key"],
    capabilities: { ...unknownCapabilities },
  },
  claude: {
    executable: "claude-agent-acp",
    minimum_version: "0.107.0",
    tested_native_version: "0.3.323",
    protocol: "acp_v1",
    sdk_version: "2.7.0",
    evidence: "handshake_catalog_only",
    authentication_methods: ["api_key"],
    capabilities: { ...unknownCapabilities },
  },
  opencode: {
    executable: "opencode",
    minimum_version: "1.19.5",
    tested_native_version: "1.19.5",
    protocol: "acp_v1",
    sdk_version: "2.7.0",
    evidence: "handshake_catalog_reload_only",
    authentication_methods: ["api_key"],
    capabilities: { ...unknownCapabilities },
  },
  pi: {
    executable: "pi-acp",
    minimum_version: "0.0.34",
    tested_native_version: "1.5.2",
    protocol: "acp_v1",
    sdk_version: "2.7.0",
    evidence: "handshake_only_candidate_comparison_pending",
    authentication_methods: ["api_key"],
    capabilities: { ...unknownCapabilities },
  },
} as const;
export type Availability = {
  harness: HarnessId;
  state: "supported" | "too_old" | "missing" | "unknown" | "probe_failed";
  version: string | null;
  executable: string | null;
  manifest: (typeof manifests)[HarnessId];
};
/** Unknown/pre-release versions fail closed; Muse release suffixes are stable product builds. */
export function versionState(
  output: string,
  minimum: string,
): Pick<Availability, "state" | "version"> {
  const nativeMuse = output
    .trim()
    .match(/^Muse Code (\d+\.\d+\.\d+) \((\d+\.\d+\.\d+-R\d+(?:\.\d+)?)\)$/);
  if (nativeMuse && !nativeMuse[2].startsWith(`${nativeMuse[1]}-R`))
    return { state: "unknown", version: null };
  const match = (nativeMuse ? nativeMuse[2] : output)
    .trim()
    .match(
      /^(?:(?:codex-cli|(?:@agentclientprotocol\/)?codex-acp|claude-agent-acp|opencode|pi-acp|openma-pi-acp|muse(?:-code)?)\s+)?v?(\d+)\.(\d+)\.(\d+)(-R\d+(?:\.\d+)?)?(?:\+[-\w.]+)?$/i,
    );
  if (!match) return { state: "unknown", version: null };
  const version = `${match[1]}.${match[2]}.${match[3]}${match[4] ?? ""}`;
  const actual = match.slice(1, 4).map(Number);
  const floor = minimum.split(".").map(Number);
  let comparison = 0;
  for (let i = 0; i < 3; i++) {
    if (actual[i] !== floor[i]) {
      comparison = actual[i] > floor[i] ? 1 : -1;
      break;
    }
  }
  return { state: comparison < 0 ? "too_old" : "supported", version };
}
export async function detectHarness(
  harness: HarnessId,
  override?: string,
  timeoutMs = 3000,
): Promise<Availability> {
  const manifest = manifests[harness];
  const command = override ?? manifest.executable;
  const executable = Bun.which(command);
  // Inspect Node adapter packages without loading their agent loops for a version check.
  // Pi ACP has no version flag; cold Node bundles can also exceed the probe deadline.
  const packages: Partial<Record<HarnessId, string>> = {
    codex: "@agentclientprotocol/codex-acp",
    claude: "@agentclientprotocol/claude-agent-acp",
    pi: "pi-acp",
  };
  const packageName = packages[harness];
  const packageVersion =
    packageName && executable ? installedPackageVersion(executable, packageName) : undefined;
  const result =
    packageVersion !== undefined
      ? { executable, ...versionState(packageVersion, manifest.minimum_version) }
      : await detectExecutable(command, manifest.minimum_version, timeoutMs);
  if (
    harness !== "muse" &&
    result.state === "supported" &&
    result.version !== manifest.minimum_version
  )
    result.state = "unknown";
  return { harness, manifest, ...result };
}

function installedPackageVersion(executable: string, packageName: string): string | undefined {
  try {
    let directory = dirname(realpathSync(executable));
    for (let depth = 0; depth < 8; depth++) {
      const path = join(directory, "package.json");
      if (existsSync(path)) {
        if (statSync(path).size > 65_536) return "";
        const manifest = JSON.parse(readFileSync(path, "utf8"));
        if (manifest.name === packageName)
          return typeof manifest.version === "string" ? manifest.version : "";
      }
      const parent = dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
  } catch {
    return "";
  }
  return undefined;
}
export type ExecutableProbe = Pick<Availability, "state" | "version" | "executable">;

export async function detectExecutable(
  command: string,
  minimum: string,
  timeoutMs = 3000,
): Promise<ExecutableProbe> {
  const executable = Bun.which(command);
  if (!executable) return { state: "missing", version: null, executable: null };
  let child: ReturnType<typeof Bun.spawn> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    child = Bun.spawn([executable, "--version"], {
      env: { PATH: process.env.PATH, HOME: process.env.HOME, MUSE_NO_AUTO_UPDATE: "1", LANG: "C" },
      stdout: "pipe",
      stderr: "ignore",
    });
    const output = await Promise.race([
      (async () => {
        const reader = (child.stdout as ReadableStream<Uint8Array>).getReader();
        let value = "";
        const decoder = new TextDecoder();
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          value += decoder.decode(chunk.value, { stream: true });
          if (value.length > 4096) throw new Error("Version output exceeded the limit.");
        }
        if ((await child?.exited) !== 0) throw new Error("Version probe failed.");
        return value;
      })(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Version probe timed out.")), timeoutMs);
      }),
    ]);
    return { executable, ...versionState(output, minimum) };
  } catch {
    return { executable, state: "probe_failed", version: null };
  } finally {
    clearTimeout(timeout);
    if (child) {
      child.kill("SIGKILL");
      await child.exited;
    }
  }
}
export function requireAvailable<T extends ExecutableProbe>(
  availability: T,
): T & { executable: string } {
  const codes = {
    missing: "EXECUTABLE_MISSING",
    too_old: "VERSION_TOO_OLD",
    unknown: "VERSION_UNKNOWN",
    probe_failed: "PROBE_FAILED",
  } as const;
  if (availability.state !== "supported") throw new HarnessError(codes[availability.state]);
  if (!availability.executable) throw new HarnessError("EXECUTABLE_MISSING");
  return { ...availability, executable: availability.executable };
}

import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
