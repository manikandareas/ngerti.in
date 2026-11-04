import { z } from "zod";
import { DomainError } from "../contracts";
import type { ToolScope } from "./contracts";

type ToolBridge = {
  scope(token: string): ToolScope;
  list(scope: ToolScope): { name: string; inputSchema: unknown }[];
  call(token: string, scope: ToolScope, name: string, input: unknown): Promise<unknown>;
};

/** Per-lease MCP negotiation; scope and effect authorization stay with ProductTools. */
export class ProductToolMcp {
  readonly #negotiated = new Set<string>();
  readonly #initialized = new Set<string>();
  constructor(private readonly tools: ToolBridge) {}

  revoke(token: string) {
    this.#negotiated.delete(token);
    this.#initialized.delete(token);
  }

  clear() {
    this.#negotiated.clear();
    this.#initialized.clear();
  }

  async rpc(token: string, input: unknown) {
    const request = z
      .strictObject({
        jsonrpc: z.literal("2.0"),
        id: z.union([z.string(), z.number().int()]).optional(),
        method: z.string(),
        params: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(input);
    const scope = this.tools.scope(token);
    if (request.method === "notifications/initialized" && request.id === undefined) {
      if (!this.#negotiated.has(token)) throw new DomainError("CONFLICT");
      this.#initialized.add(token);
      return null;
    }
    if (request.id === undefined) throw new DomainError("INVALID_REQUEST", 422);
    if (!["initialize", "ping"].includes(request.method) && !this.#initialized.has(token))
      throw new DomainError("CONFLICT");
    let result: unknown;
    switch (request.method) {
      case "initialize": {
        z.object({
          protocolVersion: z.string(),
          capabilities: z.record(z.string(), z.unknown()),
          clientInfo: z.object({ name: z.string(), version: z.string() }),
        }).parse(request.params);
        this.#negotiated.add(token);
        result = {
          protocolVersion: "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "ngertiin-product-tools", version: "1.0.0" },
        };
        break;
      }
      case "ping":
        result = {};
        break;
      case "tools/list":
        result = {
          tools: this.tools.list(scope),
        };
        break;
      case "tools/call": {
        const params = z
          .strictObject({ name: z.string(), arguments: z.unknown() })
          .parse(request.params);
        try {
          const value = await this.tools.call(token, scope, params.name, params.arguments);
          result = {
            content: toolContent(params.name, value),
            structuredContent: {
              result:
                params.name === "ngertiin.computer_call" &&
                value &&
                typeof value === "object" &&
                "content" in value
                  ? {
                      structuredJson: "structuredJson" in value ? value.structuredJson : null,
                      isError: "isError" in value ? value.isError : false,
                    }
                  : params.name === "ngertiin.browser_action" &&
                      value &&
                      typeof value === "object" &&
                      "receipt" in value
                    ? { receipt: value.receipt }
                    : value,
            },
            isError:
              params.name === "ngertiin.computer_call" &&
              value !== null &&
              typeof value === "object" &&
              "isError" in value &&
              value.isError === true,
          };
        } catch (error) {
          result = {
            content: [
              {
                type: "text",
                text:
                  error instanceof DomainError
                    ? error.code
                    : error instanceof z.ZodError
                      ? "INVALID_REQUEST. Read ngertiin.describe_tools for the exact argument schema."
                      : "TOOL_FAILED",
              },
            ],
            isError: true,
          };
        }
        break;
      }
      default:
        return {
          jsonrpc: "2.0",
          id: request.id,
          error: { code: -32601, message: "Method not found." },
        };
    }
    return { jsonrpc: "2.0", id: request.id, result };
  }
}

function toolContent(name: string, value: unknown) {
  if (
    name === "ngertiin.computer_call" &&
    value &&
    typeof value === "object" &&
    "content" in value &&
    Array.isArray(value.content)
  ) {
    return [
      {
        type: "text",
        text: JSON.stringify({
          structuredJson: "structuredJson" in value ? value.structuredJson : null,
          isError: "isError" in value ? value.isError : false,
        }),
      },
      ...value.content,
    ];
  }
  if (
    name === "ngertiin.browser_action" &&
    value &&
    typeof value === "object" &&
    "content" in value &&
    "receipt" in value
  ) {
    return [
      { type: "text", text: JSON.stringify({ receipt: value.receipt }) },
      ...(value.content as unknown[]),
    ];
  }
  return [{ type: "text", text: JSON.stringify(value) }];
}
