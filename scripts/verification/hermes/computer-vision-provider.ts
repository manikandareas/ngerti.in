import { createHash } from "node:crypto";

const model = "computer-vision";
type Part = { type: string; text?: string; image_url?: { url?: string } };
type Message = { role: string; content?: string | Part[] };
type Tool = { function: { name: string } };

function text(content: Message["content"]) {
  return typeof content === "string" ? content : (content ?? []).map((part) => part.text ?? "").join("\n");
}

function structured(content: Message["content"]) {
  const envelope = JSON.parse(text(content).split("\n", 1)[0] ?? "{}");
  if (envelope.isError || typeof envelope.structuredJson !== "string")
    throw new Error("Expected a successful desktop observation.");
  return JSON.parse(envelope.structuredJson);
}

function screenshot(messages: Message[]) {
  const url = messages
    .flatMap(({ content }) => (Array.isArray(content) ? content : []))
    .findLast((part) => part.type === "image_url")?.image_url?.url;
  const data = url?.match(/^data:image\/(?:png|jpeg);base64,([A-Za-z0-9+/=]+)$/)?.[1];
  if (!data) throw new Error("The request contained no inline screenshot.");
  const bytes = Buffer.from(data, "base64");
  const ocr = Bun.spawnSync(["tesseract", "stdin", "stdout", "--psm", "11", "tsv"], {
    stdin: bytes,
    stderr: "ignore",
  });
  if (ocr.exitCode !== 0) throw new Error("Could not read incoming screenshot pixels.");
  const words = ocr.stdout.toString().split("\n").slice(1).flatMap((row) => {
    const [level, , , , , , left, top, width, height, , value] = row.split("\t");
    return level === "5" && value
      ? [{ value, x: Number(left) + Number(width) / 2, y: Number(top) + Number(height) / 2 }]
      : [];
  });
  return {
    words,
    visible: words.map(({ value }) => value).join(" "),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
  };
}

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.HERMES_COMPUTER_VISION_PROVIDER_PORT ?? 8445),
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (request.method === "GET" && path === "/v1/models")
      return Response.json({ object: "list", data: [{ object: "model", id: model }] });
    if (request.method !== "POST" || path !== "/v1/chat/completions")
      return new Response("Not found", { status: 404 });
    const { messages = [], tools = [] } = (await request.json()) as {
      messages?: Message[];
      tools?: Tool[];
    };
    const id = `chatcmpl-${crypto.randomUUID()}`;
    const chunk = (delta: object, finish_reason: string | null) =>
      `data: ${JSON.stringify({ id, model, created: Math.floor(Date.now() / 1000), object: "chat.completion.chunk", choices: [{ index: 0, delta, finish_reason }] })}\n\n`;
    const stream = (delta: object, finish: string) =>
      new Response(chunk({ role: "assistant", ...delta }, null) + chunk({}, finish) + "data: [DONE]\n\n", {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" },
      });
    const reply = (content: string) => stream({ content }, "stop");
    const call = (name: string, args: object) => {
      const tool = tools.find(({ function: item }) => item.name.endsWith("computer_call"));
      if (!tool) throw new Error("Computer tool was not available.");
      return stream({
        tool_calls: [{
          index: 0,
          id: `call_${crypto.randomUUID()}`,
          type: "function",
          function: {
            name: tool.function.name,
            arguments: JSON.stringify({ name, arguments: args, command_id: crypto.randomUUID() }),
          },
        }],
      }, "tool_calls");
    };
    const observe = (event: string, data: object = {}) =>
      console.log(JSON.stringify({ event, ...data, at: new Date().toISOString() }));
    const nativeAttachment = messages.findLast((message) =>
      message.role === "user" && text(message.content).includes("Media vision check. native."),
    );
    if (nativeAttachment) {
      try {
        const image = screenshot([nativeAttachment]);
        const value = image.visible.match(/[A-Z]{5}-\d{3}/)?.[0];
        if (!value) throw new Error("The image code is missing.");
        observe("native_attachment", { value, sha256: image.sha256, bytes: image.bytes });
        return reply(`The image shows ${value}.`);
      } catch {
        return reply("I could not read the code from the image attachment.");
      }
    }
    const task = messages.findLastIndex((message) =>
      message.role === "user" && text(message.content).includes("Please confirm the Cedar intake review"),
    );
    if (task < 0 || !tools.length) return reply("Computer vision verification provider connected.");
    const history = messages.slice(task + 1);
    const results = history.flatMap((message, index) =>
      message.role === "tool" ? [{ content: message.content, index }] : [],
    );
    try {
      if (!results.length) return call("list_windows", {});
      const { windows } = structured(results[0]?.content);
      const target = windows.find((item: { title: string }) => item.title === "Cedar Review Board - Chromium");
      if (!target) return reply("I could not find the open Cedar Review Board.");
      const { pid, window_id } = target;
      if (results.length === 1)
        return call("get_window_state", {
          pid,
          window_id,
          query: "Cedar",
          timeout_ms: 9000,
          max_elements: 600,
          include_screenshot: false,
        });
      const ax = structured(results[1]?.content);
      const tree = ax.tree_markdown ?? "";
      if (!tree.includes("Cedar Review Board") || /CONFIRM CEDAR|CEDAR-\d+|RECEIPT-\d+/.test(tree))
        return reply("I could not establish that the requested controls were missing from structured state.");
      if (results.length === 2) {
        observe("structured_state_has_no_controls", { target: "Cedar Review Board" });
        return call("get_window_state", { pid, window_id, include_accessibility_tree: false });
      }
      const beforeFrame = structured(results[2]?.content);
      const before = screenshot(history.slice(results[2]?.index, results[3]?.index));
      const review = before.visible.match(/CEDAR-\d+/)?.[0];
      const button = before.words.find(({ value }) => value === "CONFIRM");
      if (!review || !button || !before.visible.includes("SKIP"))
        return reply("I could not locate the review and its confirmation control in the screenshot.");
      if (results.length === 3) {
        observe("before_image", { review, sha256: before.sha256, bytes: before.bytes, x: button.x, y: button.y });
        const permitsForeground = text(messages[task]?.content).includes("bring it forward");
        return call("click", {
          pid,
          window_id,
          x: button.x,
          y: button.y,
          capture_id: beforeFrame.capture_id,
          delivery_mode: permitsForeground ? "foreground" : "background",
        });
      }
      structured(results[3]?.content);
      if (results.length === 4)
        return call("get_window_state", { pid, window_id, include_accessibility_tree: false });
      const after = screenshot(history.slice(results[4]?.index));
      const receipt = after.visible.match(/RECEIPT-\d+/)?.[0];
      if (!receipt || !after.visible.includes("Confirmed") || !after.visible.includes(review))
        return reply(`I found ${review}, but could not verify a confirmation on the resulting board.`);
      observe("after_image", { receipt, sha256: after.sha256, bytes: after.bytes });
      return reply(`Confirmed ${review}. I checked the board afterward and read receipt ${receipt}.`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown verification failure.";
      observe("probe_error", { detail: detail.split("\n")[0]?.slice(0, 160) });
      return reply("I could not verify the review using the current Computer observations.");
    }
  },
});
console.log(`Computer vision verification provider listening on ${server.url}`);
