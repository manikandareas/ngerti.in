const token = process.env.HERMES_ROUTINE_DELIVERY_TOKEN;
const gate = process.env.HERMES_ROUTINE_DELIVERY_GATE;
if (!token || !gate) throw new Error("Set the fixture token and gate path.");

const accepted = new Map<string, string>();
const escapeHtml = (value: string) =>
  value.replace(/[&<>"]/g, (part) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[part] ?? part);

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.HERMES_ROUTINE_DELIVERY_PORT ?? 8426),
  maxRequestBodySize: 128 * 1024,
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === "/" && request.method === "GET") {
      const rows = Array.from(accepted, ([id, text]) =>
        `<li data-event-id="${escapeHtml(id)}">${escapeHtml(text)}</li>`,
      );
      return new Response(
        `<!doctype html><html lang="en"><title>Schedule delivery inbox</title><main><h1>Schedule delivery inbox</h1><p>${accepted.size} received</p><ol>${rows.join("")}</ol></main></html>`,
        { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
      );
    }
    if (pathname !== "/deliver" || request.method !== "POST")
      return new Response("Not found", { status: 404 });
    if (request.headers.get("authorization") !== `Bearer ${token}`)
      return new Response("Forbidden", { status: 403 });
    const { event_id, text } = await request.json() as { event_id?: string; text?: string };
    if (!event_id || !text || event_id !== request.headers.get("idempotency-key"))
      return new Response("Bad request", { status: 400 });
    console.log(JSON.stringify({ event_id, event: "request", at: new Date().toISOString() }));
    const deadline = Date.now() + 4200;
    let mode = (await Bun.file(gate).text()).trim();
    while (mode === "hold" && Date.now() < deadline) {
      await Bun.sleep(75);
      mode = (await Bun.file(gate).text()).trim();
    }
    if (accepted.has(event_id)) return Response.json({ event_id, status: "delivered" });
    if (mode !== "accept" && mode !== "drop-ack") {
      console.log(JSON.stringify({ event_id, event: "rejected_before_acceptance", at: new Date().toISOString() }));
      return Response.json({ event_id, status: "retry" }, { status: 503 });
    }
    accepted.set(event_id, text);
    console.log(JSON.stringify({ event_id, event: "accepted", at: new Date().toISOString() }));
    if (mode === "drop-ack") return new Response(null, { status: 502 });
    return Response.json({ event_id, status: "delivered" });
  },
});
console.log(`Schedule delivery fixture listening on ${server.url}`);
