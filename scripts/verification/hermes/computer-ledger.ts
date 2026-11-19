import { renameSync, writeFileSync } from "node:fs";

const stateFile = process.env.HERMES_COMPUTER_LEDGER_STATE;
if (!stateFile) throw new Error("Set HERMES_COMPUTER_LEDGER_STATE.");

type LedgerState = { review: string; submissions: number };
const rows = [
  ["East", 16],
  ["North", 25],
  ["South", 31],
  ["West", 18],
  ["Yard", 20],
  ["Annex", 15],
] as const;
const pageCount = 3;
const headers = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" };

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.HERMES_COMPUTER_LEDGER_PORT ?? 8443),
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/lotus-ledger/save" && request.method === "POST") {
      const form = await request.formData();
      const review = form.get("review");
      if (typeof review !== "string" || !/^LOTUS-[A-Z0-9-]+$/.test(review))
        return new Response("Enter a valid review label.", { status: 422, headers });
      const current = (await Bun.file(stateFile).json()) as LedgerState;
      const next = { review, submissions: current.submissions + 1 };
      const staged = `${stateFile}.${crypto.randomUUID()}.tmp`;
      writeFileSync(staged, JSON.stringify(next), { flag: "wx", mode: 0o600 });
      renameSync(staged, stateFile);
      console.log(JSON.stringify({ event: "review_saved", ...next, at: new Date().toISOString() }));
      return new Response(null, {
        status: 303,
        headers: { Location: "/lotus-ledger?page=3" },
      });
    }
    if (url.pathname !== "/lotus-ledger" || request.method !== "GET")
      return new Response("Ledger not found.", { status: 404 });
    const page = Number(url.searchParams.get("page") ?? 1);
    if (!Number.isInteger(page) || page < 1 || page > pageCount)
      return new Response("Page not found.", { status: 404 });
    const current = (await Bun.file(stateFile).json()) as LedgerState;
    if (!/^LOTUS-[A-Z0-9-]+$/.test(current.review))
      return new Response("Invalid fixture state.", { status: 503 });
    console.log(
      JSON.stringify({
        event: "ledger_page",
        page,
        review: current.review,
        at: new Date().toISOString(),
      }),
    );
    const visible = rows.slice((page - 1) * 2, page * 2);
    return new Response(
      `<!doctype html><html lang="en"><meta charset="utf-8"><title>Lotus Intake Ledger</title>
      <main>
        <h1>Lotus Intake Ledger</h1>
        <table><caption>Units by intake location</caption>
          <thead><tr><th scope="col">Location</th><th scope="col">Units</th></tr></thead>
          <tbody>${visible.map(([name, units]) => `<tr><td>${name}</td><td>${units}</td></tr>`).join("")}</tbody>
        </table>
        <nav aria-label="Pagination">
          <p>Page ${page} of ${pageCount}</p>
          ${page > 1 ? `<a href="?page=${page - 1}">Previous page</a>` : ""}
          ${page < pageCount ? `<a href="?page=${page + 1}">Next page</a>` : ""}
        </nav>
        ${
          page === pageCount
            ? `<section>
          <h2>Intake review</h2><p>Saved review label: <strong>${current.review}</strong></p>
          <form action="/lotus-ledger/save" method="POST">
            <label for="review">Review label</label>
            <input id="review" name="review" value="${current.review}" required>
            <button type="submit">Save review label</button>
          </form>
        </section>`
            : ""
        }
      </main></html>`,
      { headers },
    );
  },
});
console.log(`Lotus ledger listening on ${server.url}`);
