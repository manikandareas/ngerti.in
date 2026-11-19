import { randomInt } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";

const statePath = process.env.HERMES_COMPUTER_DISPATCH_STATE;
const releasePath = process.env.HERMES_COMPUTER_DISPATCH_RELEASE;
if (!statePath || !releasePath) throw new Error("Set the Wren dispatch fixture paths.");
const stateFile = statePath;
const release = releasePath;
const state = { deliveries: 0, receipt: `WREN-REC-${randomInt(10000, 100000)}` };
function record(event: string) {
  writeFileSync(stateFile, JSON.stringify(state), { mode: 0o600 });
  console.log(JSON.stringify({ event, ...state, at: new Date().toISOString() }));
}
record("board_ready");

const boardPath = "/wren-dispatch";
Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.HERMES_COMPUTER_DISPATCH_PORT ?? 8448),
  idleTimeout: 100,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === `${boardPath}/commit` && request.method === "POST") {
      state.deliveries += 1;
      record("delivery_committed");
      const deadline = Date.now() + 70_000;
      while (!existsSync(release) && Date.now() < deadline) await Bun.sleep(250);
      record("delivery_response_released");
      return Response.json(state, { headers: { "Cache-Control": "no-store" } });
    }
    if (url.pathname !== boardPath || request.method !== "GET")
      return new Response("Not found.", { status: 404 });
    return new Response(
      `<!doctype html><html lang="en"><meta charset="utf-8"><title>Wren Dispatch Board</title>
      <style>
        body{margin:0;background:#edf1eb;color:#23372c;font:23px system-ui,sans-serif}
        main{max-width:710px;margin:50px auto;padding:32px;background:#fff;border:1px solid #c0d3c4}
        h1{margin-top:0}button{background:#265840;color:white;border:0;font:inherit;padding:12px 18px;cursor:pointer}
      </style>
      <main>
        <h1>Wren Dispatch Board</h1>
        <p>Recorded deliveries <strong id="count">${state.deliveries}</strong></p>
        <p><strong id="receipt">${state.deliveries ? state.receipt : "No delivery recorded"}</strong></p>
        <button id="record" type="button">Record delivery</button>
      </main>
      <script>
        document.querySelector('#record').addEventListener('click', () => {
          const request = new XMLHttpRequest()
          // Keep the event handler open while the fixture withholds its response.
          request.open('POST', '${boardPath}/commit', false)
          request.send()
          if (request.status !== 200) return
          const state = JSON.parse(request.responseText)
          document.querySelector('#count').textContent = String(state.deliveries)
          document.querySelector('#receipt').textContent = state.receipt
        })
      </script></html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
    );
  },
});
