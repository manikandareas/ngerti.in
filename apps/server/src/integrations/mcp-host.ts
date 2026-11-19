import { createHash } from "node:crypto";
import { z } from "zod";
import { DomainError } from "../contracts";
import { appActionPolicy } from "./contracts";
import type {
  AppActionPolicy,
  AppHost,
  AppSessionConfig,
  AppSessionIdentity,
  AppTool,
} from "./host";
import { appOutput } from "./output";

const protocolVersion = "2025-06-18";
const server = z.strictObject({
  id: z.string().regex(/^mcp_[a-z][a-z0-9_]{0,70}$/),
  name: z.string().trim().min(1).max(120),
  url: z.url(),
  bearer_env: z
    .string()
    .regex(/^NGERTIIN_MCP_[A-Z0-9_]+$/)
    .optional(),
  actions: z.record(z.string().min(1).max(150), appActionPolicy).default({}),
});
type Server = z.infer<typeof server> & { token?: string };
const toolSchema = z.object({
  name: z.string().min(1).max(150),
  description: z.string().max(5000).optional(),
  inputSchema: z.record(z.string(), z.unknown()),
});
const toolsPage = z.object({
  tools: toolSchema.array().max(100),
  nextCursor: z.string().max(1000).optional(),
});
const frameSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.string().optional(),
  result: z.unknown().optional(),
  error: z.unknown().optional(),
});
const callResult = z.object({
  content: z.array(z.unknown()).max(100),
  structuredContent: z.unknown().optional(),
  isError: z.boolean().optional(),
});

export function parseMcpServers(env: Record<string, string | undefined>, development: boolean) {
  const approved = server
    .array()
    .max(40)
    .parse(JSON.parse(env.NGERTIIN_MCP_SERVERS ?? "[]"));
  if (new Set(approved.map(({ id }) => id)).size !== approved.length)
    throw new Error("Duplicate MCP connector.");
  return approved.map((entry): Server => {
    const url = new URL(entry.url);
    const loopback = development && url.protocol === "http:" && url.hostname === "127.0.0.1";
    if (
      url.username ||
      url.password ||
      url.hash ||
      url.search ||
      (!loopback && url.protocol !== "https:")
    )
      throw new Error("MCP connectors require an approved HTTPS endpoint.");
    const token = entry.bearer_env ? env[entry.bearer_env] : undefined;
    if (entry.bearer_env && (!token?.trim() || /[\r\n\0]/.test(token)))
      throw new Error("MCP connector credential is unavailable.");
    return { ...entry, token };
  });
}

function accountId(user: string, toolkit: string) {
  return `mcp:${toolkit}:${createHash("sha256").update(user).digest("hex").slice(0, 32)}`;
}

async function result(response: Response, id: string) {
  const reader = response.body?.getReader();
  if (!reader) throw new DomainError("APP_UNAVAILABLE");
  const sse = response.headers.get("Content-Type")?.startsWith("text/event-stream");
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  const parse = (input: string) => {
    const frame = frameSchema.safeParse(JSON.parse(input));
    if (!frame.success || frame.data.id !== id) return null;
    return frame.data;
  };
  try {
    while (true) {
      const packet = await reader.read();
      if (packet.done) break;
      bytes += packet.value.byteLength;
      if (bytes > 262_144) throw new DomainError("APP_UNAVAILABLE");
      text += decoder.decode(packet.value, { stream: true });
      if (!sse) continue;
      let boundary = /\r?\n\r?\n/.exec(text);
      while (boundary) {
        const data = text
          .slice(0, boundary.index)
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        text = text.slice(boundary.index + boundary[0].length);
        const frame = data ? parse(data) : null;
        if (frame) return frame;
        boundary = /\r?\n\r?\n/.exec(text);
      }
    }
    const frame = sse ? null : parse(text + decoder.decode());
    if (frame) return frame;
    throw new DomainError("APP_UNAVAILABLE");
  } finally {
    void reader.cancel().catch(() => {});
  }
}

class McpPeer {
  private session?: string;
  constructor(private readonly config: Server) {}

  private headers() {
    return {
      "MCP-Protocol-Version": protocolVersion,
      ...(this.config.token ? { Authorization: `Bearer ${this.config.token}` } : {}),
      ...(this.session ? { "Mcp-Session-Id": this.session } : {}),
    };
  }

  private async send(method: string, params?: unknown): Promise<z.infer<typeof frameSchema>> {
    const notification = method === "notifications/initialized";
    const requestId = crypto.randomUUID();
    const response = await fetch(this.config.url, {
      method: "POST",
      redirect: "error",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        ...this.headers(),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        ...(notification ? {} : { id: requestId }),
        method,
        ...(params === undefined ? {} : { params }),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      throw new DomainError(response.status === 401 ? "APP_AUTH_REQUIRED" : "APP_UNAVAILABLE");
    }
    if (method === "initialize") {
      const session = response.headers.get("Mcp-Session-Id") ?? undefined;
      if (session && !/^[!-~]{1,256}$/.test(session)) throw new DomainError("APP_UNAVAILABLE");
      this.session = session;
    }
    if (notification) {
      void response.body?.cancel().catch(() => {});
      return { jsonrpc: "2.0" };
    }
    return await result(response, requestId);
  }

  async discover() {
    const initial = await this.send("initialize", {
      protocolVersion,
      clientInfo: { name: "ngertiin", version: "1.0.0" },
      capabilities: {},
    });
    z.object({
      protocolVersion: z.literal(protocolVersion),
      capabilities: z.object({ tools: z.record(z.string(), z.unknown()) }),
    }).parse(initial.result);
    await this.send("notifications/initialized");
    const tools = new Map<string, { name: string; view: AppTool; policy: AppActionPolicy }>();
    let cursor: string | undefined;
    for (let page = 0; page < 4; page++) {
      const response = await this.send("tools/list", cursor ? { cursor } : {});
      const catalog = toolsPage.parse(response.result);
      for (const item of catalog.tools) {
        if (this.config.token && JSON.stringify(item).includes(this.config.token))
          throw new DomainError("APP_UNAVAILABLE");
        const slug = `MCP_${item.name.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}`;
        if (tools.has(slug) || tools.size >= 100) throw new DomainError("APP_UNAVAILABLE");
        const configured = Object.hasOwn(this.config.actions, item.name)
          ? this.config.actions[item.name]
          : undefined;
        const policy = configured ?? { mutability: "write" as const, units: 1 };
        tools.set(slug, {
          name: item.name,
          policy,
          view: {
            slug,
            toolkit: this.config.id,
            description: item.description,
            input_schema: item.inputSchema,
            action_policy: policy,
          },
        });
      }
      if (!catalog.nextCursor) return tools;
      cursor = catalog.nextCursor;
    }
    throw new DomainError("APP_UNAVAILABLE");
  }

  async call(name: string, args: Record<string, unknown>) {
    const response = await this.send("tools/call", { name, arguments: args });
    if (response.error) throw new DomainError("APP_UNAVAILABLE");
    const output = callResult.parse(response.result);
    return { data: appOutput(output, this.config.token ?? ""), failed: !!output.isError };
  }

  async close() {
    if (!this.session) return;
    try {
      const response = await fetch(this.config.url, {
        method: "DELETE",
        redirect: "error",
        headers: this.headers(),
        signal: AbortSignal.timeout(1000),
      });
      void response.body?.cancel().catch(() => {});
    } catch {
      // A remote connection can expire before the client closes it.
    }
  }
}

/** MCP endpoints are deployment configuration. The user selects the connection and tool grants. */
export class McpHost implements AppHost {
  constructor(private readonly servers: readonly Server[]) {}
  get configured() {
    return this.servers.length > 0;
  }
  has(toolkit: string) {
    return this.servers.some(({ id }) => id === toolkit);
  }
  async catalog(_user: string, search: string) {
    const query = search.toLowerCase();
    return {
      items: this.servers
        .filter(({ id, name }) => `${id} ${name}`.toLowerCase().includes(query))
        .map(({ id, name }) => ({
          slug: id,
          name,
          connected: false,
          no_auth: true,
          description: "Managed MCP connector",
          categories: [{ slug: "mcp", name: "MCP" }],
        })),
      metadata_complete: true,
    };
  }
  async accounts(user: string) {
    return this.servers.map(({ id }) => ({ id: accountId(user, id), toolkit: id, active: true }));
  }
  async connect(user: string, toolkit: string) {
    const config = this.servers.find(({ id }) => id === toolkit);
    if (!config) throw new DomainError("APP_UNAVAILABLE");
    await this.withTools(new McpPeer(config), () => {});
    return { account_id: accountId(user, toolkit), connect_url: null };
  }
  async session(user: string, config: AppSessionConfig) {
    const id = accountId(user, config.toolkit);
    if (!this.has(config.toolkit) || id !== config.account_id)
      throw new DomainError("APP_AUTH_REQUIRED");
    return id;
  }
  private peer(session: string, expected?: AppSessionIdentity) {
    const config = this.servers.find(
      ({ id }) =>
        expected && session === expected.account && accountId(expected.user, id) === session,
    );
    if (!config) throw new DomainError("APP_AUTH_REQUIRED");
    return new McpPeer(config);
  }
  private async withTools<T>(
    peer: McpPeer,
    processTools: (tools: Awaited<ReturnType<McpPeer["discover"]>>) => T | Promise<T>,
  ) {
    try {
      return await processTools(await peer.discover());
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError("APP_UNAVAILABLE");
    } finally {
      await peer.close();
    }
  }
  async search(session: string, query: string, expected?: AppSessionIdentity) {
    const match = query.toLowerCase();
    return await this.withTools(this.peer(session, expected), (tools) =>
      [...tools.values()]
        .filter(({ name, view }) =>
          `${name} ${view.slug} ${view.description ?? ""}`.toLowerCase().includes(match),
        )
        .map(({ view }) => view),
    );
  }
  async execute(
    session: string,
    account: string,
    tool: string,
    args: Record<string, unknown>,
    authorize: (policy?: AppActionPolicy) => void | Promise<void>,
    expected?: AppSessionIdentity,
  ): ReturnType<AppHost["execute"]> {
    if (account !== session) throw new DomainError("APP_AUTH_REQUIRED");
    const peer = this.peer(session, expected);
    return await this.withTools(peer, async (tools) => {
      const selected = tools.get(tool);
      if (!selected) throw new DomainError("SCOPE_DENIED", 403);
      await authorize(selected.policy);
      const output = await peer.call(selected.name, args);
      return { data: output.data, state: output.failed ? "failed" : "succeeded", log_id: null };
    });
  }
}
