const port = Number(process.env.HERMES_WEB_RESEARCH_PORT ?? 8431);
const origin = `http://127.0.0.1:${port}`;
const documents = new Map([
  [
    "/hazel/field-guide-2026",
    {
      title: "Hazel Beacon Field Guide · November 2026",
      description:
        "Current procedures for the synthetic Hazel Beacon, including the amber review rule.",
      heading: "Amber review",
      text: "Open a manual review when the Hazel Beacon falls below 42 signal units in two consecutive observation windows. Route the review to the Reliability desk. Clear the alert only after three consecutive windows at or above 48 signal units.",
    },
  ],
  [
    "/hazel/archive-2024",
    {
      title: "Archived Hazel Beacon Field Guide · November 2024",
      description: "Archived and superseded. Historical alert levels are available for comparison.",
      heading: "Historical rule",
      text: "This obsolete procedure used 36 signal units over three consecutive windows and routed alerts to Field Dispatch.",
    },
  ],
  [
    "/oriole/status-card",
    {
      title: "Oriole published status card",
      description: "Current synthetic status for the Oriole handover desk.",
      heading: "Current handover",
      text: "Verification code ORIOLE-STATUS-284. The handover desk is Open. This recorded status is current for the exercise.",
    },
  ],
]);

Bun.serve({
  hostname: "127.0.0.1",
  port,
  async fetch(request) {
    const path = new URL(request.url).pathname;
    const document = documents.get(path);
    if (request.method === "GET" && document) {
      console.log(JSON.stringify({ event: "source_opened", path, at: new Date().toISOString() }));
      return new Response(
        `<!doctype html><html lang="en"><head><title>${document.title}</title></head><body><main><h1>${document.title}</h1><h2>${document.heading}</h2><p>${document.text}</p></main></body></html>`,
        { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
      );
    }
    if (request.method === "POST" && path === "/v2/search") {
      const { query } = (await request.json()) as { query?: string };
      if (!query) return Response.json({ success: false }, { status: 400 });
      console.log(JSON.stringify({ event: "web_search", query, at: new Date().toISOString() }));
      const web = [...documents]
        .filter(([path]) => {
          if (path.startsWith("/hazel/")) return /hazel|beacon/i.test(query);
          return /oriole/i.test(query);
        })
        .reverse()
        .map(([path, { title, description }]) => ({ url: origin + path, title, description }));
      return Response.json({ success: true, data: { web } });
    }
    if (request.method === "POST" && path === "/v2/scrape") {
      const { url } = (await request.json()) as { url?: string };
      const source = url ? URL.parse(url) : null;
      if (source?.origin === origin && source.pathname === "/oriole/live-status") {
        console.log(
          JSON.stringify({
            event: "web_extract",
            path: source.pathname,
            status: 503,
            at: new Date().toISOString(),
          }),
        );
        return Response.json(
          { success: false, error: "ORIOLE_TEMPORARILY_UNAVAILABLE" },
          { status: 503 },
        );
      }
      const target = source?.origin === origin ? documents.get(source.pathname) : null;
      if (!source || !target) return Response.json({ success: false }, { status: 404 });
      console.log(
        JSON.stringify({
          event: "web_extract",
          path: source.pathname,
          at: new Date().toISOString(),
        }),
      );
      return Response.json({
        success: true,
        data: {
          markdown: `# ${target.title}\n\n## ${target.heading}\n\n${target.text}`,
          metadata: { title: target.title, sourceURL: source.href },
        },
      });
    }
    return new Response(null, { status: 404 });
  },
});
