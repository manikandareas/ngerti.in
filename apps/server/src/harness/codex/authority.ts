import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { Inspection } from "../client";
import type { LaunchContext } from "../context";
import { HarnessError, unknownCapabilities } from "../contracts";
import { CodexAuthorityRpc } from "./authority-rpc";
import { codexModels } from "./models";

/** Retained credential authority only. It has no session, prompt, tool, steer or recovery interface. */
export class CodexAuthority {
  readonly rpc: CodexAuthorityRpc;
  constructor(
    executable: string,
    readonly context: LaunchContext,
    args: string[] = [],
  ) {
    if (context.codexAuth) throw new HarnessError("CAPABILITY_UNSUPPORTED");
    mkdirSync(join(context.state_directory, "account-workspace"), { recursive: true, mode: 0o700 });
    this.rpc = new CodexAuthorityRpc(executable, context, args);
    this.rpc.onMessage = (message) => {
      if (message.id !== undefined) this.rpc.reject(message.id);
    };
  }
  async initialize() {
    await this.rpc.initialize();
    if (this.context.env.OPENAI_API_KEY)
      await this.rpc.request("account/login/start", {
        type: "apiKey",
        apiKey: this.context.env.OPENAI_API_KEY,
      });
  }
  async inspect(): Promise<Inspection> {
    const result = z
      .object({
        account: z
          .discriminatedUnion("type", [
            z.object({ type: z.literal("apiKey") }),
            z.object({
              type: z.literal("chatgpt"),
              email: z.string().nullable(),
              planType: z.string(),
            }),
          ])
          .nullable(),
      })
      .parse(await this.rpc.request("account/read", { refreshToken: false }));
    const key = this.context.env.OPENAI_API_KEY;
    if (result.account && (result.account.type === "apiKey") !== !!key)
      throw new HarnessError("BILLING_MISMATCH");
    let identity = result.account?.type === "chatgpt" ? result.account.email : null;
    if (!key && result.account) {
      try {
        const stored = JSON.parse(
          readFileSync(join(this.context.env.CODEX_HOME, "auth.json"), "utf8"),
        );
        if (typeof stored?.tokens?.account_id === "string" && stored.tokens.account_id)
          identity = stored.tokens.account_id;
      } catch {
        /* Older protocol fixtures may expose only email identity. */
      }
      if (!identity) throw new HarnessError("AUTH_REJECTED");
    }
    let accountId: string | null = null;
    if (result.account) {
      const source = key ?? identity;
      if (!source) throw new HarnessError("AUTH_REJECTED");
      accountId = createHash("sha256").update(source).digest("hex");
    }
    return {
      login: result.account ? "authenticated" : "required",
      account_id: accountId,
      account_plan: result.account?.type === "chatgpt" ? result.account.planType : null,
      auth_method: key ? "api_key" : "native_login",
      billing_source: key ? "api_key" : "subscription",
      capabilities: { ...unknownCapabilities },
    };
  }
  discoverModels() {
    return codexModels((cursor) =>
      this.rpc.request("model/list", { cursor, limit: 100, includeHidden: false }),
    );
  }
  close() {
    return this.rpc.close();
  }
}
