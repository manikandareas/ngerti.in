import { Diagnostics, type LaunchContext } from "./context";
import { HarnessError } from "./contracts";

/** Optional process port for native adapters; SDK-owned processes must obey the same environment/close contract. */
export class OwnedProcess {
  readonly child;
  readonly #pid: number;
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
        detached:
          (context.ownedProcessTree || context.workspace?.shared === true) &&
          process.platform !== "win32",
      });
    } catch {
      throw new HarnessError("SERVICE_UNAVAILABLE");
    }
    const child = this.child;
    this.#pid = child.pid;
    if (!Number.isInteger(this.#pid) || this.#pid <= 1)
      throw new HarnessError("SERVICE_UNAVAILABLE");
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
        process.kill(-this.#pid, signal);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      }
    } else if (this.child.exitCode === null) this.child.kill(signal);
  }
  private get groupOwned() {
    return (
      (this.context.ownedProcessTree || this.context.workspace?.shared === true) &&
      process.platform !== "win32"
    );
  }
  close(timeoutMs = 1000) {
    this.#closing ??= this.stop(timeoutMs);
    return this.#closing;
  }
  private async stop(timeoutMs: number) {
    if (this.groupOwned) {
      // The shared writer's turn is settled. Terminate its owned group together, including
      // background commands, rather than racing a second signal after the parent exits.
      // macOS can return EPERM while the group leader is exiting but its exit handle
      // has not settled. Retry the same owned group; never treat denied cleanup as success.
      const deadline = performance.now() + timeoutMs;
      while (true) {
        try {
          this.signal("SIGKILL");
          break;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EPERM" || performance.now() >= deadline)
            throw error;
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }
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
