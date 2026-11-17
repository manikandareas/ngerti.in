import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { HarnessId } from "./availability";
import { Redactor } from "./context";
import { harnessId } from "./contracts";
import { MuseTransport } from "./muse/transport";
import { nativeStorageReady } from "./native-storage";
import type { HarnessRuntime } from "./runtime";

export const loginReadiness = z.strictObject({
  harness: harnessId,
  ready: z.boolean(),
  reason: z.string().nullable(),
});
export type LoginReadiness = z.infer<typeof loginReadiness>;

/** Probe protocol support without reading an account's credentials or starting sign-in. */
export class HarnessLoginReadiness {
  readonly #cache = new Map<string, { expires: number; result: Promise<LoginReadiness> }>();
  constructor(
    private readonly runtime: HarnessRuntime,
    private readonly stateDirectory: string,
  ) {}

  async check(harness: HarnessId): Promise<LoginReadiness> {
    const available = await this.runtime.detect(harness);
    if (available.state !== "supported" || !available.executable)
      return { harness, ready: false, reason: "Install or update this harness before connecting." };
    if (harness === "codex") {
      if ((await this.runtime.nativeCodex()).state !== "supported")
        return {
          harness,
          ready: false,
          reason: "Install the compatible Codex runtime before connecting.",
        };
      return nativeStorageReady(this.stateDirectory)
        ? { harness, ready: true, reason: null }
        : {
            harness,
            ready: false,
            reason:
              "The server owner needs to configure encrypted account storage before connecting Codex.",
          };
    }
    if (harness !== "muse")
      return {
        harness,
        ready: false,
        reason: "Connect this harness with an explicitly selected provider API key.",
      };
    const key = `${harness}:${this.runtime.fingerprint(harness)}`;
    const cached = this.#cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.result;
    this.#cache.clear();
    const result = this.probeMuse(available.executable);
    this.#cache.set(key, { expires: Date.now() + 30_000, result });
    return result;
  }

  private async probeMuse(executable: string): Promise<LoginReadiness> {
    const directory = mkdtempSync(join(tmpdir(), "ngertiin-muse-readiness-"));
    const home = join(directory, "home");
    mkdirSync(home, { mode: 0o700 });
    let transport: MuseTransport | undefined;
    try {
      transport = new MuseTransport(executable, {
        env: {
          PATH: process.env.PATH ?? "",
          HOME: home,
          USERPROFILE: home,
          XDG_CONFIG_HOME: join(home, ".config"),
          XDG_DATA_HOME: join(home, ".local/share"),
          MUSE_CONTRIBUTOR_MODE: "0",
          LANG: "C",
        },
        state_directory: directory,
        redactor: new Redactor(),
        signal: AbortSignal.timeout(5000),
      });
      const host = await transport.initialize();
      if (
        host.initializeResult.sessionDurability === "ephemeral" ||
        !host.initializeResult.grantedCapabilities.includes("sessionMcp")
      )
        return {
          harness: "muse",
          ready: false,
          reason: "This Muse installation does not support the required connection capabilities.",
        };
      return { harness: "muse", ready: true, reason: null };
    } catch {
      return {
        harness: "muse",
        ready: false,
        reason:
          "Muse could not complete its protocol check. Its CLI and server SDK need compatible versions.",
      };
    } finally {
      await transport?.close();
      rmSync(directory, { recursive: true, force: true });
    }
  }
}
