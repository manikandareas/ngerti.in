import { statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { type Availability, detectHarness, type HarnessId, manifests } from "./availability";
import { HarnessError } from "./contracts";

export type HarnessDetector = typeof detectHarness & {
  fingerprint?: (harness: HarnessId) => string;
};

/** Pin executable lookup once; every runtime consumer observes the same path and version. */
export class HarnessRuntime {
  readonly #paths = new Map<HarnessId, string | null>();
  readonly #commands = new Map<HarnessId, string>();
  readonly #cache = new Map<HarnessId, { at: number; stamp: string; value: Availability }>();
  readonly #pending = new Map<HarnessId, Promise<Availability>>();
  readonly detect: HarnessDetector;

  constructor(overrides: Partial<Record<HarnessId, string>> = {}) {
    for (const harness of ["codex", "muse"] as const) {
      const command = overrides[harness] ?? manifests[harness].executable;
      this.#commands.set(harness, command);
      this.#paths.set(harness, this.locate(harness));
    }
    this.detect = Object.assign((harness: HarnessId) => this.observe(harness), {
      fingerprint: (harness: HarnessId) => this.fingerprint(harness),
    });
  }

  installationPath(harness: HarnessId) {
    if (this.#commands.get(harness) !== manifests[harness].executable)
      throw new HarnessError("CAPABILITY_UNSUPPORTED");
    return join(
      homedir(),
      ".local/share/ngertiin/harnesses",
      harness,
      "bin",
      manifests[harness].executable,
    );
  }

  private locate(harness: HarnessId) {
    const command = this.#commands.get(harness) ?? manifests[harness].executable;
    return (
      Bun.which(command) ??
      (command === manifests[harness].executable ? Bun.which(this.installationPath(harness)) : null)
    );
  }

  private stamp(harness: HarnessId) {
    let path = this.#paths.get(harness);
    if (!path) {
      path = this.locate(harness);
      this.#paths.set(harness, path);
    }
    if (!path) return "missing";
    try {
      const info = statSync(path);
      return `${path}:${info.dev}:${info.ino}:${info.size}:${info.mtimeMs}`;
    } catch {
      return `${path}:missing`;
    }
  }

  fingerprint(harness: HarnessId) {
    const value = this.#cache.get(harness)?.value;
    return `${this.stamp(harness)}:${value?.state ?? "unprobed"}:${value?.version ?? "unknown"}`;
  }

  async refresh(harness: HarnessId) {
    await this.#pending.get(harness);
    this.#paths.set(harness, this.locate(harness));
    this.#cache.delete(harness);
    return this.observe(harness);
  }

  private async observe(harness: HarnessId): Promise<Availability> {
    const pending = this.#pending.get(harness);
    if (pending) return pending;
    const stamp = this.stamp(harness);
    const cached = this.#cache.get(harness);
    const ttl = cached?.value.state === "supported" ? 30_000 : 2000;
    if (cached && cached.stamp === stamp && Date.now() - cached.at < ttl) return cached.value;
    const path = this.#paths.get(harness);
    const operation = (
      path
        ? detectHarness(harness, path)
        : Promise.resolve({
            harness,
            manifest: manifests[harness],
            state: "missing",
            version: null,
            executable: null,
          } as Availability)
    )
      .then((value) => {
        this.#cache.set(harness, { at: Date.now(), stamp, value });
        return value;
      })
      .finally(() => this.#pending.delete(harness));
    this.#pending.set(harness, operation);
    return operation;
  }
}
