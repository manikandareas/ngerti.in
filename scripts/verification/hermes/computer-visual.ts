import { randomInt } from "node:crypto";
import { writeFileSync } from "node:fs";

const stateFile = process.env.HERMES_COMPUTER_VISUAL_STATE;
if (!stateFile) throw new Error("Set HERMES_COMPUTER_VISUAL_STATE.");

const review = `CEDAR-${randomInt(1000, 10000)}`;
const confirmation = `RECEIPT-${randomInt(1000, 10000)}`;
const confirmOnLeft = randomInt(2) === 0;
const state = { review, confirmation, confirmOnLeft, confirmed: 0, skipped: 0 };
const persist = () => writeFileSync(stateFile, JSON.stringify(state), { mode: 0o600 });
persist();

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.HERMES_COMPUTER_VISUAL_PORT ?? 8444),
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/cedar-review/choice" && request.method === "POST") {
      const choice = await request.text();
      if (choice !== "confirm" && choice !== "skip")
        return new Response("Unknown choice.", { status: 422 });
      if (choice === "confirm") state.confirmed += 1;
      if (choice === "skip") state.skipped += 1;
      persist();
      console.log(JSON.stringify({ event: choice, at: new Date().toISOString() }));
      return Response.json({ confirmed: state.confirmed > 0 });
    }
    if (path !== "/cedar-review" || request.method !== "GET")
      return new Response("Review not found.", { status: 404 });
    return new Response(
      `<!doctype html><html lang="en"><meta charset="utf-8"><title>Cedar Review Board</title>
      <style>body{margin:0;background:#e9eff3}canvas{display:block;margin:22px auto;max-width:100%;height:auto}</style>
      <canvas width="830" height="420" aria-label="Review board"></canvas>
      <script>
        const canvas = document.querySelector('canvas')
        const ctx = canvas.getContext('2d')
        const confirmX = ${confirmOnLeft ? 110 : 463}
        const skipX = ${confirmOnLeft ? 463 : 110}
        const buttonY = 253
        let confirmed = ${state.confirmed > 0}
        let sending = false
        function label(text, x, y, font, color) {
          ctx.font = font
          ctx.fillStyle = color
          ctx.fillText(text, x, y)
        }
        function button(text, x, color) {
          ctx.fillStyle = color
          ctx.fillRect(x, buttonY, 257, 71)
          label(text, x + 28, buttonY + 44, 'bold 25px sans-serif', '#fff')
        }
        function draw() {
          ctx.fillStyle = '#102a40'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          label('Cedar intake review', 110, 77, 'bold 37px sans-serif', '#fff')
          label('${review}', 110, 145, 'bold 44px monospace', '#fff')
          if (confirmed) {
            label('Confirmed', 110, 244, 'bold 35px sans-serif', '#84efbe')
            label('${confirmation}', 110, 320, 'bold 39px monospace', '#fff')
            return
          }
          label('Waiting for a decision', 110, 199, '23px sans-serif', '#bbd1e3')
          button('CONFIRM CEDAR', confirmX, '#176d54')
          button('SKIP', skipX, '#745129')
        }
        canvas.addEventListener('click', async (event) => {
          if (sending || confirmed) return
          const bounds = canvas.getBoundingClientRect()
          const x = (event.clientX - bounds.left) / bounds.width * canvas.width
          const y = (event.clientY - bounds.top) / bounds.height * canvas.height
          if (y < buttonY || y > buttonY + 71) return
          const inside = (start) => x >= start && x <= start + 257
          const choice = inside(confirmX) ? 'confirm' : inside(skipX) ? 'skip' : null
          if (!choice) return
          sending = true
          try {
            const response = await fetch('/cedar-review/choice', { method: 'POST', body: choice })
            if (!response.ok) return
            confirmed = (await response.json()).confirmed
            draw()
          } finally {
            sending = false
          }
        })
        draw()
      </script></html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
    );
  },
});
console.log(`Cedar review board listening on ${server.url}`);
