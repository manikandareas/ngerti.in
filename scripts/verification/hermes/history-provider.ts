const model = "history-lab";
const acknowledgement = "Recorded for this conversation.";

Bun.serve({
  hostname: "127.0.0.1",
  port: 8416,
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (request.method === "GET" && pathname === "/v1/models")
      return Response.json({ object: "list", data: [{ id: model, object: "model" }] });
    if (request.method !== "POST" || pathname !== "/v1/chat/completions")
      return new Response("Not found", { status: 404 });
    const input = (await request.json()) as { stream?: boolean };
    const base = { id: "chatcmpl-history-fixture", created: Math.floor(Date.now() / 1000), model };
    if (!input.stream)
      return Response.json({
        ...base,
        object: "chat.completion",
        choices: [{ index: 0, message: { role: "assistant", content: acknowledgement }, finish_reason: "stop" }],
      });
    const chunk = (delta: object, finish_reason: string | null) =>
      `data: ${JSON.stringify({ ...base, object: "chat.completion.chunk", choices: [{ index: 0, delta, finish_reason }] })}\n\n`;
    return new Response(
      chunk({ role: "assistant", content: acknowledgement }, null) + chunk({}, "stop") + "data: [DONE]\n\n",
      { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" } },
    );
  },
});
