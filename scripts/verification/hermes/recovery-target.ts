import { randomInt } from "node:crypto";

const fixtures = new Map<string, { primary: number; detail: number; compactAttempts: number }>();

Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.HERMES_RECOVERY_TARGET_PORT ?? 8452),
  fetch(request) {
    const url = new URL(request.url);
    const target = /^\/recovery\/(RECOVER-[A-F0-9]{8})\/(primary|detail)$/.exec(url.pathname);
    if (!target || request.method !== "GET") return new Response("Not found.", { status: 404 });
    const [, marker, source] = target;
    let fixture = fixtures.get(marker);
    if (!fixture) {
      fixture = { primary: randomInt(190, 350), detail: randomInt(400, 540), compactAttempts: 0 };
      fixtures.set(marker, fixture);
    }
    const view = url.searchParams.get("view");
    const respond = (status: number, data: object) => {
      console.log(JSON.stringify({ marker, source, view, status, ...data, at: new Date().toISOString() }));
      return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
    };
    if (source === "primary") return respond(200, { source, units: fixture.primary });
    if (view === "compact" && fixture.compactAttempts++ === 0)
      return respond(503, { error: "The compact detail view is temporarily unavailable.", available_view: "rows" });
    if (view !== "compact" && view !== "rows") return respond(400, { error: "Select a detail view." });
    return respond(200, { source, units: fixture.detail });
  },
});
