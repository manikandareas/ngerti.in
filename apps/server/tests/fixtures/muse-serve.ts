/** Native process fixture only: no Muse inference or subscription billing occurs here. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { EXPECTED_SCHEMA_FINGERPRINT } from "@muse-code/sdk";

const home = process.env.HOME as string;
mkdirSync(home, { recursive: true });
let config: { url: string; headers: Record<string, string> };
let session: Record<string, unknown>;
let items: Record<string, unknown>[] = [];
let active: { id: string; input: string } | null = null;
let lastTurn: { turnId: string; terminal: string } | undefined;
let cursor = 0;
function notify(method: string, params: Record<string, unknown>) {
  process.stdout.write(
    `${JSON.stringify({ jsonrpc: "2.0", method, params: { sessionId: session?.sessionId, viewCursor: String(++cursor), ...params } })}\n`,
  );
}
function persist() {
  writeFileSync(
    join(home, `${session.sessionId}.json`),
    JSON.stringify({ session, items, lastTurn }),
  );
}
function finish(
  text: string,
  terminal = "completed",
  error?: { kind: string; retryable: boolean },
) {
  if (!active) return;
  const value = {
    itemId: crypto.randomUUID(),
    kind: "agentMessage",
    revision: 1,
    status: terminal === "completed" ? "completed" : "inProgress",
    text,
    turnId: active.id,
  };
  items.push(value);
  lastTurn = { turnId: active.id, terminal };
  persist();
  if (active.input.startsWith("crash-after-commit:")) process.exit(1);
  notify("item/completed", { item: value });
  notify("turn/completed", { turnId: active.id, terminal, error });
  active = null;
}
function fail(id: string | number, kind = "commandRejected") {
  process.stdout.write(
    `${JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32030, message: "Fixture rejected.", data: { kind, retryable: false } } })}\n`,
  );
}
createInterface({ input: process.stdin }).on("line", (line) => {
  void handle(JSON.parse(line));
});
async function handle(request: {
  id: string | number;
  method: string;
  params: {
    sessionId: string;
    modelId: string;
    providerId: string;
    commandId: string;
    config: { mcpServers: { ngertiin: typeof config } };
    model: { modelId: string };
    input: { text: string }[];
    excludeItems: boolean;
    turnId: string;
    expectedTurnId: string;
    approvalId: string;
    choiceId: string;
    userInputId: string;
    answers: unknown[];
  };
}) {
  const p = request.params ?? {};
  const result = (value: unknown) =>
    process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: request.id, result: value })}\n`);
  switch (request.method) {
    case "initialize":
      return result({
        schema: { version: 1, fingerprint: EXPECTED_SCHEMA_FINGERPRINT },
        serverInfo: { name: "muse-fixture", version: "1.4.14" },
        experimentalApi: true,
        grantedCapabilities: ["sessionMcp"],
        museHome: home,
        platformFamily: "unix",
        platformOs: "macos",
        sessionDurability: "durable",
        userAgent: "fixture",
      });
    case "initialized":
      return;
    case "account/read": {
      let mode = process.env.META_API_KEY ? "envKey" : "accountLogin";
      try {
        mode = readFileSync(join(home, "mode"), "utf8");
      } catch {}
      return result({
        state: mode,
        credentialRequired: true,
        ...(mode === "accountLogin" ? { label: "fixture@example.test" } : {}),
      });
    }
    case "account/loginStart":
      return result({ verificationUrl: "https://example.test/device", userCode: "FIXTURE-CODE" });
    case "account/loginCancel":
      return result({});
    case "model/list":
      return result({
        providerId: "meta",
        models: [{ providerId: "meta", modelId: "model-a", variants: ["medium", "high"] }],
      });
    case "session/start":
      session = {
        sessionId: p.sessionId,
        modelId: p.modelId,
        providerId: p.providerId,
        activeTurnId: null,
      };
      config = p.config.mcpServers.ngertiin;
      persist();
      return result({ session });
    case "session/resume": {
      try {
        ({ session, items } = JSON.parse(readFileSync(join(home, `${p.sessionId}.json`), "utf8")));
      } catch {
        return fail(request.id, "notFound");
      }
      config = p.config.mcpServers.ngertiin;
      return result({ session, history: { mode: "inline", items, snapshot: null } });
    }
    case "session/setModel":
      session.modelId = process.argv.includes("--model")
        ? p.model.modelId
        : "unexpected-native-default";
      persist();
      return result({ commandId: p.commandId, status: "accepted" });
    case "session/read":
      if (!session || session.sessionId !== p.sessionId) {
        try {
          ({ session, items, lastTurn } = JSON.parse(
            readFileSync(join(home, `${p.sessionId}.json`), "utf8"),
          ));
        } catch {
          return fail(request.id, "notFound");
        }
      }
      return result({
        session,
        lastTurn,
        history: { mode: "inline", items: p.excludeItems === false ? items : [], snapshot: null },
      });
    case "turn/start": {
      const input = p.input.at(-1)?.text ?? "";
      if (input === "reject") return fail(request.id);
      active = { id: p.commandId, input };
      items.push({
        itemId: crypto.randomUUID(),
        kind: "userMessage",
        revision: 1,
        status: "completed",
        turnId: active.id,
        text: input,
      });
      notify("turn/started", { turnId: active.id });
      result({
        turnId: active.id,
        disposition: "started",
        startedNewTurn: true,
        status: "accepted",
        commandId: p.commandId,
      });
      if (input === "disconnect") {
        notify("item/started", {
          item: {
            itemId: crypto.randomUUID(),
            kind: "agentMessage",
            turnId: active.id,
            revision: 0,
            status: "inProgress",
            text: "Partial before disconnect",
          },
        });
        return process.exit(1);
      }
      if (input === "gap") return notify("view/gap", { after: "1", next: "3" });
      if (input === "wait" || input === "stop-ack-only") return;
      if (input === "empty-final") {
        notify("item/started", {
          item: {
            itemId: crypto.randomUUID(),
            kind: "agentMessage",
            turnId: active.id,
            revision: 0,
            status: "inProgress",
            text: "Ephemeral text that is absent from the final durable history. ".repeat(8),
          },
        });
        lastTurn = { turnId: active.id, terminal: "completed" };
        persist();
        notify("turn/completed", { turnId: active.id, terminal: "completed" });
        active = null;
        return;
      }
      if (input === "stream-wait") {
        const value = {
          itemId: crypto.randomUUID(),
          kind: "agentMessage",
          turnId: active.id,
          revision: 0,
          status: "inProgress",
          text: "Streaming native output. ".repeat(12),
        };
        items.push(value);
        return notify("item/started", { item: value });
      }
      if (input === "question")
        return notify("userInput/requested", {
          userInputId: "question-1",
          questions: [
            {
              id: "q",
              header: "Choice",
              question: "Choose a store",
              options: [{ label: "SQLite" }, { label: "Postgres" }],
              selection: { mode: "single" },
            },
          ],
        });
      if (input === "approval")
        return notify("approval/requested", {
          approvalId: "approval-1",
          currentRequirementId: { approvalId: "approval-1", sourceIndex: 2 },
          availableChoices: [{ choiceId: "deny", decision: "denied", scope: "once" }],
          subject: { kind: "command", command: "fixture command" },
        });
      if (input === "failed") return finish("Partial response", "failed");
      if (input === "terminal-auth")
        return finish("Partial response", "failed", { kind: "authRequired", retryable: false });
      if (input === "terminal-temporary")
        return finish("Partial response", "failed", { kind: "modelError", retryable: true });
      if (input === "unknown-terminal") return finish("Partial response", "new-terminal");
      const turnId = active.id;
      const itemId = crypto.randomUUID();
      notify("item/started", {
        item: { itemId, kind: "agentMessage", turnId, revision: 0, status: "inProgress" },
      });
      notify("item/delta", { itemId, field: "text", delta: "selected-" });
      notify("item/delta", { itemId, field: "text", delta: "key" });
      // Authoritative history repairs ephemeral deltas and carries the actual HTTP tool result.
      const rpc = async (method: string, params: unknown) => {
        const response = await fetch(config.url, {
          method: "POST",
          headers: { ...config.headers, "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params }),
        });
        return response.json();
      };
      await rpc("initialize", { protocolVersion: "2025-06-18" });
      await rpc("tools/list", {});
      const tool = await rpc("tools/call", {
        ...(input.startsWith("product-tool:") || input.startsWith("crash-after-commit:")
          ? JSON.parse(input.slice(input.indexOf(":") + 1))
          : { name: "ngertiin.read_run_context", arguments: {} }),
        _meta: { progressToken: "native-progress" },
      });
      items = items.filter((entry) => entry.itemId !== itemId);
      finish(
        JSON.stringify({
          tool,
          profile_instructions: p.input.length > 1 ? p.input[0].text : "",
          history: items.filter((v) => v.kind === "userMessage").map((v) => v.text),
        }),
      );
      return;
    }
    case "turn/interrupt":
      result({ commandId: p.commandId, status: "accepted", turnId: p.turnId });
      if (active?.input !== "stop-ack-only")
        setTimeout(() => finish("Interrupted partial", "cancelled"), 30);
      return;
    case "turn/steer":
      result({ turnId: p.expectedTurnId, commandId: p.commandId, status: "accepted" });
      finish(p.input[0].text);
      return;
    case "approval/decide":
      notify("approval/resolved", { approvalId: p.approvalId });
      result({ status: "accepted", commandId: p.commandId });
      finish(`Permission ${p.choiceId}`);
      return;
    case "userInput/answer":
      notify("userInput/settled", { userInputId: p.userInputId });
      result({ status: "accepted", commandId: p.commandId });
      finish(JSON.stringify(p.answers));
      return;
    default:
      return fail(request.id, "methodNotFound");
  }
}
