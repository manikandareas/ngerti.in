import type { z } from "zod";
import { HarnessError, type harnessId, unknownCapabilities } from "./contracts";

export type HarnessId = z.infer<typeof harnessId>;
export const manifests = {
  codex: {
    executable: "codex",
    minimum_version: "0.165.0",
    tested_native_version: "0.166.0",
    protocol: "app_server",
    sdk_version: null,
    evidence: "native_subscription_http",
    authentication_methods: ["native_login", "api_key"],
    capabilities: { ...unknownCapabilities },
  },
  muse: {
    executable: "muse",
    minimum_version: "1.4.14",
    tested_native_version: "1.4.14-R7309.1",
    protocol: "msp_v1",
    sdk_version: "1.4.14",
    evidence: "native_api_key_http_subscription_unverified",
    authentication_methods: ["native_login", "api_key"],
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
      /^(?:codex-cli\s+|muse(?:-code)?\s+)?v?(\d+)\.(\d+)\.(\d+)(-R\d+(?:\.\d+)?)?(?:\+[-\w.]+)?$/i,
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
export async function detectHarness(harness: HarnessId, override?: string): Promise<Availability> {
  const manifest = manifests[harness];
  const executable = Bun.which(override ?? manifest.executable);
  if (!executable) return { harness, manifest, state: "missing", version: null, executable: null };
  let child: ReturnType<typeof Bun.spawn> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    child = Bun.spawn([executable, "--version"], {
      env: { PATH: process.env.PATH, LANG: "C" },
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
        timeout = setTimeout(() => reject(new Error("Version probe timed out.")), 3000);
      }),
    ]);
    return { harness, manifest, executable, ...versionState(output, manifest.minimum_version) };
  } catch {
    return { harness, manifest, executable, state: "probe_failed", version: null };
  } finally {
    clearTimeout(timeout);
    if (child) {
      child.kill("SIGKILL");
      await child.exited;
    }
  }
}
export function requireAvailable(availability: Availability) {
  const codes = {
    missing: "EXECUTABLE_MISSING",
    too_old: "VERSION_TOO_OLD",
    unknown: "VERSION_UNKNOWN",
    probe_failed: "PROBE_FAILED",
  } as const;
  if (availability.state !== "supported") throw new HarnessError(codes[availability.state]);
  if (!availability.executable) throw new HarnessError("EXECUTABLE_MISSING");
  return availability;
}
