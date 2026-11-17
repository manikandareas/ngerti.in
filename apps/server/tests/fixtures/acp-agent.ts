import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as acp from "@agentclientprotocol/sdk/unstable";

const writer = Bun.stdout.writer();
const output = new WritableStream<Uint8Array>({
  async write(bytes) {
    writer.write(bytes);
    await writer.flush();
  },
});
const sessions = new Map<string, acp.NewSessionRequest>();
function native(event: unknown) {
  process.stderr.write(
    `${process.env.NGERTIIN_TEST_NATIVE_EVENTS ?? process.env.NGERTIIN_OPENCODE_EVENTS ?? "UNCONFIGURED_NATIVE"} ${JSON.stringify(event)}\n`,
  );
}
const profile = process.env.NGERTIIN_TEST_ACP_PROFILE;
const modelPrefix = profile === "opencode" ? "openai/" : "";
const configs: acp.SessionConfigOption[] = [
  {
    id: "model",
    name: "Model",
    category: "model",
    type: "select",
    currentValue: `${modelPrefix}model-a`,
    options: [
      { value: `${modelPrefix}model-a`, name: "A" },
      { value: `${modelPrefix}model-b`, name: "B" },
    ],
  },
  {
    id: "effort",
    name: "Reasoning",
    category: "thought_level",
    type: "select",
    currentValue: "high",
    options: [
      { value: "high", name: "High" },
      { value: "low", name: "Low" },
    ],
  },
];
let cancelTurn: (() => void) | undefined;
let steerTurn: (() => void) | undefined;
acp
  .agent({ name: "ngertiin-test" })
  .onRequest("initialize", () => ({
    protocolVersion: 1,
    _meta: { steering: { supported: true } },
    agentCapabilities: {
      loadSession: true,
      mcpCapabilities: { http: true },
      sessionCapabilities: profile === "opencode" ? {} : { systemPrompt: {} },
      ...(profile === "claude" ? { auth: { status: {} } } : {}),
    },
    agentInfo: {
      name: "fixture",
      version: profile === "claude" ? "0.107.0" : profile === "opencode" ? "1.19.5" : "1.0.0",
    },
  }))
  .onRequest("auth/status", () => ({
    state: "authenticated",
    accounts: [{ active: true, label: "Selected key", _meta: { claudeCode: { kind: "api_key" } } }],
  }))
  .onRequest("session/new", async ({ params, client }) => {
    native({ type: "ready" });
    const id = crypto.randomUUID();
    sessions.set(id, params);
    writeFileSync(join(params.cwd, `${id}.json`), JSON.stringify(params));
    await client.notify("session/update", {
      sessionId: id,
      update: {
        sessionUpdate: "available_commands_update",
        availableCommands: (process.env.NGERTIIN_TEST_COMMANDS === "no"
          ? []
          : ["compact", "review", "login"]
        ).map((name) => ({ name, description: name })),
      },
    });
    return { sessionId: id, configOptions: configs };
  })
  .onRequest("session/load", async ({ params, client }) => {
    native({ type: "ready" });
    readFileSync(join(params.cwd, `${params.sessionId}.json`));
    sessions.set(params.sessionId, params);
    await client.notify("session/update", {
      sessionId: params.sessionId,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "REPLAY MUST STAY PRIVATE" },
      },
    });
    return { configOptions: configs };
  })
  .onRequest("session/set_config_option", ({ params }) => {
    const option = configs.find((entry) => entry.id === params.configId);
    if (!option) throw acp.RequestError.invalidParams();
    option.currentValue = params.value;
    return { configOptions: configs };
  })
  .onRequest(
    "_session/steering",
    (value) =>
      value as {
        sessionId: string;
        prompt: { text: string }[];
        _meta: { steering: { idleBehavior: string } };
      },
    ({ params }) => {
      if (params._meta?.steering?.idleBehavior !== "promptRequired")
        throw acp.RequestError.invalidParams();
      if (!steerTurn || params.prompt[0]?.text === "idle") return { outcome: "promptRequired" };
      steerTurn();
      return { outcome: "injected" };
    },
  )
  .onRequest("session/prompt", async ({ params, client }) => {
    const text =
      params.prompt
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .at(-1) ?? "";
    const emit = (update: acp.SessionUpdate) =>
      client.notify("session/update", { sessionId: params.sessionId, update });
    if (text === "disconnect") process.exit(0);
    if (text === "error") throw acp.RequestError.internalError();
    if (text === "native-limit") {
      process.stderr.write(
        "Free usage limit reached. This ordinary diagnostic is not a native outcome.\n",
      );
      native({ type: "failure", sessionId: "another-session", code: "PROVIDER_LIMIT" });
      await emit({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Still active" },
      });
      native({ type: "failure", sessionId: params.sessionId, code: "PROVIDER_LIMIT" });
      if (process.env.NGERTIIN_TEST_NATIVE_EVENTS || process.env.NGERTIIN_OPENCODE_EVENTS)
        return await new Promise<acp.PromptResponse>(() => {});
    }
    if (text === "partial-error" || text === "partial-disconnect") {
      await emit({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Retained partial answer" },
      });
      if (text === "partial-disconnect") process.exit(0);
      throw acp.RequestError.internalError();
    }
    if (text === "refusal") return { stopReason: "refusal" };
    if (text === "stream") {
      for (let index = 0; index < 200; index++)
        await emit({
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "x".repeat(100) },
        });
      await new Promise<void>((resolve) => {
        steerTurn = resolve;
      });
      steerTurn = undefined;
      return { stopReason: "end_turn" };
    }
    if (text === "steer") {
      await emit({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Working" },
      });
      await new Promise<void>((resolve) => {
        steerTurn = resolve;
      });
      steerTurn = undefined;
      return { stopReason: "end_turn" };
    }
    if (text === "background") {
      const child = Bun.spawn([process.execPath, "-e", "setInterval(() => {}, 1000)"], {
        stdout: "ignore",
        stderr: "ignore",
      });
      writeFileSync(
        join(sessions.get(params.sessionId)?.cwd as string, "background.pid"),
        String(child.pid),
      );
    }
    if (text === "cancel") {
      await emit({
        sessionUpdate: "agent_thought_chunk",
        content: { type: "text", text: "PRIVATE THOUGHT" },
      });
      await new Promise<void>((resolve) => {
        cancelTurn = resolve;
      });
      return { stopReason: "cancelled" };
    }
    if (text === "permission") {
      const permission = await client.request("session/request_permission", {
        sessionId: params.sessionId,
        toolCall: { toolCallId: "call", name: "Test", rawInput: { secret: "PRIVATE INPUT" } },
        options: [
          { optionId: "allow", name: "Allow once", kind: "allow_once" },
          { optionId: "deny", name: "Deny", kind: "reject_once" },
        ],
      });
      if (permission.outcome.outcome === "cancelled") return { stopReason: "cancelled" };
    }
    if (text === "form") {
      const response = await client.request("elicitation/create", {
        mode: "form",
        sessionId: params.sessionId,
        message: "Provide delivery details",
        requestedSchema: {
          type: "object",
          required: ["name", "count", "confirmed", "days"],
          properties: {
            name: { type: "string", minLength: 2, maxLength: 30 },
            count: { type: "integer", minimum: 1, maximum: 9 },
            confirmed: { type: "boolean" },
            days: {
              type: "array",
              minItems: 1,
              maxItems: 2,
              items: { type: "string", enum: ["Monday", "Tuesday"] },
            },
            optional: { type: "string" },
          },
        },
      });
      await emit({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: JSON.stringify(response) },
      });
      return { stopReason: response.action === "cancel" ? "cancelled" : "end_turn" };
    }
    if (text === "tool") {
      const server = sessions.get(params.sessionId)?.mcpServers[0];
      if (!server || !("url" in server)) throw acp.RequestError.internalError();
      const headers = {
        ...Object.fromEntries(server.headers.map((entry) => [entry.name, entry.value])),
        "Content-Type": "application/json",
      };
      const response = await fetch(server.url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "ngertiin.read_run_context", arguments: {} },
        }),
      });
      const receipt = (await response.json()) as { result?: { isError: boolean } };
      await emit({
        sessionUpdate: "plan",
        entries: [
          { content: "Check the requested details", priority: "medium", status: "completed" },
        ],
      });
      await emit({ sessionUpdate: "usage_update", used: 12, size: 1000 });
      if (!receipt.result || receipt.result.isError) throw acp.RequestError.internalError();
    }
    await emit({
      sessionUpdate: "agent_thought_chunk",
      content: { type: "text", text: "PRIVATE THOUGHT" },
    });
    await emit({
      sessionUpdate: "tool_call",
      toolCallId: "native-call",
      name: "Safe tool",
      title: "PRIVATE TITLE",
      status: "in_progress",
      rawInput: { command: "PRIVATE COMMAND" },
    });
    await emit({
      sessionUpdate: "tool_call_update",
      toolCallId: "native-call",
      status: "completed",
      rawOutput: "PRIVATE RESULT",
    });
    await emit({
      sessionUpdate: "agent_message_chunk",
      messageId: "answer",
      content: { type: "text", text: "Hello " },
    });
    await emit({
      sessionUpdate: "agent_message_chunk",
      messageId: "answer",
      content: { type: "text", text: "world" },
    });
    return { stopReason: "end_turn" };
  })
  .onNotification("session/cancel", () => {
    cancelTurn?.();
  })
  .connect(acp.ndJsonStream(output, Bun.stdin.stream()));
