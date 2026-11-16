import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { DomainError } from "../contracts";
import { type Availability, type HarnessId, requireAvailable } from "./availability";
import { HarnessError } from "./contracts";
import { MaintenanceJobs } from "./maintenance-jobs";
import type { HarnessRuntime } from "./runtime";

/** Host-owner maintenance only. Arguments and download origins never come from a client. */
export class HarnessUpdater {
  readonly #pending = new Map<HarnessId, Promise<Availability>>();
  readonly #stops = new Set<() => void>();
  #closed = false;
  readonly jobs: MaintenanceJobs;
  constructor(
    private readonly runtime: HarnessRuntime,
    directory?: string,
  ) {
    this.jobs = new MaintenanceJobs(directory);
  }

  recover() {
    return this.jobs.recover((harness) => this.runtime.refresh(harness));
  }

  async start(
    harness: HarnessId,
    expectedVersion: string | null,
    commandId: string,
    signal: AbortSignal,
  ) {
    if (this.#closed) throw new HarnessError("ADAPTER_UNAVAILABLE");
    const before = await this.runtime.detect(harness);
    return this.jobs.start(
      harness,
      expectedVersion,
      commandId,
      before.state === "missing" ? "install" : "update",
      () => this.update(harness, expectedVersion, signal),
    );
  }

  get updating() {
    return [...this.#pending.keys()];
  }

  update(harness: HarnessId, expectedVersion: string | null, signal: AbortSignal) {
    if (this.#closed) throw new HarnessError("ADAPTER_UNAVAILABLE");
    const current = this.#pending.get(harness);
    if (current) return current;
    const result = this.run(harness, expectedVersion, signal).finally(() => {
      this.#pending.delete(harness);
    });
    this.#pending.set(harness, result);
    return result;
  }

  private async run(harness: HarnessId, expectedVersion: string | null, signal: AbortSignal) {
    signal.throwIfAborted();
    const before = await this.runtime.refresh(harness);
    if (before.state === "supported") return before;
    if (before.version !== expectedVersion) throw new DomainError("CONFLICT");
    if (process.platform === "win32") throw new HarnessError("CAPABILITY_UNSUPPORTED");
    const installing = before.state === "missing";
    const executable = installing ? this.runtime.installationPath(harness) : before.executable;
    if (!executable) throw new HarnessError("EXECUTABLE_MISSING");

    const environment: Record<string, string | undefined> = {
      PATH: process.env.PATH,
      HOME: homedir(),
      USER: process.env.USER,
      LOGNAME: process.env.LOGNAME,
      TMPDIR: process.env.TMPDIR,
      TMP: process.env.TMP,
      TEMP: process.env.TEMP,
      HTTPS_PROXY: process.env.HTTPS_PROXY,
      HTTP_PROXY: process.env.HTTP_PROXY,
      NO_PROXY: process.env.NO_PROXY,
      SSL_CERT_FILE: process.env.SSL_CERT_FILE,
      SSL_CERT_DIR: process.env.SSL_CERT_DIR,
      LANG: "C",
      TERM: "dumb",
      CI: "1",
      HOMEBREW_NO_AUTO_UPDATE: "1",
    };
    let command: string[];
    let input: Uint8Array | undefined;
    if (harness === "muse") {
      const bash = Bun.which("bash");
      if (!bash || !Bun.which("curl") || basename(executable) !== "muse")
        throw new HarnessError("CAPABILITY_UNSUPPORTED");
      // The official installer supports an exact installation directory and a profile-free update mode.
      const response = await fetch("https://dev.meta.ai/install.sh", {
        redirect: "error",
        signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
      });
      if (!response.ok || !response.body) throw new HarnessError("SERVICE_UNAVAILABLE");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          length += part.value.byteLength;
          if (length > 1_048_576) throw new HarnessError("SERVICE_UNAVAILABLE");
          chunks.push(part.value);
        }
      } finally {
        await reader.cancel();
      }
      input = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        input.set(chunk, offset);
        offset += chunk.byteLength;
      }
      if (!new TextDecoder().decode(input.subarray(0, 128)).startsWith("#!/"))
        throw new HarnessError("SERVICE_UNAVAILABLE");
      command = [bash, "-s"];
      environment.MUSE_INSTALL_DIR = dirname(executable);
      environment.MUSE_UPGRADE_MODE = "1";
      environment.MUSE_NO_MODIFY_PATH = "1";
    } else if (installing) {
      const npm = Bun.which("npm");
      if (!npm || !Bun.which("node")) throw new HarnessError("CAPABILITY_UNSUPPORTED");
      command = [
        npm,
        "install",
        "--global",
        "--prefix",
        dirname(dirname(executable)),
        "--registry",
        "https://registry.npmjs.org",
        "@openai/codex@latest",
      ];
    } else {
      const resolved = realpathSync(executable);
      const npmRoot = resolved.match(/^(.*)\/lib\/node_modules\/@openai\/codex\//)?.[1];
      if (npmRoot) {
        const npm = Bun.which(join(npmRoot, "bin", "npm")) ?? Bun.which("npm");
        if (!npm) throw new HarnessError("CAPABILITY_UNSUPPORTED");
        command = [npm, "install", "--global", "--prefix", npmRoot, "@openai/codex@latest"];
        environment.PATH = `${join(npmRoot, "bin")}:${environment.PATH ?? ""}`;
      } else if (/\/(?:Caskroom|Cellar)\/codex\//.test(resolved)) {
        const brew = Bun.which("brew");
        if (!brew) throw new HarnessError("CAPABILITY_UNSUPPORTED");
        command = resolved.includes("/Caskroom/")
          ? [brew, "upgrade", "--cask", "codex"]
          : [brew, "upgrade", "codex"];
      } else {
        command = [executable, "update"];
      }
    }
    signal.throwIfAborted();
    if (this.#closed) throw new HarnessError("ADAPTER_UNAVAILABLE");
    const child = Bun.spawn(command, {
      env: environment,
      cwd: homedir(),
      stdin: input ?? "ignore",
      stdout: "ignore",
      stderr: "ignore",
      detached: true,
    });
    const stop = () => {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        if (child.exitCode === null) child.kill("SIGKILL");
      }
    };
    this.#stops.add(stop);
    const timeout = setTimeout(stop, 120_000);
    signal.addEventListener("abort", stop, { once: true });
    try {
      if (signal.aborted) stop();
      const exit = await child.exited;
      signal.throwIfAborted();
      let after = await this.runtime.refresh(harness);
      for (
        let attempt = 0;
        attempt < 2 && ["missing", "probe_failed"].includes(after.state);
        attempt++
      ) {
        signal.throwIfAborted();
        await Bun.sleep(500);
        after = await this.runtime.refresh(harness);
      }
      if (after.state === "supported") return after;
      if (exit !== 0) throw new HarnessError("SERVICE_UNAVAILABLE");
      return requireAvailable(after);
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener("abort", stop);
      this.#stops.delete(stop);
    }
  }

  async close() {
    this.#closed = true;
    for (const stop of this.#stops) stop();
    await Promise.allSettled(this.#pending.values());
  }
}
