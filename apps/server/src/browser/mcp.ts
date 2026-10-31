import { DomainError } from "../contracts";
import { browserResult } from "./contracts";

/** Direct MCP JSONL only. Neither a browser Agent nor a provider credential enters this process. */
export class BrowserMcp {
  readonly child;
  readonly #pending = new Map<
    number,
    { resolve(value: unknown): void; reject(error: unknown): void }
  >();
  #sequence = 0;
  #closed = false;
  constructor(command: string[]) {
    this.child = Bun.spawn(command, { stdin: "pipe", stdout: "pipe", stderr: "ignore" });
    void this.read().catch(() => this.fail());
    void this.child.exited.then(() => this.fail());
  }
  private fail() {
    this.#closed = true;
    for (const item of this.#pending.values()) item.reject(new DomainError("BROWSER_UNKNOWN"));
    this.#pending.clear();
  }
  private async read() {
    let buffer = "";
    const decoder = new TextDecoder();
    for await (const bytes of this.child.stdout) {
      buffer += decoder.decode(bytes, { stream: true });
      if (buffer.length > 12_000_000) throw new DomainError("BROWSER_UNKNOWN");
      let end = buffer.indexOf("\n");
      while (end >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        const frame = JSON.parse(line);
        const pending = this.#pending.get(frame.id);
        if (pending) {
          this.#pending.delete(frame.id);
          if (frame.error) pending.reject(new DomainError("BROWSER_ACTION_FAILED"));
          else pending.resolve(frame.result);
        }
        end = buffer.indexOf("\n");
      }
    }
  }
  async request(method: string, params: unknown) {
    if (this.#closed) throw new DomainError("BROWSER_UNAVAILABLE");
    const id = ++this.#sequence;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const response = new Promise<unknown>((resolve, reject) => {
        this.#pending.set(id, { resolve, reject });
        timer = setTimeout(() => {
          this.close();
          reject(new DomainError("BROWSER_UNKNOWN"));
        }, 25_000);
      });
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      return await response;
    } finally {
      clearTimeout(timer);
      this.#pending.delete(id);
    }
  }
  async initialize() {
    await this.request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "ngertiin-browser-gateway", version: "1.0.0" },
    });
    this.child.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`,
    );
  }
  async call(name: string, args: unknown) {
    return browserResult.parse(await this.request("tools/call", { name, arguments: args }));
  }
  close() {
    this.fail();
    this.child.stdin.end();
    if (this.child.exitCode === null) this.child.kill("SIGKILL");
  }
}
