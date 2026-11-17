import { dirname, join } from "node:path";
import { detectExecutable, type ExecutableProbe } from "../availability";

export const nativeCodexVersion = "0.169.0";

/** An explicit native override never falls back to an ambient account authority. */
export function locateNativeCodex(override?: string, adapter?: string): string | null {
  if (override) return Bun.which(override);
  return (adapter ? Bun.which(join(dirname(adapter), "codex")) : null) ?? Bun.which("codex");
}
export async function detectNativeCodex(
  override?: string,
  adapter?: string,
): Promise<ExecutableProbe> {
  const path = locateNativeCodex(override, adapter);
  if (!path) return { state: "missing", version: null, executable: null };
  const result = await detectExecutable(path, nativeCodexVersion);
  if (result.state === "supported" && result.version !== nativeCodexVersion)
    result.state = "unknown";
  return result;
}
