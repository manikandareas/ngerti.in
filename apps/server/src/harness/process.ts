import { Diagnostics, type LaunchContext } from "./context";
import { HarnessError } from "./contracts";

/** Optional process port for native adapters; SDK-owned processes must obey the same environment/close contract. */
export class OwnedProcess {
  readonly child;
  readonly #drained: Promise<void>;
  constructor(
    executable: string,
    args: string[],
    context: LaunchContext,
    diagnostic: (line: string) => void = () => {},
  ) {
    try {
      this.child = Bun.spawn([executable, ...args], {
        env: { ...context.env },
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      });
    } catch {
      throw new HarnessError("SERVICE_UNAVAILABLE");
    }
    const child = this.child;
    const records = new Diagnostics(context.redactor, diagnostic);
    this.#drained = (async () => {
      const reader = child.stderr.getReader();
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          records.push(chunk.value);
        }
      } finally {
        records.flush();
        reader.releaseLock();
      }
    })();
    if (context.signal?.aborted) void this.close();
    else
      context.signal?.addEventListener(
        "abort",
        () => {
          void this.close();
        },
        { once: true },
      );
  }
  async close(timeoutMs = 1000) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (this.child.exitCode === null) {
        this.child.kill("SIGTERM");
        await Promise.race([
          this.child.exited,
          new Promise<void>((resolve) => {
            timer = setTimeout(resolve, timeoutMs);
          }),
        ]);
        if (this.child.exitCode === null) this.child.kill("SIGKILL");
      }
      await this.child.exited;
      await this.#drained;
    } finally {
      clearTimeout(timer);
    }
  }
}
