const datasets = {
  cedar: [
    ["Cedar North", 41],
    ["Cedar East", 83],
    ["Cedar South", 130],
    ["Cedar West", 63],
  ],
  maple: [
    ["Maple Central", 142],
    ["Maple West", 19],
    ["Maple North", 241],
    ["Maple South", 89],
    ["Maple East", 93],
  ],
  birch: [
    ["Birch East", 175],
    ["Birch North", 34],
    ["Birch West", 211],
    ["Birch Reach", 97],
    ["Birch South", 116],
    ["Birch Pier", 48],
  ],
} as const;

const cedarOverride = process.env.HERMES_DASHBOARD_CEDAR_SOUTH_FILE;

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.HERMES_DASHBOARD_PORT ?? 8413),
  async fetch(request) {
    const url = new URL(request.url);
    const [dataset, action] = url.pathname.split("/").slice(1);
    if (dataset !== "cedar" && dataset !== "maple" && dataset !== "birch")
      return new Response("Dashboard not found", { status: 404 });
    if (action === "export") {
      console.log(JSON.stringify({ dataset, action, status: 503 }));
      return new Response("CSV export temporarily unavailable. The dashboard remains readable.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    if (action) return new Response("Page not found", { status: 404 });
    let rows: readonly (readonly [string, number])[] = datasets[dataset];
    if (dataset === "cedar" && cedarOverride) {
      const value = (await Bun.file(cedarOverride).text()).trim();
      if (!/^\d{1,3}$/.test(value)) return new Response("Invalid fixture reading", { status: 503 });
      rows = rows.map(([site, units]) => [site, site === "Cedar South" ? Number(value) : units]);
    }
    const pageSize = 2;
    const lastPage = Math.ceil(rows.length / pageSize);
    const page = Number(url.searchParams.get("page") ?? 1);
    if (!Number.isInteger(page) || page < 1 || page > lastPage)
      return new Response("Page not found", { status: 404 });
    console.log(JSON.stringify({ dataset, action: "read", page, status: 200 }));
    const visible = rows.slice((page - 1) * pageSize, page * pageSize);
    return new Response(
      `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${dataset} Operations Dashboard</title></head>
<body>
<main>
  <h1>${dataset} Operations Dashboard</h1>
  <a href="/${dataset}/export">Export CSV</a>
  <table>
    <caption>Daily units by site</caption>
    <thead><tr><th scope="col">Site</th><th scope="col">Units</th></tr></thead>
    <tbody>${visible.map(([site, units]) => `<tr><td>${site}</td><td>${units}</td></tr>`).join("")}</tbody>
  </table>
  <nav aria-label="Pagination">
    <p>Page ${page} of ${lastPage} · ${rows.length} sites</p>
    ${page > 1 ? `<a href="?page=${page - 1}">Previous page</a>` : ""}
    ${page < lastPage ? `<a href="?page=${page + 1}">Next page</a>` : ""}
  </nav>
</main>
</body>
</html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
    );
  },
});

console.log(`Dashboard fixture listening on ${server.url}`);
