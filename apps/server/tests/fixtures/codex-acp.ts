// Official-SDK protocol fixture. No provider authentication or inference occurs here.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as acp from "@agentclientprotocol/sdk/unstable";

type Session = { setup: acp.NewSessionRequest; history: string[]; turns: Turn[] };
type Turn = {
  id: string;
  status: string;
  items: { type: string; text: string; phase: string | null }[];
};
const file = join(process.env.CODEX_HOME as string, "fixture-sessions.json");
const read = (): Record<string, Session> => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return {};
  }
};
let sessions = read();
const save = () => writeFileSync(file, JSON.stringify(sessions));
let selected: { planType?: string; chatgptAccountId?: string } | null = null;
let active: { stop(): void; steer(text: string): void } | undefined;
const models = [
  { id: "model-a", model: "model-a", supportedReasoningEfforts: [{ reasoningEffort: "high" }] },
  { id: "fixture-model", model: "fixture-model", supportedReasoningEfforts: [] },
];
const config: acp.SessionConfigOption[] = [
  {
    id: "model",
    name: "Model",
    category: "model",
    type: "select",
    currentValue: "model-a",
    options: [
      { value: "model-a", name: "A" },
      { value: "fixture-model", name: "Fixture" },
    ],
  },
  {
    id: "effort",
    name: "Reasoning",
    category: "thought_level",
    type: "select",
    currentValue: "high",
    options: [{ value: "high", name: "High" }],
  },
];
const commands: acp.SessionUpdate = {
  sessionUpdate: "available_commands_update",
  availableCommands: ["compact", "review", "login"].map((name) => ({ name, description: name })),
};
const writer = Bun.stdout.writer();
const output = new WritableStream<Uint8Array>({
  async write(bytes) {
    writer.write(bytes);
    await writer.flush();
  },
});
acp
  .agent({ name: "codex-acp-fixture" })
  .onRequest("initialize", () => ({
    protocolVersion: 1,
    agentInfo: { name: "codex-acp", version: "2.6.0" },
    authMethods: [{ id: "api-key", name: "API key" }],
    _meta: { steering: { supported: true } },
    agentCapabilities: {
      loadSession: true,
      mcpCapabilities: { http: true },
      sessionCapabilities: { systemPrompt: {} },
    },
  }))
  .onRequest(
    "_ngertiin/capabilities",
    () => ({}),
    () => ({
      version: 1,
      externalTokens: true,
      turnReceipts: true,
      accountCatalog: true,
      messagePhases: true,
      skillCatalog: true,
    }),
  )
  .onRequest(
    "_ngertiin/external_tokens",
    (value) => value as { accessToken: string; chatgptAccountId: string; chatgptPlanType?: string },
    async ({ params, client }) => {
      selected = {
        chatgptAccountId: params.chatgptAccountId,
        planType: params.chatgptPlanType ?? "plus",
      };
      if (params.accessToken === "fixture-request-refresh")
        await client.request("_ngertiin/refresh", {});
      return {};
    },
  )
  .onRequest("authenticate", () => ({}))
  .onRequest(
    "_ngertiin/skills",
    (value) => value,
    () => ({ skills: [] }),
  )
  .onRequest(
    "_ngertiin/account",
    () => ({}),
    () => ({
      account: selected ? { type: "chatgpt", planType: selected.planType } : { type: "apiKey" },
    }),
  )
  .onRequest(
    "_ngertiin/models",
    (value) => value,
    () => ({ data: models, nextCursor: null }),
  )
  .onRequest(
    "_ngertiin/receipt",
    (value) => value as { sessionId: string; turnId: string },
    ({ params }) => ({
      sessionId: params.sessionId,
      turn: read()[params.sessionId]?.turns.find((t) => t.id === params.turnId) ?? null,
    }),
  )
  .onRequest("session/new", async ({ params, client }) => {
    const sessionId = crypto.randomUUID();
    sessions[sessionId] = { setup: params, history: [], turns: [] };
    await client.notify("session/update", { sessionId, update: commands });
    return { sessionId, configOptions: config };
  })
  .onRequest("session/load", async ({ params, client }) => {
    sessions = read();
    if (!sessions[params.sessionId]) throw new acp.RequestError(-32002, "Session not found.");
    sessions[params.sessionId].setup = params;
    await client.notify("session/update", { sessionId: params.sessionId, update: commands });
    return { configOptions: config };
  })
  .onRequest("session/set_config_option", ({ params }) => {
    const item = config.find((c) => c.id === params.configId);
    if (!item) throw acp.RequestError.invalidParams();
    item.currentValue = params.value;
    return { configOptions: config };
  })
  .onRequest(
    "_session/steering",
    (value) => value as { sessionId: string; prompt: { text: string }[] },
    ({ params }) => {
      if (!active) return { outcome: "promptRequired" };
      active.steer(params.prompt[0].text);
      return { outcome: "injected" };
    },
  )
  .onNotification("session/cancel", () => {
    const turn = active;
    setTimeout(() => turn?.stop(), 40);
  })
  .onRequest("session/prompt", async ({ params, client }) => {
    const session = sessions[params.sessionId];
    let text =
      params.prompt
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .at(-1) ?? "";
    if (text === "reject") throw new acp.RequestError(-32603, "sk-native-secret");
    const turn: Turn = { id: crypto.randomUUID(), status: "inProgress", items: [] };
    session.history.push(text);
    session.turns.push(turn);
    save();
    await client.notify("_ngertiin/turn", { sessionId: params.sessionId, turnId: turn.id });
    const emit = (update: acp.SessionUpdate) =>
      client.notify("session/update", { sessionId: params.sessionId, update });
    const answer = async (value: string, phase: string | null = null) => {
      turn.items.push({ type: "agentMessage", text: value, phase });
      await emit({
        sessionUpdate: "agent_message_chunk",
        messageId: String(turn.items.length),
        content: { type: "text", text: value },
        _meta: phase ? { ngertiin: { phase } } : {},
      });
    };
    let stopped = false;
    let finish: (text?: string) => void = () => {};
    const wait = () =>
      new Promise<string | undefined>((resolve) => {
        finish = resolve;
      });
    active = {
      stop() {
        stopped = true;
        finish();
      },
      steer(value) {
        finish(value);
      },
    };
    try {
      if (text === "disconnect") {
        await answer("Partial answer");
        process.exit(1);
      }
      if (text === "wrong-terminal") throw new acp.RequestError(1001, "Native transport lost.");
      if (text === "stream-wait") await answer("Streaming native output. ".repeat(12));
      if (["wait", "stream-wait"].includes(text)) {
        const update = await wait();
        if (update) {
          text = update;
          session.history.push(update);
        } else stopped = true;
        if (!stopped && !text.startsWith("product-tool:")) await answer(text);
      } else if (text === "activity-search") {
        for (const [id, kind] of [
          ["search", "search"],
          ["file", "edit"],
        ] as const)
          await emit({
            sessionUpdate: "tool_call",
            toolCallId: id,
            title: id,
            kind,
            status: "in_progress",
          });
        for (const id of ["search", "file"])
          await emit({ sessionUpdate: "tool_call_update", toolCallId: id, status: "completed" });
        await answer("Research completed.");
      } else if (text === "phase-output") {
        await answer("I am preparing the example.", "commentary");
        await answer("Here is the useful final example.", "final_answer");
      } else if (text === "form") {
        const response = await client.request("elicitation/create", {
          mode: "form",
          sessionId: params.sessionId,
          message: "Provide delivery details",
          requestedSchema: {
            type: "object",
            required: ["name", "count"],
            properties: {
              name: { type: "string", title: "Name", minLength: 2, maxLength: 30 },
              count: { type: "integer", title: "Count", minimum: 1, maximum: 9 },
            },
          },
        });
        await answer(JSON.stringify(response));
        await emit({
          sessionUpdate: "plan",
          entries: [
            { content: "Confirm the delivery details", priority: "medium", status: "completed" },
          ],
        });
        await emit({ sessionUpdate: "usage_update", used: 12, size: 1000 });
      } else if (text === "permission") {
        const response = await client.request("session/request_permission", {
          sessionId: params.sessionId,
          toolCall: { toolCallId: "permission", title: "Read a file" },
          options: [{ optionId: "deny", name: "Decline", kind: "reject_once" }],
        });
        await answer(JSON.stringify(response));
      } else if (
        text.startsWith("Select exactly one responding agent") ||
        text.startsWith("Interpret the speaker's current request")
      ) {
        const packet = JSON.parse(text.slice(text.indexOf("\n") + 1));
        await answer(JSON.stringify({ agent_id: packet.members.at(-1).agent_id }));
      }
      if (
        (!stopped && !turn.items.length) ||
        text.startsWith("product-tool:") ||
        text.startsWith("crash-after-commit:")
      ) {
        const server = session.setup.mcpServers[0];
        if (!server || !("url" in server)) throw acp.RequestError.internalError();
        const requested =
          text.startsWith("product-tool:") || text.startsWith("crash-after-commit:")
            ? JSON.parse(text.slice(text.indexOf(":") + 1))
            : {
                name: "ngertiin.read_run_context",
                arguments: text === "wrong-scope" ? { thread_id: "private-other-thread" } : {},
              };
        const response = await fetch(server.url, {
          method: "POST",
          headers: {
            ...Object.fromEntries(server.headers.map((h) => [h.name, h.value])),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: requested }),
        });
        const result = (await response.json()) as {
          result?: { content?: { text: string }[]; isError?: boolean };
        };
        if (!response.ok || !result.result || result.result.isError)
          throw acp.RequestError.internalError();
        await answer(
          JSON.stringify({
            history: session.history,
            profile_instructions: session.setup.systemPrompt?.content
              .filter((b) => b.type === "text")
              .map((b) => b.text)
              .join("\n"),
            tool: { contentItems: result.result.content },
          }),
        );
        if (requested.name === "ngertiin.cancel_run") await wait();
      }
      turn.status = stopped ? "interrupted" : "completed";
      save();
      if (text.startsWith("crash-after-commit:")) process.exit(1);
      return { stopReason: stopped ? "cancelled" : "end_turn" };
    } finally {
      active = undefined;
    }
  })
  .connect(acp.ndJsonStream(output, Bun.stdin.stream()));
