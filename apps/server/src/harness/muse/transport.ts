import { MspError, type SpawnedMspConnection, spawnMspConnection } from "@muse-code/sdk";
import { Diagnostics, type LaunchContext } from "../context";
import { HarnessError } from "../contracts";

/** The official SDK owns framing and the process; application effects are never retried here. */
export class MuseTransport {
  readonly handshake;
  host: SpawnedMspConnection | undefined;
  #closed = false;
  constructor(
    executable: string,
    readonly context: LaunchContext,
    args: string[] = [],
    modelId?: string,
  ) {
    const diagnostics = new Diagnostics(context.redactor, () => {});
    this.handshake = spawnMspConnection({
      command: executable,
      args: [
        ...args,
        "serve",
        // Select only interaction and scoped app tools; the empty preset also removes questions.
        ...(context.workspace
          ? [
              "--config",
              `run.toolset=${JSON.stringify(context.purpose === "routing" ? [] : ["request_user_input", "mcp__ngertiin__*"])}`,
            ]
          : []),
        "--disable-shell",
        "--disable-write",
        "--contributor-mode",
        context.env.MUSE_CONTRIBUTOR_MODE === "1" ? "on" : "off",
        ...(modelId ? ["--model", modelId] : []),
      ],
      env: { ...context.env },
      cwd: context.state_directory,
      shutdownTimeoutMs: 500,
      onStderr: (text) => diagnostics.push(new TextEncoder().encode(text)),
    });
    context.signal?.addEventListener("abort", () => void this.close(), { once: true });
    if (context.signal?.aborted) void this.close();
  }
  async bounded<T>(operation: Promise<T>, effect = false, timeout = 30_000): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            void this.close();
            reject(
              new HarnessError(
                effect ? "NATIVE_UNKNOWN" : "SERVICE_UNAVAILABLE",
                effect ? "unknown" : "not_dispatched",
              ),
            );
          }, timeout);
        }),
      ]);
    } catch (error) {
      if (error instanceof HarnessError) throw error;
      if (
        error instanceof MspError &&
        ["commandRejected", "invalidParams", "capabilityRequired", "notFound"].includes(error.kind)
      )
        throw new HarnessError("NATIVE_REJECTED");
      throw new HarnessError(
        effect ? "NATIVE_UNKNOWN" : "SERVICE_UNAVAILABLE",
        effect ? "unknown" : "not_dispatched",
      );
    } finally {
      clearTimeout(timer);
    }
  }
  async initialize() {
    this.host = await this.bounded(
      this.handshake.initialize({
        clientInfo: { name: "ngertiin", version: "1.0.0" },
        capabilities: { experimentalApi: true, requestedCapabilities: ["sessionMcp"] },
      }),
    );
    if (
      this.#closed ||
      this.host.initializeResult.schema.version !== 1 ||
      this.host.fingerprintWarning
    )
      throw new HarnessError("PROTOCOL_ERROR");
    return this.host;
  }
  get connection() {
    if (!this.host || this.#closed) throw new HarnessError("ADAPTER_UNAVAILABLE");
    return this.host.connection;
  }
  read(method: string, params: Record<string, unknown> = {}) {
    if (!this.host || this.#closed) throw new HarnessError("ADAPTER_UNAVAILABLE");
    return this.bounded(this.host.connection.request(method, params));
  }
  command(method: string, params: Record<string, unknown>, commandId?: string) {
    if (!this.host || this.#closed) throw new HarnessError("ADAPTER_UNAVAILABLE");
    return this.bounded(
      this.host.connection.command(method, params, {
        maxAttempts: 1,
        ...(commandId ? { commandId } : {}),
      }),
      true,
    );
  }
  async close() {
    this.#closed = true;
    await this.handshake.close().catch(() => {});
  }
}
