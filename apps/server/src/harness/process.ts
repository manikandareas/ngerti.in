import { Diagnostics, type LaunchContext } from "./context";
import { HarnessError } from "./contracts";

/** Optional process port for native adapters; SDK-owned processes must obey the same environment/close contract. */
export class OwnedProcess {
  readonly child;
  readonly #drained: Promise<void>;
  #closing: Promise<void> | undefined;
  constructor(
    executable: string,
    args: string[],
    private readonly context: LaunchContext,
    diagnostic: (line: string) => void = () => {},
  ) {
    try {
      this.child = Bun.spawn([executable, ...args], {
        env: { ...context.env },
        cwd: context.state_directory,
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
        detached: context.workspace?.shared === true && process.platform !== "win32",
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
  private signal(signal: "SIGTERM" | "SIGKILL") {
    if (this.groupOwned) {
      try {
        process.kill(-this.child.pid, signal);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      }
    } else if (this.child.exitCode === null) this.child.kill(signal);
  }
  private get groupOwned() {
    return this.context.workspace?.shared === true && process.platform !== "win32";
  }
  close(timeoutMs = 1000) {
    this.#closing ??= this.stop(timeoutMs);
    return this.#closing;
  }
  private async stop(timeoutMs: number) {
    if (this.groupOwned) {
      // The shared writer's turn is settled. Terminate its owned group together, including
      // background commands, rather than racing a second signal after the parent exits.
      this.signal("SIGKILL");
      await this.child.exited;
      await this.#drained;
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (this.child.exitCode === null) {
        this.signal("SIGTERM");
        await Promise.race([
          this.child.exited,
          new Promise<void>((resolve) => {
            timer = setTimeout(resolve, timeoutMs);
          }),
        ]);
        if (this.child.exitCode === null) this.signal("SIGKILL");
      }
      await this.child.exited;
      await this.#drained;
    } finally {
      clearTimeout(timer);
    }
  }
}
