import { existsSync } from "node:fs";

const api = process.env.HERMES_CHANNEL_API ?? "http://127.0.0.1:8412";
const key = process.env.NGERTIIN_TEST_CHANNEL_RECEIVE;
const token = process.env.NGERTIIN_TEST_CHANNEL_DELIVERY;
const outage = process.env.HERMES_CHANNEL_OUTAGE;
if (!key || !token || !outage) throw new Error("Set the isolated channel fixture credentials and outage gate.");

type File = { id: string; name: string; media_type: string; size_bytes: number };
type Reply = { event_id: string; source_event_id: string; remote_thread: string; text: string; attachments: File[] };
const replies = new Map<string, Reply>();
const exchanges = new Map<string, string>();
const route = `${api}/v1/channels/cedar-bridge`;

const page = `<!doctype html>
<html lang="en"><meta charset="utf-8"><title>Cedar Support Inbox</title>
<style>
body{font:16px system-ui;background:#f6f7f4;color:#23322b;margin:48px auto;padding:0 24px;max-width:760px}
header{display:flex;justify-content:space-between;align-items:center;gap:16px;border-bottom:1px solid #ccd4cd}
main{margin-top:28px}label{display:block;margin:16px 0 6px}textarea{width:100%;min-height:88px;font:inherit;padding:12px;box-sizing:border-box}
button{font:inherit;padding:8px 14px;background:#183e2d;color:white;border:0;border-radius:6px;margin:12px 0}
article{background:white;padding:16px 18px;margin:12px 0;border:1px solid #dbe1da;border-radius:10px}
a{color:#1d5745}
</style>
<header><h1>Cedar Support Inbox</h1><nav><a href="/?as=cedar-owner">Owner</a> · <a href="/?as=cedar-guest">Guest</a></nav></header>
<main>
<p id="identity"></p>
<h2>Cedar ticket 46</h2>
<form><label for="message">Message</label><textarea id="message" required></textarea>
<button>Send message</button></form>
<button id="check">Check receipt access</button>
<p role="status" id="status"></p>
<section aria-label="Replies" id="replies"></section>
</main>
<script type="module">
const who = new URLSearchParams(location.search).get('as') === 'cedar-guest' ? 'cedar-guest' : 'cedar-owner';
const suffix = '?as=' + who;
const status = document.querySelector('#status');
document.querySelector('#identity').textContent = 'Signed in as ' + who;
document.querySelector('form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = document.querySelector('#message');
  const response = await fetch('/messages' + suffix, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({event_id:crypto.randomUUID(),text:input.value})});
  if (response.ok) input.value = '';
  status.textContent = response.ok ? 'Message accepted.' : 'Message denied (' + response.status + ').';
});
document.querySelector('#check').addEventListener('click', async () => {
  const response = await fetch('/receipt' + suffix);
  status.textContent = response.ok ? 'Receipt available.' : 'Receipt denied (' + response.status + ').';
});
async function refresh() {
  try {
    const response = await fetch('/replies' + suffix);
    const replies = response.ok ? await response.json() : [];
    const container = document.querySelector('#replies');
    for (const reply of replies) {
      if (document.getElementById(reply.event_id)) continue;
      const item = document.createElement('article');
      item.id = reply.event_id;
      const text = document.createElement('p');
      text.textContent = reply.text;
      item.append(text);
      for (const file of reply.attachments) {
        const link = document.createElement('a');
        link.href = '/files/' + reply.event_id + '/' + file.id + suffix;
        link.textContent = file.name;
        item.append(link);
      }
      container.append(item);
    }
  } finally { setTimeout(refresh, 1000); }
}
void refresh();
</script>`;

Bun.serve({
  port: 8471,
  hostname: "127.0.0.1",
  async fetch(request) {
    const url = new URL(request.url);
    const sender = url.searchParams.get("as") === "cedar-guest" ? "cedar-guest" : "cedar-owner";
    const headers = { authorization: `Bearer ${key}`, "X-Ngertiin-Channel-Sender": sender };
    if (request.method === "GET" && url.pathname === "/")
      return new Response(page, { headers: { "Content-Type": "text/html;charset=utf-8", "Cache-Control": "no-store" } });
    if (request.method === "POST" && url.pathname === "/messages") {
      const message = await request.json() as { event_id: string; text: string };
      const response = await fetch(`${route}/events`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(message),
      });
      console.info(JSON.stringify({ event: "admission", sender, event_id: message.event_id, status: response.status }));
      if (!response.ok) return new Response(null, { status: response.status });
      const exchange = await response.json() as { id: string };
      exchanges.set(message.event_id, exchange.id);
      return Response.json(exchange);
    }
    if (request.method === "POST" && url.pathname === "/deliver") {
      if (request.headers.get("Authorization") !== `Bearer ${token}`) return new Response(null, { status: 401 });
      const reply = await request.json() as Reply;
      if (request.headers.get("Idempotency-Key") !== reply.event_id || reply.remote_thread !== "cedar-ticket-46")
        return Response.json({ event_id: reply.event_id, status: "rejected" }, { status: 422 });
      const unavailable = existsSync(outage);
      const delivered = replies.has(reply.event_id);
      console.info(JSON.stringify({ event: "delivery", id: reply.event_id, source_event: reply.source_event_id,
        room: reply.remote_thread, outcome: unavailable ? "retry" : delivered ? "duplicate" : "delivered",
        attachments: reply.attachments.length }));
      if (unavailable) return Response.json({ event_id: reply.event_id, status: "retry" }, { status: 503 });
      if (!delivered) replies.set(reply.event_id, reply);
      return Response.json({ event_id: reply.event_id, status: "delivered" });
    }
    if (request.method === "GET" && url.pathname === "/replies")
      return sender === "cedar-owner" ? Response.json([...replies.values()]) : new Response(null, { status: 403 });
    if (request.method === "GET" && url.pathname === "/receipt") {
      const exchange = exchanges.get(url.searchParams.get("event") ?? "") ?? [...exchanges.values()].at(-1);
      if (!exchange) return new Response(null, { status: 404 });
      const response = await fetch(`${route}/exchanges/${exchange}`, { headers });
      console.info(JSON.stringify({ event: "receipt", sender, exchange, status: response.status }));
      return new Response(response.body, { status: response.status, headers: { "Content-Type": "application/json" } });
    }
    const file = /^\/files\/([a-f\d-]{36})\/([a-f\d-]{36})$/.exec(url.pathname);
    if (request.method === "GET" && file) {
      const response = await fetch(`${route}/exchanges/${file[1]}/artifacts/${file[2]}`, { headers });
      console.info(JSON.stringify({ event: "download", sender, exchange: file[1], artifact: file[2], status: response.status }));
      return response;
    }
    return new Response("Not found.", { status: 404 });
  },
});
