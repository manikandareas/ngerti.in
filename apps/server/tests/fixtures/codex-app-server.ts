// Protocol fixture only. No provider login or inference is performed by this process.

import { writeFileSync } from "node:fs";
import { join } from "node:path";

type Message = {
  id?: string | number;
  method?: string;
  params?: {
    [key: string]: unknown;
    model?: string;
    threadId?: string;
    input?: { text: string }[];
  };
  result?: unknown;
  error?: unknown;
};
const file = join(process.env.CODEX_HOME as string, "fixture-sessions.json");
let sessions: Record<
  string,
  {
    model: string;
    history: string[];
    instructions?: string;
    turns?: {
      id: string;
      status: string;
      items: { type: string; text: string; phase?: string }[];
    }[];
  }
> = (await Bun.file(file).exists()) ? await Bun.file(file).json() : {};
let account = process.env.OPENAI_API_KEY
  ? { type: "apiKey" }
  : { type: "chatgpt", email: "fixture@example.test", planType: "plus" };
let current: {
  thread: string;
  turn: string;
  text: string;
  answer: string;
  phaseItems?: { type: string; text: string; phase: string }[];
} | null = null;
const send = (message: Message) => process.stdout.write(`${JSON.stringify(message)}\n`);
const notify = (method: string, params: Record<string, unknown>) => {
  if (method === "item/agentMessage/delta" && current) current.answer += String(params.delta);
  send({ method, params });
};
const finish = (status = "completed", turn = current?.turn) => {
  if (current) {
    const turns = sessions[current.thread].turns ?? [];
    sessions[current.thread].turns = turns;
    turns.push({
      id: current.turn,
      status,
      items: current.phaseItems ?? [{ type: "agentMessage", text: current.answer }],
    });
    writeFileSync(file, JSON.stringify(sessions));
    if (current.text.startsWith("crash-after-commit:")) process.exit(1);
    notify("turn/completed", { threadId: current.thread, turn: { id: turn, status } });
  }
};
function requestProductTool(text: string) {
  if (!current) throw new Error("No active fixture turn.");
  send({
    id: "product",
    method: "item/tool/call",
    params: {
      threadId: text === "wrong-scope" ? "private-other-thread" : current.thread,
      turnId: current.turn,
      callId: "call",
      namespace: null,
      tool: "ngertiin_product_tool",
      arguments:
        text.startsWith("product-tool:") || text.startsWith("crash-after-commit:")
          ? JSON.parse(text.slice(text.indexOf(":") + 1))
          : { name: "ngertiin.read_run_context", arguments: {} },
    },
  });
}
async function receive(message: Message) {
  const p = message.params ?? {};
  const reply = (result: unknown) => send({ id: message.id, result });
  if (!message.method && message.id === "product") {
    if (!current) throw new Error("No active fixture turn.");
    if (message.error) {
      finish("failed");
      return;
    }
    const text = JSON.stringify({
      history: sessions[current.thread].history,
      profile_instructions: sessions[current.thread].instructions,
      tool: message.result,
    });
    notify("item/agentMessage/delta", {
      threadId: current?.thread,
      turnId: current?.turn,
      itemId: "answer",
      delta: text,
    });
    const requested = current.text.startsWith("product-tool:")
      ? JSON.parse(current.text.slice(current.text.indexOf(":") + 1))
      : null;
    if (requested?.name !== "ngertiin.cancel_run") finish();
    return;
  }
  switch (message.method) {
    case "initialize":
      reply({ userAgent: "fixture-0.165.0" });
      break;
    case "initialized":
      break;
    case "account/login/start":
      account = { type: "apiKey" };
      reply({ type: "apiKey" });
      break;
    case "account/read":
      reply({ account });
      break;
    case "model/list":
      reply({
        data: [
          {
            id: "model-a",
            model: "model-a",
            supportedReasoningEfforts: [{ reasoningEffort: "high" }],
          },
        ],
        nextCursor: null,
      });
      break;
    case "thread/start": {
      const id = crypto.randomUUID();
      if (!p.model) throw new Error("Missing model.");
      if ((p.config as Record<string, unknown> | undefined)?.model_reasoning_effort === null) {
        send({
          id: message.id,
          error: { code: -32602, message: "Null config values are invalid." },
        });
        break;
      }
      sessions[id] = {
        model: p.model,
        history: [],
        instructions: String(p.developerInstructions ?? ""),
      };
      await Bun.write(file, JSON.stringify(sessions));
      reply({ thread: { id }, model: p.model, modelProvider: "openai" });
      break;
    }
    case "thread/resume": {
      sessions = await Bun.file(file).json();
      if (!p.threadId || !sessions[p.threadId]) {
        send({ id: message.id, error: { code: -1, message: "Missing session." } });
        break;
      }
      reply({ thread: { id: p.threadId }, model: p.model, modelProvider: "openai" });
      break;
    }
    case "thread/read": {
      sessions = await Bun.file(file).json();
      reply({ thread: { id: p.threadId, turns: sessions[p.threadId as string]?.turns ?? [] } });
      break;
    }
    case "skills/list":
      reply({ data: [{ cwd: Array.isArray(p.cwds) ? p.cwds[0] : "", skills: [], errors: [] }] });
      break;
    case "turn/start": {
      if (!p.threadId || !p.input) throw new Error("Missing turn input.");
      const text = p.input.at(-1)?.text ?? "";
      if (text === "reject") {
        send({ id: message.id, error: { code: -1, message: "sk-native-secret" } });
        break;
      }
      current = { thread: p.threadId, turn: crypto.randomUUID(), text, answer: "" };
      sessions[current.thread].history.push(text);
      await Bun.write(file, JSON.stringify(sessions));
      // Deliberately send acceptance, tools and completion before the response is consumed.
      notify("turn/started", { threadId: current.thread, turn: { id: current.turn } });
      reply({ turn: { id: current.turn } });
      if (text === "phase-output") {
        current.phaseItems = [
          { type: "agentMessage", text: "I am preparing the example.", phase: "commentary" },
          {
            type: "agentMessage",
            text: "Here is the useful final example.",
            phase: "final_answer",
          },
        ];
        for (const [index, item] of current.phaseItems.entries()) {
          const id = `phase-${index}`;
          notify("item/started", {
            threadId: current.thread,
            turnId: current.turn,
            item: { id, ...item, text: "" },
          });
          notify("item/agentMessage/delta", {
            threadId: current.thread,
            turnId: current.turn,
            itemId: id,
            delta: item.text,
          });
          notify("item/completed", {
            threadId: current.thread,
            turnId: current.turn,
            item: { id, ...item },
          });
        }
        finish();
        break;
      }
      if (text === "disconnect") {
        notify("item/agentMessage/delta", {
          threadId: current.thread,
          turnId: current.turn,
          itemId: "answer",
          delta: "Partial answer",
        });
        setTimeout(() => process.exit(1), 10);
        break;
      }
      if (text === "wrong-terminal") {
        finish("completed", "different-turn");
        break;
      }
      if (text === "wait") break;
      if (text.startsWith("Select exactly one responding agent")) {
        const packet = JSON.parse(text.slice(text.indexOf("\n") + 1));
        notify("item/agentMessage/delta", {
          threadId: current.thread,
          turnId: current.turn,
          itemId: "answer",
          delta: JSON.stringify({ agent_id: packet.members.at(-1).agent_id }),
        });
        finish();
        break;
      }
      if (text === "stream-wait") {
        notify("item/agentMessage/delta", {
          threadId: current.thread,
          turnId: current.turn,
          delta: "Streaming native output. ".repeat(12),
        });
        break;
      }
      if (text === "permission") {
        send({
          id: "permission",
          method: "item/commandExecution/requestApproval",
          params: { threadId: current.thread, turnId: current.turn },
        });
        break;
      }
      requestProductTool(text);
      break;
    }
    case "turn/steer":
      reply({ turnId: current?.turn });
      if (current && p.input?.[0].text?.startsWith("product-tool:")) {
        current.text = p.input[0].text;
        requestProductTool(current.text);
        break;
      }
      notify("item/agentMessage/delta", {
        threadId: current?.thread,
        turnId: current?.turn,
        itemId: "answer",
        delta: p.input?.[0].text,
      });
      finish();
      break;
    case "turn/interrupt":
      reply({});
      setTimeout(() => finish("interrupted"), 40);
      break;
    default:
      if (message.id === "permission") {
        notify("item/agentMessage/delta", {
          threadId: current?.thread,
          turnId: current?.turn,
          itemId: "answer",
          delta: JSON.stringify(message.result),
        });
        finish();
      } else if (message.id !== undefined)
        send({ id: message.id, error: { code: -32601, message: "Unsupported method." } });
  }
}
const reader = Bun.stdin.stream().getReader();
const decoder = new TextDecoder();
let buffer = "";
while (true) {
  const chunk = await reader.read();
  if (chunk.done) break;
  buffer += decoder.decode(chunk.value, { stream: true });
  while (buffer.includes("\n")) {
    const index = buffer.indexOf("\n");
    const line = buffer.slice(0, index);
    buffer = buffer.slice(index + 1);
    await receive(JSON.parse(line));
  }
}
