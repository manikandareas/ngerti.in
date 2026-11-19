import { randomInt } from "node:crypto";
import { writeFileSync } from "node:fs";

const statePath = process.env.HERMES_COMPUTER_SAVE_STATE;
if (!statePath) throw new Error("Set the Fern save fixture state path.");
const stateFile = statePath;
const state = { attempts: 0, saves: 0, receipt: `FERN-SAVE-${randomInt(10000, 100000)}` };
function record(event: string) {
  writeFileSync(stateFile, JSON.stringify(state), { mode: 0o600 });
  console.log(JSON.stringify({ event, ...state, at: new Date().toISOString() }));
}
record("board_ready");

const path = "/fern-save";
Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.HERMES_COMPUTER_SAVE_PORT ?? 8449),
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === `${path}/submit` && request.method === "POST") {
      state.attempts += 1;
      if (state.attempts === 1) {
        record("request_received_without_save");
        return Response.json({ sent: true, saved: false });
      }
      state.saves += 1;
      record("report_saved");
      return Response.json({ sent: true, saved: true, receipt: state.receipt });
    }
    if (url.pathname !== path || request.method !== "GET")
      return new Response("Not found.", { status: 404 });
    return new Response(
      `<!doctype html><html lang="en"><meta charset="utf-8"><title>Fern Save Board</title>
      <style>
        body{margin:0;background:#ebf2ed;color:#22372c;font:23px system-ui,sans-serif}
        main{max-width:720px;margin:50px auto;padding:32px;background:#fff;border:1px solid #c0d5c5}
        h1{margin-top:0}button{background:#276346;color:white;border:0;font:inherit;padding:12px 18px;cursor:pointer}
      </style>
      <main>
        <h1>Fern Save Board</h1>
        <p>Report <strong>Fern intake summary</strong></p>
        <p id="request-state">${state.attempts ? "Save request sent" : "No request yet"}</p>
        <p><strong id="report-state">${state.saves ? `Saved ${state.receipt}` : "Not saved yet"}</strong></p>
        <form id="report"><button type="submit">Save report</button></form>
      </main>
      <script>
        const requestStatus = document.querySelector('#request-state')
        const reportStatus = document.querySelector('#report-state')
        document.querySelector('#report').addEventListener('submit', async (event) => {
          event.preventDefault()
          requestStatus.textContent = 'Save request sent'
          const response = await fetch('${path}/submit', { method: 'POST' })
          if (!response.ok) { requestStatus.textContent = 'Save request failed'; return }
          const result = await response.json()
          reportStatus.textContent = result.saved ? 'Saved ' + result.receipt : 'Not saved yet'
        })
      </script></html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
    );
  },
});
