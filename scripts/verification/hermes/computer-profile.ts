import { createHash, randomInt } from "node:crypto";

const configuredGeneration = process.env.HERMES_COMPUTER_PROFILE_GENERATION;
const pin = process.env.HERMES_COMPUTER_PROFILE_PIN;
if (!configuredGeneration || !pin || !/^\d{6}$/.test(pin))
  throw new Error("Set the Orchid session generation file and a six-digit fixture PIN.");
const generationPath = configuredGeneration;

const account = "Orchid Operator";
const base = "/orchid-portal";
const cookieName = "hermes_orchid_fixture";
const sessions = new Map<string, number>();
const records = new Map<number, string>();
const headers = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" };
const report = (event: string, details: object) =>
  console.log(JSON.stringify({ event, ...details, at: new Date().toISOString() }));
const fingerprint = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 16);

Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.HERMES_COMPUTER_PROFILE_PORT ?? 8447),
  async fetch(request) {
    const path = new URL(request.url).pathname;
    const generation = Number(await Bun.file(generationPath).text());
    if (!Number.isSafeInteger(generation) || generation < 1)
      return new Response("Invalid fixture generation.", { status: 503 });
    const token = request.headers.get("cookie")?.match(/(?:^|;\s*)hermes_orchid_fixture=([\w-]+)/)?.[1];
    if (path === `${base}/login` && request.method === "POST") {
      const input = (await request.formData()).get("pin");
      if (input !== pin) {
        report("login_denied", { account, generation });
        return new Response("The fixture code did not match.", { status: 401, headers });
      }
      const next = crypto.randomUUID();
      sessions.set(next, generation);
      report("signed_in", { account, generation, session: fingerprint(next) });
      return new Response(null, {
        status: 303,
        headers: {
          Location: base,
          "Set-Cookie": `${cookieName}=${next}; Max-Age=3600; Path=${base}; HttpOnly; SameSite=Lax`,
          "Cache-Control": headers["Cache-Control"],
        },
      });
    }
    if (path !== base || request.method !== "GET")
      return new Response("Not found.", { status: 404 });
    const authenticated = token !== undefined && sessions.get(token) === generation;
    let docket = records.get(generation);
    if (!docket) {
      docket = `ORCHID-DOCKET-${randomInt(10000, 100000)}`;
      records.set(generation, docket);
    }
    if (authenticated) {
      report("protected_page", { account, generation, session: fingerprint(token), docket });
    } else {
      report(token ? "session_expired" : "sign_in_required", {
        account,
        generation,
        session: token ? fingerprint(token) : null,
      });
    }
    return new Response(
      `<!doctype html><html lang="en"><meta charset="utf-8"><title>Orchid Session Portal</title>
      <style>
        body{margin:0;background:#f1eef5;color:#302642;font:21px system-ui,sans-serif}
        main{max-width:680px;margin:54px auto;padding:36px;background:#fff;border:1px solid #d5cfe1}
        h1{margin-top:0}label{display:block;margin:16px 0 7px}
        input,button{font:inherit;padding:10px 16px}input{width:150px}button{background:#503b70;color:#fff;border:0}
      </style><main>
        <h1>Orchid Session Portal</h1>
        <p>Account <strong>${account}</strong></p>
        ${authenticated ? `<h2>Active session</h2><p>Current docket <strong>${docket}</strong></p>` : `
          <h2>${token ? "Session expired" : "Sign in required"}</h2>
          <form method="POST" action="${base}/login">
            <label for="pin">Fixture access code</label>
            <input id="pin" name="pin" type="password" inputmode="numeric" autocomplete="off" required maxlength="6">
            <button type="submit">Sign in</button>
          </form>`}
      </main></html>`,
      { headers },
    );
  },
});
