type Block =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };

type RequestBody = {
  model: string;
  stream?: boolean;
  tools?: { name: string }[];
  messages?: { role: string; content: string | ToolResult[] }[];
};
type ToolResult = {
  type: string;
  tool_use_id?: string;
  is_error?: boolean;
  content?: string | { type: string; text?: string }[];
};

function messageResponse(model: string, stream: boolean | undefined, block: Block) {
  const usage = { input_tokens: 100, output_tokens: 20 };
  const stop_reason = block.type === "tool_use" ? "tool_use" : "end_turn";
  const message = {
    id: `msg_${crypto.randomUUID().replaceAll("-", "")}`,
    type: "message",
    role: "assistant",
    model,
    content: [block],
    stop_reason,
    stop_sequence: null,
    usage,
  };
  if (!stream) return Response.json(message);
  const frames = [
    { type: "message_start", message: { ...message, content: [], stop_reason: null } },
    {
      type: "content_block_start",
      index: 0,
      content_block: block.type === "tool_use" ? { ...block, input: {} } : { ...block, text: "" },
    },
    {
      type: "content_block_delta",
      index: 0,
      delta:
        block.type === "tool_use"
          ? { type: "input_json_delta", partial_json: JSON.stringify(block.input) }
          : { type: "text_delta", text: block.text },
    },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason, stop_sequence: null }, usage },
    { type: "message_stop" },
  ];
  return new Response(
    frames.map((frame) => `event: ${frame.type}\ndata: ${JSON.stringify(frame)}\n\n`).join(""),
    {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    },
  );
}

export function claudeProviderFixture(file: string, expected: string) {
  const key = `sk-ant-hermes-loopback-${crypto.randomUUID()}`;
  const calls: { action: string; model: string }[] = [];
  const resultErrors: { tool: string; isError: boolean; reason?: string }[] = [];
  const readId = "toolu_hermes_read_workspace";
  const publishId = "toolu_hermes_publish_workspace";
  const commandId = crypto.randomUUID();
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request) => {
      const path = new URL(request.url).pathname;
      if (request.headers.get("x-api-key") !== key)
        return Response.json(
          {
            type: "error",
            error: { type: "authentication_error", message: "Use the scoped fixture key." },
          },
          { status: 401 },
        );
      if (path === "/v1/messages/count_tokens" && request.method === "POST")
        return Response.json({ input_tokens: 100 });
      if (path !== "/v1/messages" || request.method !== "POST")
        return new Response(null, { status: 404 });
      const body = (await request.json()) as RequestBody;
      const respond = (block: Block) => messageResponse(body.model, body.stream, block);
      const messageText = JSON.stringify(body.messages);
      if (!messageText?.includes(`Read the workspace file ${file}`) || !body.tools?.length)
        return respond({ type: "text", text: "Workspace delivery verification." });
      const results = (body.messages ?? []).flatMap(({ content }) =>
        Array.isArray(content) ? content.filter((block) => block.type === "tool_result") : [],
      );
      const publishReceipt = results.find((block) => block.tool_use_id === publishId);
      const readReceipt = results.find((block) => block.tool_use_id === readId);
      const parseReceipt = (
        receipt: ToolResult | undefined,
      ): { text?: string; reference?: string } => {
        if (!receipt) return {};
        const text =
          typeof receipt.content === "string"
            ? receipt.content
            : receipt.content?.find((entry) => entry.type === "text")?.text;
        if (receipt.is_error) {
          resultErrors.push({
            tool: receipt.tool_use_id ?? "unknown",
            isError: true,
            reason: text?.replaceAll(key, "[REDACTED]").slice(0, 250),
          });
          return {};
        }
        try {
          return JSON.parse(text ?? "{}");
        } catch {
          resultErrors.push({
            tool: receipt.tool_use_id ?? "unknown",
            isError: false,
            reason: text?.replaceAll(key, "[REDACTED]").slice(0, 250),
          });
          return {};
        }
      };
      const failed = (message: string) => {
        calls.push({ action: message, model: body.model });
        return respond({ type: "text", text: message });
      };
      if (publishReceipt) {
        const reference = parseReceipt(publishReceipt).reference;
        if (!reference?.startsWith(`[${file}](ngertiin://file/`))
          return failed("Publication receipt did not contain the requested workspace artifact.");
        calls.push({ action: "verified_publish_receipt", model: body.model });
        return respond({ type: "text", text: `The workspace file is ready. ${reference}` });
      }
      const tool = readReceipt ? "publish_artifact" : "read_file";
      const name = body.tools?.find((item) => item.name.endsWith(tool))?.name;
      if (!name) return failed("The requested workspace tool is unavailable.");
      if (readReceipt && parseReceipt(readReceipt).text !== expected)
        return failed("Workspace source bytes did not match the test input.");
      calls.push({ action: tool, model: body.model });
      return respond({
        type: "tool_use",
        id: readReceipt ? publishId : readId,
        name,
        input: readReceipt
          ? { path: file, command_id: commandId, media_type: "text/plain" }
          : { path: file },
      });
    },
  });
  return { key, calls, resultErrors, server };
}
