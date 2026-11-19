import { realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { patchedModule, replaceOnce } from "./patched-module";

// svkozak/pi-acp b0581c9: forward ACP MCP configuration into the pinned Pi native config,
// deliver server-owned startup instructions/options, and preserve native prompt errors.
const nativeConfiguration = `
import * as ngertiinFs from "node:fs";
import * as ngertiinPath from "node:path";
function ngertiinMcp(params) {
  const servers = params.mcpServers;
  if (process.env.NGERTIIN_PI_NO_MCP === "1" && Array.isArray(servers) && servers.length === 0) return;
  if (!Array.isArray(servers) || servers.length !== 1) throw RequestError3.invalidParams();
  const server = servers[0];
  const url = new URL(server.url);
  if (server.name !== "ngertiin" || server.type !== "http" || url.protocol !== "http:" ||
      url.hostname !== "127.0.0.1" || url.pathname !== "/mcp" || url.username || url.password)
    throw RequestError3.invalidParams();
  const headers = Object.fromEntries(server.headers.map((entry) => [entry.name, entry.value]));
  const dir = process.env.PI_CODING_AGENT_DIR;
  if (!dir) throw RequestError3.internalError();
  ngertiinFs.mkdirSync(dir, { recursive: true, mode: 448 });
  ngertiinFs.writeFileSync(ngertiinPath.join(dir, "mcp.json"), JSON.stringify({
    autoEnableCodemode: false,
    mcpServers: { ngertiin: { url: server.url, headers, exposure: "direct" } }
  }), { mode: 384 });
}
`;

export function piExtension(executable: string, directory: string) {
  return patchedModule(
    executable,
    directory,
    "324aeb8bba1228937e16b1326fb3e014e2a625b2dea549dbcd49b006cd5df6a2",
    (source) => {
      let patched = replaceOnce(
        source,
        "// src/acp/auth.ts",
        `${nativeConfiguration}\n// src/acp/auth.ts`,
      );
      patched = replaceOnce(
        patched,
        "  sendStartupInfoIfPending() {",
        "  sendStartupInfoIfPending() {\n    this.startupInfoSent = true;\n    return;",
      );
      for (const operation of ["newSession", "loadSession"])
        patched = replaceOnce(
          patched,
          `  async ${operation}(params) {`,
          `  async ${operation}(params) {\n    ngertiinMcp(params);`,
        );
      patched = replaceOnce(
        patched,
        'const args = ["--mode", "rpc", "--no-themes"];',
        'const args = ["--mode", "rpc", "--no-themes", ...JSON.parse(process.env.NGERTIIN_PI_STARTUP_ARGS || "[]")];',
      );
      patched = replaceOnce(
        patched,
        '    child.stderr.on("data", () => {\n    });',
        '    child.stderr.on("data", (chunk) => { process.stderr.write(chunk); });',
      );
      patched = replaceOnce(
        patched,
        "mcpCapabilities: { http: false, sse: false }",
        "mcpCapabilities: { http: true, sse: false }",
      );
      // Pi 1.5.2's message_end carries the authoritative assistant stop reason.
      // agent_settled alone also follows provider failures, retries and compaction.
      patched = replaceOnce(
        patched,
        "  cancelRequested = false;",
        "  cancelRequested = false;\n  ngertiinStopReason = null;\n  ngertiinCredentialRejected = false;\n  ngertiinUsage = null;",
      );
      patched = replaceOnce(
        patched,
        "  startTurn(t) {\n    this.cancelRequested = false;",
        "  startTurn(t) {\n    this.cancelRequested = false;\n    this.ngertiinStopReason = null;\n    this.ngertiinCredentialRejected = false;\n    this.ngertiinUsage = null;",
      );
      patched = replaceOnce(
        patched,
        '      case "turn_end": {\n        break;',
        `      case "message_end": {
        const message = ev.message;
        if (message?.role === "assistant") {
          this.ngertiinStopReason = message.stopReason;
          // shortcut: Pi 1.5.2 flattens this transport's HTTP status, switch to typed status when exposed.
          this.ngertiinCredentialRejected = message.stopReason === "error" &&
            message.api === "openai-completions" && /^401(?:[:\\s]|$)/.test(message.errorMessage ?? "");
          if (process.env.NGERTIIN_PI_NO_MCP === "1" && message.usage?.totalTokens > 0) {
            this.ngertiinUsage = {
              input_tokens: (this.ngertiinUsage?.input_tokens ?? 0) + message.usage.input,
              output_tokens: (this.ngertiinUsage?.output_tokens ?? 0) + message.usage.output,
              total_tokens: (this.ngertiinUsage?.total_tokens ?? 0) + message.usage.totalTokens,
            };
          }
        }
        break;
      }
      case "turn_end": {
        break;`,
      );
      patched = replaceOnce(
        patched,
        '    const reason = this.cancelRequested ? "cancelled" : "end_turn";',
        '    const reason = this.cancelRequested || this.ngertiinStopReason === "aborted" ? "cancelled" : this.ngertiinStopReason === "error" ? "error" : this.ngertiinStopReason === "length" ? "max_tokens" : "end_turn";',
      );
      patched = replaceOnce(
        patched,
        'const stopReason = result === "error" ? session.wasCancelRequested() ? "cancelled" : "end_turn" : result;\n    return { stopReason };',
        `if (result === "error" && !session.wasCancelRequested()) {
      if (session.ngertiinCredentialRejected) throw RequestError3.authRequired({ credentialRejected: true });
      throw RequestError3.internalError();
    }
    const stopReason = result === "error" ? "cancelled" : result;
    return {
      stopReason,
      ...(session.ngertiinUsage ? { _meta: { ngertiinUsage: session.ngertiinUsage } } : {})
    };`,
      );
      return patched;
    },
  );
}

/** Alternative candidate gets the same scoped loader/tool policy for an honest comparison. */
export function openmaExtension(executable: string, directory: string) {
  const source = join(dirname(realpathSync(executable)), "chunk-5IXHVFXW.js");
  const patched = patchedModule(
    source,
    directory,
    "f4c2b485e9a9cac894149366c362b6c7625aaeaa5fe04e5fb9c6b761afee4f79",
    (input) => {
      let output = replaceOnce(
        input,
        "        resourceLoaderOptions: {",
        `        resourceLoaderOptions: {
          noExtensions: true, noSkills: true, noPromptTemplates: true, noContextFiles: true,
          appendSystemPrompt: process.env.NGERTIIN_PI_INSTRUCTIONS ? [process.env.NGERTIIN_PI_INSTRUCTIONS] : [],`,
      );
      output = replaceOnce(
        output,
        "        services,\n        sessionManager: sm,",
        '        services,\n        tools: ["mcp__ngertiin__*"],\n        sessionManager: sm,',
      );
      output = replaceOnce(
        output,
        "    this.pendingOpens.add(promise);\n    try {\n      return await promise;\n    } finally {",
        '    this.pendingOpens.add(promise);\n    try {\n      return await promise;\n    } catch (error) {\n      console.error("ACP session setup failed", error);\n      throw error;\n    } finally {',
      );
      return output;
    },
  );
  return {
    ...patched,
    entry: `import { resolveSettings, serve } from ${JSON.stringify(pathToFileURL(patched.path).href)};
const server = serve({ settings: resolveSettings(process.argv.slice(2)) });
let closing = false;
const close = () => {
  if (closing) return;
  closing = true;
  void server.agent.dispose().finally(() => process.exit(0));
};
process.stdin.on("end", close);
process.stdin.on("close", close);
await server.closed;
close();
`,
  };
}
