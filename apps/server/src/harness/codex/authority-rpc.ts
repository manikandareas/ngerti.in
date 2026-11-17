import { assertScopedCatalog } from "../catalog-policy";
import type { LaunchContext } from "../context";
import { HarnessError } from "../contracts";
import { OwnedProcess } from "../process";

type Message = {
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
const methods = new Set([
  "initialize",
  "account/read",
  "account/login/start",
  "account/login/cancel",
  "account/logout",
  "model/list",
]);

/** Credential authority only. This transport cannot open a thread or dispatch a model/tool turn. */
export class CodexAuthorityRpc {
  readonly process: OwnedProcess;
  readonly #pending = new Map<number, Pending>();
  #next = 0;
  #closed = false;
  onMessage: (message: Message) => void = () => {};
  constructor(executable: string, context: LaunchContext, args: string[] = []) {
    assertScopedCatalog({ ...context, scoped: true });
    this.process = new OwnedProcess(
      executable,
      [
        ...args,
        "app-server",
        "--listen",
        "stdio://",
        "-c",
        `cli_auth_credentials_store="${context.ephemeralAuth ? "ephemeral" : "file"}"`,
        "-c",
        'model_provider="openai"',
        "-c",
        `forced_login_method="${context.env.OPENAI_API_KEY ? "api" : "chatgpt"}"`,
        "-c",
        'shell_environment_policy.inherit="none"',
        ...[
          "shell_tool",
          "unified_exec",
          "computer_use",
          "browser_use",
          "multi_agent",
          "apps",
          "plugins",
          "skill_mcp_dependency_install",
        ].flatMap((feature) => ["--disable", feature]),
      ],
      { ...context, ownedProcessTree: true },
    );
    void this.read().then(
      () => this.fail(),
      () => this.fail(),
    );
    void this.process.child.exited.then(() => this.fail());
  }
  private write(message: Message) {
    if (this.#closed) throw new HarnessError("SERVICE_UNAVAILABLE", "unknown");
    this.process.child.stdin.write(`${JSON.stringify(message)}\n`);
    void Promise.resolve(this.process.child.stdin.flush()).catch(() => this.fail());
  }
  reject(id: string | number) {
    this.write({ id, error: { code: -32601, message: "Unsupported authority request." } });
  }
  request(method: string, params: unknown = {}, timeoutMs = 30_000): Promise<unknown> {
    if (!methods.has(method)) return Promise.reject(new HarnessError("CAPABILITY_UNSUPPORTED"));
    if (this.#closed) return Promise.reject(new HarnessError("SERVICE_UNAVAILABLE", "unknown"));
    const id = ++this.#next;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new HarnessError("NATIVE_UNKNOWN", "unknown"));
        void this.close().catch(() => {});
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
    for await (const bytes of this.process.child.stdout) {
      buffer += decoder.decode(bytes, { stream: true });
      if (buffer.length > 2_000_000) throw new HarnessError("PROTOCOL_ERROR", "unknown");
      while (buffer.includes("\n")) {
        const newline = buffer.indexOf("\n");
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (!line.trim()) continue;
        const message = JSON.parse(line) as Message;
        if (!message || typeof message !== "object" || Array.isArray(message))
          throw new HarnessError("PROTOCOL_ERROR", "unknown");
        if (typeof message.method === "string") this.onMessage(message);
        else if (typeof message.id === "number") {
          const pending = this.#pending.get(message.id);
          if (!pending) continue;
          clearTimeout(pending.timer);
          this.#pending.delete(message.id);
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
    void this.process.close().catch(() => {});
  }
  async initialize() {
    await this.request("initialize", {
      clientInfo: { name: "ngertiin", version: "2.4.0" },
      capabilities: { experimentalApi: true },
    });
    this.write({ method: "initialized", params: {} });
  }
  async close() {
    this.fail();
    await this.process.close();
  }
}
