import { chmodSync, lstatSync, mkdirSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DomainError } from "../contracts";
import { BROWSER_IMAGE, type BrowserResult } from "./contracts";
import { BrowserMcp } from "./mcp";
import { safeBrowserOutput } from "./output";

export interface BrowserHost {
  connect(profileId: string, authorize?: () => void | Promise<void>): Promise<void>;
  call(profileId: string, tool: string, args: unknown): Promise<BrowserResult>;
  detach(profileId: string): void;
  close(profileId: string, authorize?: () => void | Promise<void>): Promise<void>;
  reset(profileId: string, authorize?: () => void | Promise<void>): Promise<void>;
  vncPort(profileId: string): Promise<number>;
}
export class DockerBrowserHost implements BrowserHost {
  readonly #clients = new Map<string, BrowserMcp>();
  readonly #opening = new Map<string, Promise<void>>();
  readonly root: string;
  #image: Promise<string> | undefined;
  constructor(
    readonly stateDirectory: string,
    readonly ownerId: string,
  ) {
    this.root = join(realpathSync(resolve(stateDirectory)), "browser-profiles");
    mkdirSync(this.root, { mode: 0o700, recursive: true });
    if (lstatSync(this.root).isSymbolicLink() || realpathSync(this.root) !== this.root)
      throw new DomainError("SCOPE_DENIED", 403);
    chmodSync(this.root, 0o700);
  }
  private name(id: string) {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new DomainError("INVALID_REQUEST", 422);
    return `ngertiin-browser-${this.ownerId}-${id}`;
  }
  private async docker(args: string[], optional = false) {
    const child = Bun.spawn(["docker", ...args], { stdout: "pipe", stderr: "ignore" });
    const timer = setTimeout(() => child.kill("SIGKILL"), 30_000);
    try {
      const output = await new Response(child.stdout).text();
      if ((await child.exited) !== 0 && !optional) throw new DomainError("BROWSER_UNAVAILABLE");
      return output;
    } finally {
      clearTimeout(timer);
    }
  }
  private async inspect(id: string) {
    const output = await this.docker(["inspect", this.name(id)], true);
    if (!output) return null;
    const info = JSON.parse(output)[0];
    if (!info) return null;
    if (
      info.Config.Labels?.["ngertiin.owner"] !== this.ownerId ||
      info.Config.Labels?.["ngertiin.profile"] !== id
    )
      throw new DomainError("SCOPE_DENIED", 403);
    return info;
  }
  private image() {
    this.#image ??= this.docker(["image", "inspect", BROWSER_IMAGE, "--format", "{{.Id}}"]).then(
      (value) => {
        const id = value.trim();
        if (!/^sha256:[a-f0-9]{64}$/.test(id)) throw new DomainError("BROWSER_UNAVAILABLE");
        return id;
      },
    );
    return this.#image;
  }
  async connect(id: string, authorize = () => {}) {
    if (this.#clients.has(id)) return;
    const pending = this.#opening.get(id);
    if (pending) return pending;
    const opening = this.open(id, authorize);
    this.#opening.set(id, opening);
    try {
      await opening;
    } finally {
      this.#opening.delete(id);
    }
  }
  private async open(id: string, authorize: () => void | Promise<void>) {
    const image = await this.image();
    await authorize();
    const name = this.name(id);
    let info = await this.inspect(id);
    await authorize();
    if (info && info.Image !== image) throw new DomainError("BROWSER_UNAVAILABLE");
    if (!info) {
      const path = join(this.root, id);
      mkdirSync(path, { mode: 0o700, recursive: true });
      if (lstatSync(path).isSymbolicLink() || realpathSync(path) !== path)
        throw new DomainError("SCOPE_DENIED", 403);
      await this.docker([
        "run",
        "-d",
        "--name",
        name,
        "--init",
        "--shm-size=512m",
        "--memory=2g",
        "--cpus=2",
        "--cap-drop=ALL",
        "--security-opt=no-new-privileges",
        "--label",
        `ngertiin.owner=${this.ownerId}`,
        "--label",
        `ngertiin.profile=${id}`,
        "--mount",
        `type=bind,source=${path},target=/profile`,
        "-p",
        "127.0.0.1::5900",
        image,
      ]);
    } else if (!info.State.Running) {
      await authorize();
      await this.docker(["start", name]);
    }
    // The host reports readiness by accepting RFB; no model or navigation is used as a health check.
    for (let attempt = 0; attempt < 100; attempt++) {
      info = await this.inspect(id);
      await authorize();
      if (!info?.State.Running) throw new DomainError("BROWSER_UNAVAILABLE");
      const ready = await this.docker(
        [
          "exec",
          name,
          "python",
          "-c",
          "import socket; s=socket.create_connection(('127.0.0.1',5900),1); s.close()",
        ],
        true,
      );
      // An explicit exit marker avoids confusing silent failure with a successful empty response.
      const marker = await this.docker(
        [
          "exec",
          name,
          "python",
          "-c",
          "import urllib.request; urllib.request.urlopen('http://127.0.0.1:9222/json/version',timeout=1); print('ready')",
        ],
        true,
      );
      void ready;
      if (marker.trim() === "ready") break;
      if (attempt === 99) throw new DomainError("BROWSER_UNAVAILABLE");
      await Bun.sleep(100);
    }
    await authorize();
    const client = new BrowserMcp([
      "docker",
      "exec",
      "-i",
      name,
      "python",
      "-m",
      "browser_use.mcp.server",
    ]);
    try {
      await client.initialize();
      this.#clients.set(id, client);
    } catch (error) {
      client.close();
      throw error;
    }
  }
  async call(id: string, tool: string, args: unknown) {
    const client = this.#clients.get(id);
    if (!client) throw new DomainError("BROWSER_UNAVAILABLE");
    return safeBrowserOutput(await client.call(tool, args));
  }
  detach(id: string) {
    this.#clients.get(id)?.close();
    this.#clients.delete(id);
  }
  async close(id: string, authorize = () => {}) {
    await authorize();
    this.detach(id);
    const info = await this.inspect(id);
    await authorize();
    if (info) await this.docker(["stop", "--time=15", this.name(id)]);
  }
  async reset(id: string, authorize = () => {}) {
    // Reset only this managed profile, after its host has stopped. No generic host path deletion.
    await this.close(id, authorize);
    const { rmSync } = await import("node:fs");
    const path = join(this.root, id);
    if (dirname(path) !== this.root || lstatSync(path).isSymbolicLink())
      throw new DomainError("SCOPE_DENIED", 403);
    await authorize();
    rmSync(path, { recursive: true });
    const info = await this.inspect(id);
    await authorize();
    if (info) await this.docker(["rm", this.name(id)]);
  }
  async vncPort(id: string) {
    const info = await this.inspect(id);
    const binding = info?.NetworkSettings.Ports["5900/tcp"]?.[0];
    if (!info?.State.Running || binding?.HostIp !== "127.0.0.1")
      throw new DomainError("BROWSER_UNAVAILABLE");
    return Number(binding.HostPort);
  }
}
