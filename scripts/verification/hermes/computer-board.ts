const signalFile = process.env.HERMES_COMPUTER_BOARD_SIGNAL_FILE;
if (!signalFile) throw new Error("Set HERMES_COMPUTER_BOARD_SIGNAL_FILE.");

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.HERMES_COMPUTER_BOARD_PORT ?? 8442),
  async fetch(request) {
    if (request.method !== "GET") return new Response("Board not found.", { status: 404 });
    const path = new URL(request.url).pathname;
    if (path === "/harbor") {
      return new Response(
        `<!doctype html><html lang="en"><meta charset="utf-8"><title>Harbor Signal Board</title>
          <main><h1>Harbor Signal Board</h1><dl>
            <dt>Current published signal</dt><dd id="published">Loading…</dd>
            <dt>Confirmation field</dt><dd id="confirmation">Loading…</dd>
          </dl><p id="status" role="status"></p></main>
          <script>
            fetch("/harbor/reading", { headers: { "X-Harbor-Board": "render" } }).then(async (response) => {
              if (!response.ok) throw new Error("Reading unavailable");
              const reading = await response.json();
              document.getElementById("published").textContent = reading.published;
              document.getElementById("confirmation").textContent = reading.confirmation;
              document.getElementById("status").textContent = "Board updated";
            }).catch(() => {
              document.getElementById("status").textContent = "Reading unavailable";
            });
          </script></html>`,
        { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
      );
    }
    if (
      path !== "/harbor/reading" ||
      request.headers.get("X-Harbor-Board") !== "render" ||
      !request.headers.get("User-Agent")?.includes("Chrome/")
    )
      return new Response("Open the board in a browser.", { status: 404 });

    const signal = (await Bun.file(signalFile).text()).trim();
    if (!/^HARBOR-[A-Z0-9-]+$/.test(signal))
      return new Response("Invalid fixture signal.", { status: 503 });

    console.log(JSON.stringify({ event: "harbor_board_rendered", at: new Date().toISOString() }));
    return Response.json(
      { published: signal, confirmation: signal },
      { headers: { "Cache-Control": "no-store" } },
    );
  },
});
console.log(`Harbor board listening on ${server.url}`);
