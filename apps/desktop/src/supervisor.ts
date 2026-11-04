import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Log } from "./log";
import { type Profile, privateJson, profileEnvironment } from "./profile";

type Runtime = {
  pid: number;
  instance_id: string;
  owner_id: string;
  url: string;
  contract_version: string;
  manager_id: string | null;
};
export type DesktopStatus = {
  state: "starting" | "ready" | "failed" | "stopping" | "stopped";
  message: string;
  ownership: "managed" | "external" | null;
};
export type SupervisorOptions = {
  profile: Profile;
  bun: string;
  serverEntry: string;
  root: string;
  log: Log;
  timeoutMs?: number;
  legacyUrl?: string | false;
};
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
export class Supervisor {
  status: DesktopStatus = {
    state: "starting",
    message: "Preparing your workspace…",
    ownership: null,
  };
  backend: string | undefined;
  private child: ChildProcess | undefined;
  private record: Runtime | undefined;
  private starting: Promise<void> | undefined;
  private stopping: Promise<void> | undefined;
  private closed = false;
  private monitor: ReturnType<typeof setInterval> | undefined;
  private retries: number[] = [];
  private checking = false;
  private auxiliary = new Set<ChildProcess>();
  constructor(readonly options: SupervisorOptions) {}
  private get recordPath() {
    return join(this.options.profile.stateDirectory, "runtime.json");
  }
  token() {
    return privateJson<{ token: string }>(
      join(this.options.profile.stateDirectory, "installation.json"),
    ).token;
  }
  private async probe(url: string) {
    try {
      const parsed = new URL(url);
      if (
        parsed.protocol !== "http:" ||
        parsed.hostname !== "127.0.0.1" ||
        parsed.pathname !== "/" ||
        parsed.username ||
        parsed.password ||
        parsed.search ||
        parsed.hash
      )
        return false;
      const result = await fetch(new URL("/health/ready", url), {
        headers: { Authorization: `Bearer ${this.token()}` },
        signal: AbortSignal.timeout(2500),
      });
      if (!result.ok) return false;
      const value = (await result.json()) as {
        api_readiness_gate?: string;
        contract_version?: string;
      };
      const version = value.contract_version?.match(/^(\d+)\.(\d+)\.(\d+)$/);
      return (
        value.api_readiness_gate === "ready" &&
        !!version &&
        Number(version[1]) === 1 &&
        Number(version[2]) >= 30
      );
    } catch {
      return false;
    }
  }
  private readRuntime() {
    try {
      const record = privateJson<Runtime>(this.recordPath);
      const installation = privateJson<{ owner_id: string }>(
        join(this.options.profile.stateDirectory, "installation.json"),
      );
      if (
        record.owner_id !== installation.owner_id ||
        !Number.isInteger(record.pid) ||
        record.pid < 2 ||
        !/^[a-f0-9-]{36}$/.test(record.instance_id)
      )
        return undefined;
      process.kill(record.pid, 0);
      return record;
    } catch {
      return undefined;
    }
  }
  private ready(url: string, record?: Runtime) {
    this.backend = url;
    this.record = record;
    const managed = record?.manager_id === this.options.profile.managerId;
    this.status = {
      state: "ready",
      message: "Your workspace is ready.",
      ownership: managed ? "managed" : "external",
    };
    this.options.log("desktop.backend.ready", {
      ownership: this.status.ownership,
      instance_id: record?.instance_id,
    });
  }
  start() {
    if (this.closed) return Promise.resolve();
    this.starting ??= this.startInternal().finally(() => {
      this.starting = undefined;
    });
    return this.starting;
  }
  private async startInternal() {
    if (this.status.state === "ready") return;
    this.status = { state: "starting", message: "Connecting to your workspace…", ownership: null };
    const saved = this.readRuntime();
    if (saved && (await this.probe(saved.url))) {
      if (!this.closed) this.ready(saved.url, saved);
      return;
    }
    // A live authority that is temporarily unresponsive must never be replaced.
    if (saved) {
      this.status = {
        state: "failed",
        message: "The existing workspace is not responding. Check its logs, then try again.",
        ownership: null,
      };
      return;
    }
    const legacy =
      this.options.legacyUrl === false
        ? undefined
        : (this.options.legacyUrl ?? "http://127.0.0.1:8000");
    if (legacy && (await this.probe(legacy))) {
      if (!this.closed) this.ready(legacy);
      return;
    }
    if (this.closed) return;
    this.options.log("desktop.backend.starting");
    const child = spawn(this.options.bun, [this.options.serverEntry], {
      cwd: this.options.root,
      env: {
        ...profileEnvironment(this.options.profile, this.options.bun),
        NGERTIIN_PROJECT_ROOT: this.options.root,
        NGERTIIN_PORT: "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.child = child;
    let exited = false;
    child.stdout?.on("data", (data) => this.options.log("backend.stdout", String(data)));
    child.stderr?.on("data", (data) => this.options.log("backend.stderr", String(data)));
    child.once("error", (error) => {
      exited = true;
      this.options.log("desktop.backend.spawn_failed", { name: error.name });
    });
    child.once("exit", (code, signal) => {
      exited = true;
      this.options.log("desktop.backend.exit", { code, signal });
    });
    const deadline = Date.now() + (this.options.timeoutMs ?? 45000);
    while (!this.closed && !exited && Date.now() < deadline) {
      const record = this.readRuntime();
      if (record && record.pid === child.pid && (await this.probe(record.url))) {
        if (!this.closed) this.ready(record.url, record);
        return;
      }
      await wait(150);
    }
    // This child belongs to this attempt, so it is safe to terminate on partial startup.
    if (!exited) child.kill("SIGTERM");
    this.backend = undefined;
    if (!this.closed)
      this.status = {
        state: "failed",
        message: "Your workspace could not start. Open Desktop Logs from the menu, then try again.",
        ownership: null,
      };
  }
  watch() {
    this.monitor ??= setInterval(() => void this.check(), 5000);
    this.monitor.unref();
  }
  async check() {
    if (this.closed || this.checking || this.starting) return;
    this.checking = true;
    try {
      if (this.backend && (await this.probe(this.backend))) {
        if (this.status.state !== "ready") this.ready(this.backend, this.record);
        return;
      }
      const live = this.readRuntime();
      if (live) {
        this.status = {
          ...this.status,
          state: "failed",
          message: "Reconnecting to your workspace…",
        };
        return;
      }
      const wasManaged = this.status.ownership === "managed";
      this.status = {
        ...this.status,
        state: "failed",
        message: "The workspace connection was lost. Try reconnecting.",
      };
      if (!wasManaged) return;
      this.retries = this.retries.filter((time) => Date.now() - time < 60000);
      if (this.retries.length >= 3) {
        this.options.log("desktop.backend.restart_limit");
        return;
      }
      this.retries.push(Date.now());
      await wait(500 * this.retries.length);
      await this.start();
    } finally {
      this.checking = false;
    }
  }
  async releaseHuman(expectedRevision?: number) {
    if (!this.backend || expectedRevision === undefined) return;
    try {
      const headers = {
        Authorization: `Bearer ${this.token()}`,
        "Content-Type": "application/json",
      };
      const response = await fetch(new URL("/v1/machine", this.backend), {
        headers,
        signal: AbortSignal.timeout(2500),
      });
      if (!response.ok) return;
      const machine = (await response.json()) as {
        lease?: { holder: string; state: string; revision: number };
      };
      if (
        machine.lease?.holder !== "human" ||
        machine.lease.state !== "active" ||
        machine.lease.revision !== expectedRevision
      )
        return;
      const released = await fetch(new URL("/v1/machine/control", this.backend), {
        method: "POST",
        headers,
        body: JSON.stringify({
          command_id: crypto.randomUUID(),
          operation: "release",
          expected_revision: machine.lease.revision,
        }),
        signal: AbortSignal.timeout(6000),
      });
      this.options.log("desktop.control.release", { status: released.status });
    } catch {
      this.options.log("desktop.control.release_unconfirmed");
    }
  }
  async startMachine() {
    const configuration = join(this.options.profile.stateDirectory, "machine.json");
    if (!existsSync(configuration) || this.closed) return;
    try {
      const machine = privateJson<{ project: string }>(configuration);
      if (!/^ngertiin-machine-[a-f0-9-]+$/.test(machine.project))
        throw new Error("Invalid retained machine project.");
      const environment = join(this.options.profile.stateDirectory, "machine.env");
      // Start an existing project; do not recreate the container or import files on launch.
      const child = spawn(
        "docker",
        [
          "compose",
          "--env-file",
          environment,
          "-p",
          machine.project,
          "-f",
          join(this.options.root, "infra/machine/compose.yaml"),
          "start",
        ],
        {
          env: profileEnvironment(this.options.profile, this.options.bun),
          stdio: "ignore",
        },
      );
      this.auxiliary.add(child);
      const timer = setTimeout(() => child.kill("SIGTERM"), 20000);
      timer.unref();
      child.once("error", () => {
        clearTimeout(timer);
        this.auxiliary.delete(child);
        this.options.log("desktop.machine.unavailable");
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        this.auxiliary.delete(child);
        this.options.log("desktop.machine.start", { code });
      });
    } catch {
      this.options.log("desktop.machine.unavailable");
    }
  }
  stop() {
    this.stopping ??= this.stopInternal();
    return this.stopping;
  }
  private async stopInternal() {
    this.closed = true;
    clearInterval(this.monitor);
    for (const child of this.auxiliary) child.kill("SIGTERM");
    this.auxiliary.clear();
    await this.starting;
    this.status = { ...this.status, state: "stopping", message: "Closing your workspace safely…" };
    const record = this.readRuntime();
    const owned =
      record &&
      record.manager_id === this.options.profile.managerId &&
      record.instance_id === this.record?.instance_id &&
      record.pid === this.record.pid &&
      (await this.probe(record.url));
    if (owned) {
      this.options.log("desktop.backend.stopping", { instance_id: record.instance_id });
      try {
        process.kill(record.pid, "SIGTERM");
      } catch {
        /* Already exited. */
      }
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline && this.readRuntime()?.instance_id === record.instance_id)
        await wait(100);
      if (this.readRuntime()?.instance_id === record.instance_id) {
        // Revalidate identity before escalation; backend recovery owns any uncertain effects.
        this.options.log("desktop.backend.unclean_shutdown", { instance_id: record.instance_id });
        try {
          process.kill(record.pid, "SIGKILL");
        } catch {
          /* Already exited. */
        }
      }
    } else if (this.child && this.child.exitCode === null && this.child.signalCode === null) {
      this.child.kill("SIGTERM");
    }
    this.backend = undefined;
    this.status = { ...this.status, state: "stopped", message: "Workspace closed." };
  }
}
