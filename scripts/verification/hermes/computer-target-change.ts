import { randomInt } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";

const statePath = process.env.HERMES_COMPUTER_TARGET_STATE;
const changePath = process.env.HERMES_COMPUTER_TARGET_CHANGE;
if (!statePath || !changePath) throw new Error("Set the Spruce fixture state and change paths.");
const stateFile = statePath;
const changeFile = changePath;
const path = "/spruce-review";
const original = `SPRUCE-${randomInt(10000, 30000)}`;
const revised = `SPRUCE-${randomInt(30000, 60000)}`;
const other = `SPRUCE-${randomInt(60000, 90000)}`;
const state = { original, revised, other, revision: 1, submissions: [] as string[] };
function record(event: string) {
  writeFileSync(stateFile, JSON.stringify(state), { mode: 0o600 });
  console.log(JSON.stringify({ event, ...state, at: new Date().toISOString() }));
}
record("queue_ready");

Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.HERMES_COMPUTER_TARGET_PORT ?? 8450),
  async fetch(request) {
    const url = new URL(request.url);
    if (state.revision === 1 && existsSync(changeFile)) {
      state.revision = 2;
      record("queue_revised");
    }
    if (url.pathname === `${path}/state` && request.method === "GET") {
      const current = state.revision === 1 ? [original] : [other, revised];
      return Response.json(
        { revision: state.revision, current, accepted: state.submissions.at(-1) ?? null },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (url.pathname === `${path}/accept` && request.method === "POST") {
      const { ticket } = (await request.json()) as { ticket?: unknown };
      if (ticket !== original && ticket !== revised && ticket !== other)
        return new Response("Unknown ticket.", { status: 404 });
      state.submissions.push(ticket);
      record("ticket_accepted");
      return Response.json({ ticket });
    }
    if (url.pathname !== path || request.method !== "GET")
      return new Response("Not found.", { status: 404 });
    return new Response(
      `<!doctype html><html lang="en"><meta charset="utf-8"><title>Spruce Review Queue</title>
      <style>
        body{margin:0;background:#ecf3f0;color:#173a2e;font:23px system-ui,sans-serif}
        main{max-width:740px;margin:52px auto;padding:34px;background:white;border:1px solid #b7d6c9}
        h1{margin-top:0}section{display:grid;gap:16px}button{max-width:max-content;background:#216548;color:white;border:0;font:inherit;padding:10px 15px;cursor:pointer}
      </style>
      <main><h1>Spruce Review Queue</h1><h2 id="revision">Loading queue</h2><section id="queue"></section><p id="receipt"></p></main>
      <script>
        const revision = document.querySelector('#revision')
        const queue = document.querySelector('#queue')
        const receipt = document.querySelector('#receipt')
        let displayedRevision
        async function refresh() {
          const response = await fetch('${path}/state', { cache: 'no-store' })
          if (!response.ok) return
          const state = await response.json()
          if (state.revision !== displayedRevision) {
            displayedRevision = state.revision
            revision.textContent = state.revision === 1 ? 'Original queue' : 'Revised queue'
            queue.replaceChildren(...state.current.map((ticket, slot) => {
              const button = document.createElement('button')
              button.type = 'button'
              button.id = 'queue-slot-' + slot
              const type = state.revision === 1 ? 'original ' : slot === 0 ? 'other ' : 'revised '
              button.textContent = 'Accept ' + type + ticket
              button.onclick = async () => {
                const result = await fetch('${path}/accept', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ ticket })
                })
                if (result.ok) receipt.textContent = 'Accepted ' + ticket
              }
              return button
            }))
          }
          receipt.textContent = state.accepted ? 'Accepted ' + state.accepted : 'No ticket accepted'
        }
        refresh().catch(console.error)
        setInterval(() => refresh().catch(console.error), 500)
      </script></html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
    );
  },
});
