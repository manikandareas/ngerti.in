import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { DomainError, id } from "../contracts";
import type { Availability, HarnessId } from "./availability";
import { HarnessError, harnessId } from "./contracts";

export const maintenanceJob = z.strictObject({
  id,
  harness: harnessId,
  operation: z.enum(["install", "update"]),
  status: z.enum(["running", "succeeded", "failed"]),
  expected_version: z.string().nullable(),
  version: z.string().nullable(),
  started_at: z.iso.datetime(),
  finished_at: z.iso.datetime().nullable(),
  error: z.string().nullable(),
});
export type MaintenanceJob = z.infer<typeof maintenanceJob>;

/** Installation receipts survive a lost HTTP acknowledgement and application restart. */
export class MaintenanceJobs {
  readonly #jobs = new Map<string, MaintenanceJob>();
  readonly #active = new Map<HarnessId, { job: MaintenanceJob; completion: Promise<void> }>();
  readonly #file?: string;
  constructor(directory?: string) {
    if (!directory) return;
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.#file = join(directory, "harness-maintenance.json");
    try {
      const saved = readFileSync(this.#file, "utf8");
      if (saved.length > 1_048_576) throw new Error("Maintenance receipts exceeded the limit.");
      for (const job of z.array(maintenanceJob).max(64).parse(JSON.parse(saved)))
        this.#jobs.set(job.id, job);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  get operations() {
    return [...this.#jobs.values()];
  }
  private save() {
    if (!this.#file) return;
    const temporary = `${this.#file}.${crypto.randomUUID()}.tmp`;
    writeFileSync(temporary, JSON.stringify(this.operations), { mode: 0o600, flag: "wx" });
    renameSync(temporary, this.#file);
  }
  async recover(detect: (harness: HarnessId) => Promise<Availability>) {
    for (const job of this.#jobs.values()) {
      if (job.status !== "running") continue;
      const observed = await detect(job.harness);
      job.status = observed.state === "supported" ? "succeeded" : "failed";
      job.version = observed.version;
      job.finished_at = new Date().toISOString();
      job.error =
        job.status === "failed"
          ? "Installation was interrupted. Check the harness and retry."
          : null;
    }
    this.save();
  }
  start(
    harness: HarnessId,
    expectedVersion: string | null,
    commandId: string,
    operation: MaintenanceJob["operation"],
    run: () => Promise<Availability>,
  ) {
    const previous = this.#jobs.get(commandId);
    if (previous) {
      if (previous.harness !== harness || previous.expected_version !== expectedVersion)
        throw new DomainError("IDEMPOTENCY_CONFLICT");
      return {
        job: { ...previous },
        completion: this.#active.get(harness)?.completion ?? Promise.resolve(),
      };
    }
    const active = this.#active.get(harness);
    if (active) return { job: { ...active.job }, completion: active.completion };
    while (this.#jobs.size >= 64) {
      const retired = this.operations.find((job) => job.status !== "running");
      if (!retired) throw new DomainError("CONFLICT");
      this.#jobs.delete(retired.id);
    }
    const job: MaintenanceJob = {
      id: commandId,
      harness,
      operation,
      status: "running",
      expected_version: expectedVersion,
      version: null,
      started_at: new Date().toISOString(),
      finished_at: null,
      error: null,
    };
    this.#jobs.set(job.id, job);
    try {
      this.save();
    } catch (error) {
      this.#jobs.delete(job.id);
      throw error;
    }
    const completion = Promise.resolve()
      .then(run)
      .then((result) => {
        job.status = "succeeded";
        job.version = result.version;
      })
      .catch((error) => {
        job.status = "failed";
        job.error =
          error instanceof HarnessError
            ? `The harness could not finish ${operation === "install" ? "installing" : "updating"} (${error.code}). Retry to check its current state.`
            : "The operation was interrupted. Check the harness and retry.";
      })
      .finally(() => {
        job.finished_at = new Date().toISOString();
        this.#active.delete(harness);
        this.save();
        console.log(
          JSON.stringify({
            event: "harness.maintenance.completed",
            harness,
            operation,
            status: job.status,
            version: job.version,
            elapsed_ms: Date.now() - Date.parse(job.started_at),
          }),
        );
      });
    this.#active.set(harness, { job, completion });
    return { job: { ...job }, completion };
  }
}
