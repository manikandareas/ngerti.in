import { lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { DomainError } from "../contracts";
import { machineConfiguration } from "./config";
import { CuaMachine } from "./cua";

export const DOMAIN_IMAGE =
  "ghcr.io/trycua/linux:24.04@sha256:9ac0d6f6f7dd95392554ec95163f83c5061de3db05b64977696c78d71cd4861c";
const runtimeTmpfs = "rw,noexec,nosuid,nodev,size=64m,mode=755";
export const domainPolicy = z.strictObject({
  version: z.literal(1),
  max_domains: z.int().min(1).max(100),
  memory_mib: z.int().min(512).max(32768),
  cpus: z.number().min(0.25).max(16),
  pids: z.int().min(256).max(4096),
});
export type DomainPolicy = z.infer<typeof domainPolicy>;
const retained = machineConfiguration.extend({
  phase: z.enum(["new", "creating", "retained"]),
  container_id: z.string().nullable(),
});
type Retained = z.infer<typeof retained>;
export function readPrivateJson(path: string) {
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || info.mode & 0o077 || info.size > 8192)
    throw new Error("Invalid private execution-domain configuration.");
  return JSON.parse(readFileSync(path, "utf8"));
}
export function readDomainPolicy(directory: string): DomainPolicy | null {
  try {
    return domainPolicy.parse(readPrivateJson(join(directory, "execution-domains.json")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error("Invalid execution-domain policy; explicit operator setup is required.");
  }
}
async function docker(args: string[], allowMissing = false): Promise<string> {
  const child = Bun.spawn(["docker", ...args], { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) {
    if (allowMissing && /No such (object|container|volume|network)/i.test(err)) return "";
    // Docker diagnostics can contain environment secrets; never forward them.
    throw new DomainError("MACHINE_UNAVAILABLE", 503);
  }
  return out.trim();
}
type Inspection = {
  Id: string;
  Config: { Image: string; Labels: Record<string, string>; Env: string[] };
  HostConfig: {
    Privileged: boolean;
    PidMode: string;
    IpcMode: string;
    NetworkMode: string;
    CapAdd: string[] | null;
    SecurityOpt: string[];
    Memory: number;
    MemorySwap: number;
    NanoCpus: number;
    PidsLimit: number;
    Tmpfs?: Record<string, string>;
  };
  Mounts: { Type: string; Name?: string; Source: string; Destination: string; RW: boolean }[];
  NetworkSettings: {
    Ports: Record<string, { HostIp: string; HostPort: string }[] | null>;
    Networks: Record<string, unknown>;
  };
  State: { Running: boolean };
};
const assets = [
  ["ngertiin-browser.desktop", "/home/cua/.config/autostart/ngertiin-browser.desktop"],
  ["chromium-policy.json", "/etc/chromium/policies/managed/ngertiin.json"],
  ["start-browser.sh", "/etc/ngertiin/start-browser.sh"],
] as const;

export function machineAssetsRoot() {
  const directory = process.env.NGERTIIN_MACHINE_ASSETS_DIR;
  if (directory && !isAbsolute(directory))
    throw new Error("Machine assets require an absolute operator-owned directory.");
  return directory ?? fileURLToPath(new URL("../../../../infra/machine/", import.meta.url));
}

/** Only this operator-owned module can create/inspect containers. No Docker API reaches agents. */
export class DomainRuntime {
  #tail = Promise.resolve();
  constructor(
    readonly directory: string,
    readonly installation: string,
    readonly policy: DomainPolicy | null,
    readonly assetRoot = machineAssetsRoot(),
  ) {
    if (!isAbsolute(assetRoot))
      throw new Error("Machine assets require an absolute operator-owned directory.");
  }
  private exclusive<T>(action: () => Promise<T>): Promise<T> {
    const result = this.#tail.then(action);
    this.#tail = result.then(
      () => {},
      () => {},
    );
    return result;
  }
  configuration(id: string, allowCreate = true): Retained {
    const directory = join(this.directory, "execution-domains");
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const info = lstatSync(directory);
    if (!info.isDirectory() || info.isSymbolicLink() || info.mode & 0o077)
      throw new DomainError("SCOPE_DENIED", 403);
    const path = join(directory, `${z.uuid().parse(id)}.json`);
    try {
      return retained.parse(readPrivateJson(path));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      if (!allowCreate) throw new DomainError("MACHINE_DOMAIN_MISSING", 503);
    }
    const value: Retained = {
      id,
      endpoint: "http://127.0.0.1:3211",
      token: `${crypto.randomUUID()}${crypto.randomUUID()}`,
      root: "/home/cua/workspace",
      generation: 1,
      project: `ngertiin-machine-${id}`,
      phase: "new",
      container_id: null,
    };
    writeFileSync(path, JSON.stringify(value), { mode: 0o600, flag: "wx" });
    return value;
  }
  private save(value: Retained) {
    const path = join(this.directory, "execution-domains", `${value.id}.json`);
    const temporary = `${path}.${crypto.randomUUID()}`;
    writeFileSync(temporary, JSON.stringify(value), { mode: 0o600, flag: "wx" });
    renameSync(temporary, path);
  }
  async inspect(id: string): Promise<Inspection | null> {
    const result = await docker(["inspect", `ngertiin-domain-${z.uuid().parse(id)}`], true);
    return result ? (JSON.parse(result)[0] as Inspection) : null;
  }
  async ensure(configuration: Retained) {
    return this.exclusive(async () => {
      const policy = this.policy;
      if (!policy) throw new DomainError("MACHINE_UNAVAILABLE", 503);
      let observed = await this.inspect(configuration.id);
      if (!observed) {
        // An uncertain create or a disappeared retained machine is never retried as a new machine.
        if (configuration.phase !== "new") throw new DomainError("MACHINE_DOMAIN_MISSING", 503);
        const existing = await docker([
          "ps",
          "-aq",
          "--filter",
          `label=io.ngertiin.installation=${this.installation}`,
          "--filter",
          "label=io.ngertiin.resource=execution-domain",
        ]);
        if (existing.split("\n").filter(Boolean).length >= policy.max_domains)
          throw new DomainError("MACHINE_CAPACITY", 503);
        const name = `ngertiin-domain-${configuration.id}`;
        const network = `${name}-network`;
        const volume = `${name}-home`;
        // Persist intent before the first external effect; interrupted provisioning requires inspection.
        configuration.phase = "creating";
        this.save(configuration);
        await docker([
          "network",
          "create",
          "--label",
          `io.ngertiin.domain=${configuration.id}`,
          "--opt",
          "com.docker.network.bridge.enable_icc=false",
          network,
        ]);
        await docker([
          "volume",
          "create",
          "--label",
          `io.ngertiin.domain=${configuration.id}`,
          volume,
        ]);
        const assetRoot = this.assetRoot;
        const id = await docker([
          "create",
          "--name",
          name,
          "--hostname",
          name,
          "--label",
          "io.ngertiin.resource=execution-domain",
          "--label",
          `io.ngertiin.installation=${this.installation}`,
          "--label",
          `io.ngertiin.domain=${configuration.id}`,
          "--restart",
          "unless-stopped",
          "--init",
          "--network",
          network,
          "--security-opt",
          "no-new-privileges=true",
          "--cap-drop",
          "NET_RAW",
          "--cap-drop",
          "SYS_ADMIN",
          "--cap-drop",
          "SYS_PTRACE",
          "--memory",
          `${policy.memory_mib}m`,
          "--memory-swap",
          `${policy.memory_mib}m`,
          "--cpus",
          String(policy.cpus),
          "--pids-limit",
          String(policy.pids),
          "--shm-size",
          "128m",
          // A Docker restart retains the writable layer. Stale desktop.env/bus
          // files must not let spacesd race ahead of the new X/DBus session.
          "--tmpfs",
          `/run:${runtimeTmpfs}`,
          "--publish",
          "127.0.0.1::3211",
          "--env",
          `CUA_ENV_TOKEN=${configuration.token}`,
          "--env",
          "CUA_ENV_DATA_DIR=/home/cua/.local/state/ngertiin-spacesd",
          "--env",
          "CUA_ENV_DOWNLOADS_DIR=/home/cua/workspace/downloads",
          "--env",
          "CUA_SPACESD_CURSOR_PROBE=0",
          "--env",
          "CUA_DRIVER_PERMISSION_MODE=unrestricted",
          "--env",
          "CUA_DRIVER_DANGEROUSLY_BYPASS_APPROVALS=1",
          "--mount",
          `type=volume,src=${volume},dst=/home/cua`,
          ...assets.flatMap(([file, destination]) => [
            "--mount",
            `type=bind,src=${join(assetRoot, file)},dst=${destination},readonly`,
          ]),
          DOMAIN_IMAGE,
        ]);
        configuration.container_id = id;
        configuration.phase = "retained";
        this.save(configuration);
        observed = await this.inspect(configuration.id);
      }
      if (!observed) throw new DomainError("MACHINE_DOMAIN_MISSING", 503);
      this.attest(observed, configuration);
      if (!observed.State.Running) await docker(["start", observed.Id]);
      observed = await this.inspect(configuration.id);
      if (!observed) throw new DomainError("MACHINE_DOMAIN_MISSING", 503);
      const port = observed.NetworkSettings.Ports["3211/tcp"]?.[0]?.HostPort;
      if (!port || !/^\d+$/.test(port)) throw new DomainError("MACHINE_UNAVAILABLE", 503);
      configuration.endpoint = `http://127.0.0.1:${port}`;
      configuration.container_id = observed.Id;
      configuration.phase = "retained";
      this.save(configuration);
      return observed;
    });
  }
  /** Operator recovery also attests stopped domains before reading their retained volumes. */
  attest(observed: Inspection, configuration: Retained) {
    const policy = this.policy;
    const name = `ngertiin-domain-${configuration.id}`;
    const host = observed.HostConfig;
    const ports = observed.NetworkSettings.Ports["3211/tcp"];
    const assetRoot = this.assetRoot;
    if (
      !policy ||
      (configuration.container_id && observed.Id !== configuration.container_id) ||
      observed.Config.Image !== DOMAIN_IMAGE ||
      observed.Config.Labels["io.ngertiin.installation"] !== this.installation ||
      observed.Config.Labels["io.ngertiin.domain"] !== configuration.id ||
      !observed.Config.Env.includes(`CUA_ENV_TOKEN=${configuration.token}`) ||
      host.Privileged ||
      host.PidMode ||
      !["", "private"].includes(host.IpcMode) ||
      host.CapAdd?.length ||
      !host.SecurityOpt.includes("no-new-privileges=true") ||
      host.NetworkMode !== `${name}-network` ||
      Object.keys(observed.NetworkSettings.Networks).length !== 1 ||
      host.Memory !== policy.memory_mib * 1024 * 1024 ||
      host.MemorySwap !== host.Memory ||
      host.NanoCpus !== policy.cpus * 1e9 ||
      host.PidsLimit !== policy.pids ||
      JSON.stringify(host.Tmpfs) !== JSON.stringify({ "/run": runtimeTmpfs }) ||
      (ports && (ports.length !== 1 || ports[0]?.HostIp !== "127.0.0.1")) ||
      observed.Mounts.length !== assets.length + 1 ||
      !observed.Mounts.some(
        (m) =>
          m.Type === "volume" && m.Name === `${name}-home` && m.Destination === "/home/cua" && m.RW,
      ) ||
      !assets.every(([file, destination]) =>
        observed.Mounts.some(
          (m) =>
            m.Type === "bind" &&
            m.Source === join(assetRoot, file) &&
            m.Destination === destination &&
            !m.RW,
        ),
      )
    )
      throw new DomainError("MACHINE_ISOLATION_UNSUPPORTED", 503);
  }
  /** Explicit operator-only teardown; never called by run/client shutdown. */
  async retire(id: string) {
    const configuration = this.configuration(id, false);
    const observed = await this.inspect(id);
    if (!observed) throw new DomainError("MACHINE_DOMAIN_MISSING", 503);
    this.attest(observed, configuration);
    await docker(["rm", "-f", observed.Id]);
    // Retain the named home volume. A new resolver must never silently reuse or replace it.
    await docker(["network", "rm", `ngertiin-domain-${id}-network`]);
  }
}

export class DomainCuaMachine extends CuaMachine {
  #checkedAt = 0;
  #checking?: Promise<void>;
  constructor(
    readonly runtime: DomainRuntime,
    readonly retained: Retained,
    readonly state: (
      state: "provisioning" | "ready" | "missing" | "failed",
      error: string | null,
    ) => Promise<void>,
  ) {
    super(retained);
  }
  override async client() {
    if (Date.now() - this.#checkedAt > 1000) {
      this.#checking ??= (async () => {
        try {
          if (this.retained.phase === "new") await this.state("provisioning", null);
          const previousEndpoint = this.configuration.endpoint;
          await this.runtime.ensure(this.retained);
          if (previousEndpoint !== this.configuration.endpoint) this.resetClient();
          const deadline = Date.now() + 60_000;
          while (true) {
            try {
              const health = await fetch(`${this.configuration.endpoint}/health`, {
                signal: AbortSignal.timeout(1000),
              });
              if (health.ok) break;
            } catch {
              /* Service startup is separate from Docker admission. */
            }
            if (Date.now() >= deadline) throw new DomainError("MACHINE_UNAVAILABLE", 503);
            await Bun.sleep(250);
          }
          const client = await super.client();
          const capabilities = z
            .object({
              features: z.array(
                z.object({
                  name: z.string(),
                  supported: z.boolean().default(false),
                }),
              ),
            })
            .parse(
              JSON.parse(
                await client.callJson("SystemService/GetCapabilities", "{}", undefined, {
                  signal: AbortSignal.timeout(10_000),
                }),
              ),
            );
          if (
            !capabilities.features.some(
              (feature) => feature.name === "desktop_stream" && feature.supported,
            )
          )
            throw new DomainError("MACHINE_UNAVAILABLE", 503);
          for (const directory of [
            this.configuration.root,
            `${this.configuration.root}/inputs`,
            `${this.configuration.root}/downloads`,
            `${this.configuration.root}/projects`,
          ])
            await client.makeDir(directory, undefined);
          this.#checkedAt = Date.now();
          await this.state("ready", null);
        } catch (error) {
          const code = error instanceof DomainError ? error.code : "MACHINE_UNAVAILABLE";
          await this.state(code === "MACHINE_DOMAIN_MISSING" ? "missing" : "failed", code);
          throw error;
        }
      })().finally(() => {
        this.#checking = undefined;
      });
      await this.#checking;
    }
    return super.client();
  }
  override async revokeMedia(id: string) {
    // Revocation must remain possible after membership validation starts rejecting normal work.
    const client = await super.client();
    await client.callJson(
      "StreamService/CloseMedia",
      JSON.stringify({ mediaSessionId: id }),
      undefined,
      { signal: AbortSignal.timeout(5000) },
    );
  }
}
