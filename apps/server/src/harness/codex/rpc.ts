import type { LaunchContext } from "../context";
import { HarnessError } from "../contracts";
import { OwnedProcess } from "../process";
import { workspacePolicy } from "./workspace-policy";

export type RpcMessage = {
  id?: string | number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
};
type Pending = {
  resolve(value: unknown): void;
  reject(error: HarnessError): void;
  timer: ReturnType<typeof setTimeout>;
};
/** One owned stdio transport. Never replay a request after a lost acknowledgement. */
export class CodexRpc {
  readonly process: OwnedProcess;
  readonly #pending = new Map<number, Pending>();
  #next = 0;
  #closed = false;
  onMessage: (message: RpcMessage) => void = () => {};
  onFailure: () => void = () => {};
  constructor(executable: string, context: LaunchContext, args: string[] = []) {
    this.process = new OwnedProcess(
      executable,
      [
        ...args,
        "app-server",
        "--listen",
        "stdio://",
        "-c",
        'cli_auth_credentials_store="file"',
        "-c",
        'model_provider="openai"',
        "-c",
        `forced_login_method="${context.env.OPENAI_API_KEY ? "api" : "chatgpt"}"`,
        "-c",
        'shell_environment_policy.inherit="none"',
        ...workspacePolicy(context),
        ...(context.workspace && !context.machine && context.purpose !== "routing"
          ? ["--enable", "shell_tool", "--enable", "unified_exec"]
          : ["--disable", "shell_tool", "--disable", "unified_exec"]),
        "--disable",
        "computer_use",
        "--disable",
        "browser_use",
        "--disable",
        "multi_agent",
      ],
      context,
    );
    void this.read().then(
      () => this.fail(),
      () => this.fail(),
    );
    void this.process.child.exited.then(() => this.fail());
  }
  private write(message: RpcMessage) {
    if (this.#closed) throw new HarnessError("SERVICE_UNAVAILABLE", "unknown");
    this.process.child.stdin.write(`${JSON.stringify(message)}\n`);
    void Promise.resolve(this.process.child.stdin.flush()).catch(() => this.fail());
  }
  notify(method: string, params: unknown = {}) {
    this.write({ method, params });
  }
  respond(id: string | number, result: unknown) {
    this.write({ id, result });
  }
  reject(id: string | number) {
    this.write({ id, error: { code: -32601, message: "Unsupported client request." } });
  }
  request(method: string, params: unknown = {}, timeoutMs = 30_000): Promise<unknown> {
    if (this.#closed) return Promise.reject(new HarnessError("SERVICE_UNAVAILABLE", "unknown"));
    const id = ++this.#next;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new HarnessError("NATIVE_UNKNOWN", "unknown"));
        // A late session/start response cannot safely become a new implicit request.
        void this.close();
      }, timeoutMs);
      this.#pending.set(id, { resolve, reject, timer });
      try {
        this.write({ id, method, params });
      } catch {
        this.fail();
      }
    });
  }
  private async read() {
    const decoder = new TextDecoder();
    let buffer = "";
    for await (const chunk of this.process.child.stdout) {
      buffer += decoder.decode(chunk, { stream: true });
      if (buffer.length > 2_000_000) throw new HarnessError("PROTOCOL_ERROR", "unknown");
      while (buffer.includes("\n")) {
        const newline = buffer.indexOf("\n");
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (!line.trim()) continue;
        const message = JSON.parse(line) as RpcMessage;
        if (!message || typeof message !== "object")
          throw new HarnessError("PROTOCOL_ERROR", "unknown");
        if (typeof message.method === "string") this.onMessage(message);
        else if (typeof message.id === "number") {
          const pending = this.#pending.get(message.id);
          if (!pending) continue;
          clearTimeout(pending.timer);
          this.#pending.delete(message.id);
          // Native exception text is never forwarded across the adapter boundary.
          if (message.error !== undefined) pending.reject(new HarnessError("NATIVE_REJECTED"));
          else pending.resolve(message.result);
        } else throw new HarnessError("PROTOCOL_ERROR", "unknown");
      }
    }
    if (buffer.trim()) throw new HarnessError("PROTOCOL_ERROR", "unknown");
  }
  private fail() {
    if (this.#closed) return;
    this.#closed = true;
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new HarnessError("NATIVE_UNKNOWN", "unknown"));
    }
    this.#pending.clear();
    this.onFailure();
    void this.process.close();
  }
  async initialize() {
    await this.request("initialize", {
      clientInfo: { name: "ngertiin", version: "1.0.0" },
      capabilities: { experimentalApi: true },
    });
    this.notify("initialized");
  }
  async close() {
    this.fail();
    await this.process.close();
  }
}
