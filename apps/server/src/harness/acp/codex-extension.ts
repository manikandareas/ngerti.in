import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { HarnessError } from "../contracts";

export const CODEX_ACP_REVISION = "f3208913693bd4d5171d6c6b9be5ec1ff96c6431";
const upstreamSha256 = "733b7521c2a437a34ed016d45a6f46bebff2bac123a172467574ee827db98b99";

// A narrow pinned upstream hook. Session/prompt/update/cancel still use the upstream ACP implementation.
const extension = String.raw`
function ngertiinObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw RequestError.invalidParams();
  return value;
}
function ngertiinTokens(value) {
  const input = ngertiinObject(value);
  for (const key of ["accessToken", "chatgptAccountId"]) {
    if (typeof input[key] !== "string" || input[key].length === 0 || input[key].length > 16384 || /[\r\n\0]/.test(input[key]))
      throw RequestError.invalidParams();
  }
  if (input.chatgptPlanType != null && (typeof input.chatgptPlanType !== "string" || input.chatgptPlanType.length > 100))
    throw RequestError.invalidParams();
  return { accessToken: input.accessToken, chatgptAccountId: input.chatgptAccountId,
    ...(input.chatgptPlanType != null ? { chatgptPlanType: input.chatgptPlanType } : {}) };
}
async function ngertiinNative(agent, client) {
  const ready = agent.ensureAppServer();
  if (ready) await ready;
  const native = agent.codexAcpClient.appServerClient;
  if (!native.ngertiinObserved) {
    native.ngertiinObserved = true;
    native.onClientTransportEvent((event) => {
      if (event.eventType === "notification" && event.method === "turn/started") {
        const sessionId = event.params?.threadId;
        const turnId = event.params?.turn?.id;
        if (typeof sessionId === "string" && typeof turnId === "string")
          void client.notify("_ngertiin/turn", { sessionId, turnId }).catch(() => {});
      }
    });
    native.connection.onRequest("account/chatgptAuthTokens/refresh", async (params) => {
      if (!agent.ngertiinAccountId) throw RequestError.authRequired();
      const tokens = ngertiinTokens(await client.request("_ngertiin/refresh", {}));
      if (tokens.chatgptAccountId !== agent.ngertiinAccountId ||
          (params.previousAccountId && params.previousAccountId !== tokens.chatgptAccountId))
        throw RequestError.authRequired();
      return { ...tokens, chatgptPlanType: tokens.chatgptPlanType ?? null };
    });
  }
  return native;
}
`;

const handlers = `
.onRequest("_ngertiin/capabilities", emptyExtensionParamsParser, () => ({ version: 1, externalTokens: true, turnReceipts: true, turnToolCorrelation: true, accountCatalog: true, messagePhases: true, skillCatalog: true }))
.onRequest("_ngertiin/skills", ngertiinObject, async (ctx) => {
  if (typeof ctx.params.cwd !== "string" || ctx.params.cwd.length > 4000) throw RequestError.invalidParams();
  const native = await ngertiinNative(getAgent(), ctx.client);
  const response = await native.listSkills({ cwds: [ctx.params.cwd], forceReload: true });
  if (response.data.some((entry) => entry.errors.length)) throw RequestError.internalError();
  return { skills: response.data.flatMap((entry) => entry.skills.map((skill) => ({
    key: "native:codex:" + skill.scope + ":" + skill.name, name: skill.name,
    description: skill.description, native_source: skill.scope, enabled: skill.enabled
  }))) };
})
.onRequest("_ngertiin/models", ngertiinObject, async (ctx) => {
  const native = await ngertiinNative(getAgent(), ctx.client);
  return native.listModels({ cursor: typeof ctx.params.cursor === "string" ? ctx.params.cursor : null, limit: 100, includeHidden: false });
})
.onRequest("_ngertiin/account", emptyExtensionParamsParser, async (ctx) => {
  const native = await ngertiinNative(getAgent(), ctx.client);
  return native.accountRead({ refreshToken: false });
})
.onRequest("_ngertiin/external_tokens", ngertiinTokens, async (ctx) => {
  const agent = getAgent();
  const native = await ngertiinNative(agent, ctx.client);
  if (agent.ngertiinAccountId && agent.ngertiinAccountId !== ctx.params.chatgptAccountId)
    throw RequestError.authRequired();
  await native.accountLogin({ type: "chatgptAuthTokens", ...ctx.params });
  agent.ngertiinAccountId = ctx.params.chatgptAccountId;
  return {};
})
.onRequest("_ngertiin/receipt", ngertiinObject, async (ctx) => {
  const { sessionId, turnId } = ctx.params;
  if (typeof sessionId !== "string" || typeof turnId !== "string" ||
      sessionId.length > 1000 || turnId.length > 1000) throw RequestError.invalidParams();
  const native = await ngertiinNative(getAgent(), ctx.client);
  const result = await native.threadRead({ threadId: sessionId, includeTurns: true });
  const turn = result.thread.turns.find((value) => value.id === turnId);
  return { sessionId: result.thread.id, turn: turn ? {
    id: turn.id, status: turn.status,
    items: turn.items.filter((item) => item.type === "agentMessage").map((item) => ({ type: item.type, text: item.text, phase: item.phase ?? null }))
  } : null };
})
`;

function replaceOnce(source: string, before: string, after: string) {
  if (source.split(before).length !== 2) throw new HarnessError("VERSION_UNKNOWN");
  return source.replace(before, after);
}

/** Generate a private, deterministic patched module; never rewrite a globally installed package. */
export function codexExtension(executable: string, stateDirectory: string) {
  const sourcePath = realpathSync(executable);
  const source = readFileSync(sourcePath, "utf8");
  if (createHash("sha256").update(source).digest("hex") !== upstreamSha256)
    throw new HarnessError("VERSION_UNKNOWN");
  let patched = replaceOnce(
    source,
    "// src/ClientSystemPrompt.ts",
    `${extension}\n// src/ClientSystemPrompt.ts`,
  );
  const promptFailure =
    "      const err = this.recovery?.mapError(caught, promptClient) ?? caught;";
  patched = replaceOnce(
    patched,
    promptFailure,
    `${promptFailure}\n      if (err instanceof RequestError && err.code === CODEX_PROCESS_EXITED_ERROR_CODE) throw err;`,
  );
  const accountHandler = '.onRequest("authentication/status", emptyExtensionParamsParser,';
  patched = replaceOnce(patched, accountHandler, `${handlers}${accountHandler}`);
  patched = replaceOnce(
    patched,
    "  return airOnlyMeta(airClient, AIR_MESSAGE_PHASE_KEY, phase);",
    "  return { ...airOnlyMeta(airClient, AIR_MESSAGE_PHASE_KEY, phase), ngertiin: { phase } };",
  );
  // The Ngertiin bridge already validates each immutable run lease and protected operation.
  // A second blanket MCP approval would stop even read_run_context before it reaches that authority.
  // This exception names only the app-provisioned bridge; other native permissions remain interactive.
  const mcpConfig =
    '"mcp_servers": Object.fromEntries(serversToConfigure.map((mcp) => [mcp.name, toCodexMcpServerConfig(mcp.server)]))';
  patched = replaceOnce(
    patched,
    mcpConfig,
    '"mcp_servers": Object.fromEntries(serversToConfigure.map((mcp) => [mcp.name, { ...toCodexMcpServerConfig(mcp.server), ...(mcp.name === "ngertiin" ? { default_tools_approval_mode: "approve" } : {}) }]))',
  );
  const startup = "  const startup = appServerStartup(startupState);";
  patched = replaceOnce(
    patched,
    startup,
    `${startup}\n  startup.args.push(...JSON.parse(process.env.NGERTIIN_CODEX_STARTUP_ARGS || "[]"));`,
  );
  // Bundled code resolves native resources relative to its original package, not its private cache.
  patched = patched.replaceAll("import.meta.url", JSON.stringify(pathToFileURL(sourcePath).href));
  const hash = createHash("sha256").update(patched).digest("hex");
  const directory = join(stateDirectory, "acp-adapters");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, `codex-${hash}.mjs`);
  writeFileSync(path, patched, { mode: 0o600 });
  return { path, hash, upstream_sha256: upstreamSha256 };
}
