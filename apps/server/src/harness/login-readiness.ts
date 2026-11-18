import { z } from "zod";
import type { HarnessId } from "./availability";
import { harnessId } from "./contracts";
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
    return {
      harness,
      ready: false,
      reason: "Muse subscription execution and billing are pending verification.",
    };
  }
}
