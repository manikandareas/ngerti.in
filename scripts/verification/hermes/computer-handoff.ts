import { existsSync, writeFileSync } from "node:fs";

const statePath = process.env.HERMES_COMPUTER_HANDOFF_STATE;
const releasePath = process.env.HERMES_COMPUTER_HANDOFF_RELEASE;
if (!statePath || !releasePath) throw new Error("Set the Computer handoff fixture paths.");
const stateFile = statePath;
const releaseFile = releasePath;
const dispatchRestored = process.env.HERMES_COMPUTER_DISPATCH_RESTORED;
const saveRetry = process.env.HERMES_COMPUTER_SAVE_RETRY;
const targetChange = process.env.HERMES_COMPUTER_TARGET_CHANGE;

const port = Number(process.env.HERMES_COMPUTER_HANDOFF_PORT ?? 8446);
const boardUrl = `http://host.docker.internal:${port}/iris-handoff`;
type BoardState = { operatorCode: string | null; publishedCode: string | null };
const state: BoardState = existsSync(stateFile)
  ? await Bun.file(stateFile).json()
  : { operatorCode: null, publishedCode: null };
if (![state.operatorCode, state.publishedCode].every((code) => code === null || /^IRIS-\d{4}$/.test(code)))
  throw new Error("Invalid saved Iris board state.");
function record(event: string, data: object = {}) {
  console.log(JSON.stringify({ event, ...data, at: new Date().toISOString() }));
}
function save(event: string) {
  writeFileSync(stateFile, JSON.stringify(state), { mode: 0o600 });
  record(event, state);
}
save("board_ready");

type Message = { role: string; content?: string | { text?: string }[] };
type ProviderInput = { messages?: Message[]; tools?: { function: { name: string } }[] };
type Target = { target_id: string; tab_id: string; snapshot_format: "semantic_v2" };
type Page = {
  page: { url: string };
  snapshot: { id: string };
  refs: { name: string; ref: string }[];
  content_refs: { name: string }[];
};
const model = "computer-handoff";
const messageText = (content: Message["content"]) =>
  typeof content === "string" ? content : (content ?? []).map((part) => part.text ?? "").join("\n");

function observation(result: Message) {
  const envelope = JSON.parse(messageText(result.content).split("\n", 1)[0] ?? "{}");
  if (envelope.isError || typeof envelope.structuredJson !== "string")
    throw new Error("Expected a successful Computer observation.");
  return JSON.parse(envelope.structuredJson);
}

async function provider(request: Request, handbackGate: string) {
  const { messages = [], tools = [] } = (await request.json()) as ProviderInput;
  const id = `chatcmpl-${crypto.randomUUID()}`;
  const headers = { "Content-Type": "text/event-stream", "Cache-Control": "no-store" };
  const done = "data: [DONE]\n\n";
  const chunk = (delta: object, finish_reason: string | null) =>
    `data: ${JSON.stringify({ id, model, created: Math.floor(Date.now() / 1000), object: "chat.completion.chunk", choices: [{ index: 0, delta, finish_reason }] })}\n\n`;
  const stream = (delta: object, finish: string) =>
    new Response(chunk({ role: "assistant", ...delta }, null) + chunk({}, finish) + done, { headers });
  const reply = (content: string) => stream({ content }, "stop");
  const tool = (suffix: string, args: object) => {
    const match = tools.find((item) => item.function.name.endsWith(suffix));
    if (!match) throw new Error(`Fixture tool missing: ${suffix}.`);
    return {
      tool_calls: [
        {
          index: 0,
          id: `call_${crypto.randomUUID()}`,
          type: "function",
          function: { name: match.function.name, arguments: JSON.stringify(args) },
        },
      ],
    };
  };
  const commandId = () => crypto.randomUUID();
  const computerDelta = (name: string, args: object) =>
    tool("computer_call", { name, arguments: args, command_id: commandId() });
  const call = (name: string, args: object) => stream(computerDelta(name, args), "tool_calls");
  const userIndex = messages.findLastIndex(({ role }) => role === "user");
  const prompt = messageText(messages[userIndex]?.content);
  const results = messages.slice(userIndex + 1).filter(({ role }) => role === "tool");
  const otherBoards = [
    { title: "Orchid Session Portal", url: "http://host.docker.internal:8447/orchid-portal" },
    { title: "Wren Dispatch Board", url: "http://host.docker.internal:8448/wren-dispatch" },
    { title: "Fern Save Board", url: "http://host.docker.internal:8449/fern-save" },
    { title: "Spruce Review Queue", url: "http://host.docker.internal:8450/spruce-review" },
  ];
  const namedBoard = otherBoards.find(({ title }) => prompt.includes(title));
  const desktopTarget = namedBoard ?? { title: "Iris Operator Handoff", url: boardUrl };
  const { url, title } = desktopTarget;
  const opening = prompt.includes("Open the Iris operator handoff board") || prompt.includes(`Open the ${title}`);
  const working = prompt.includes("Publish my operator entry from the Iris handoff board");
  const checking = namedBoard || prompt.includes("Check what the Iris handoff board shows as published");
  if ((!opening && !working && !checking) || !tools.length)
    return reply("Computer handoff fixture connected.");
  try {
    if (opening && !results.length)
      return stream(
        tool("machine_window", {
          operation: "open_browser",
          url,
          keep_open: true,
          command_id: commandId(),
        }),
        "tool_calls",
      );
    if (opening && results.length === 1) return call("list_windows", {});
    if (!results.length) return call("list_windows", {});
    const { windows } = observation(results[opening ? results.length - 1 : 0]);
    const window = windows.find((item: { title: string }) => item.title === `${title} - Chromium`);
    if (!window && opening && results.length < 4) return call("list_windows", {});
    if (!window) return reply(`I could not see ${title} in Computer.`);
    if (opening) return reply(`${title} is open in Computer.`);
    const { pid, window_id } = window;
    if (results.length === 1)
      return call("browser_prepare", {
        pid,
        window_id,
        strategy: { kind: "existing_profile" },
        delivery_mode: "foreground",
      });
    if (results.length === 2) {
      observation(results[1]);
      return call("get_browser_state", { pid, window_id });
    }
    const { target_id, tabs } = observation(results[2]);
    const tab = tabs.find((candidate: { url: string }) => candidate.url === url);
    if (!tab) return reply(`The existing browser profile did not expose the ${title} tab.`);
    const target: Target = { target_id, tab_id: tab.tab_id, snapshot_format: "semantic_v2" };
    if (results.length === 3) return call("get_browser_state", target);

    const before = observation(results[3]) as Page;
    if (title === "Spruce Review Queue") {
      const original = before.refs.find(({ name }) => /^Accept original SPRUCE-\d{5}$/.test(name));
      if (!original || !before.content_refs.some(({ name }) => name === "Original queue") || before.page.url !== url)
        return reply("I could not verify the original Spruce queue.");
      if (results.length === 4) {
        record("spruce_observed_original", {
          snapshot: before.snapshot.id, button: original.name, ref: original.ref, window_id,
          includes_target_change_guidance: messages.some(({ content }) =>
            messageText(content).includes("If the active window, tab, or page contents change"),
          ),
        });
        const deadline = Date.now() + 55_000;
        while (targetChange && !existsSync(targetChange) && Date.now() < deadline) await Bun.sleep(250);
        if (!targetChange || !existsSync(targetChange)) return reply("The Spruce queue did not change.");
        return call("get_browser_state", target);
      }
      const current = observation(results[4]) as Page;
      const button = current.refs.find(({ name }) => /^Accept revised SPRUCE-\d{5}$/.test(name));
      if (!button || current.page.url !== url || current.snapshot.id === before.snapshot.id ||
          !current.content_refs.some(({ name }) => name === "Revised queue"))
        return reply("I left the queue unchanged because I could not verify the revised ticket.");
      const ticket = button.name.replace("Accept revised ", "");
      if (results.length === 5) {
        record("spruce_reobserved_revised", { snapshot: current.snapshot.id, ticket, ref: button.ref, window_id });
        return call("browser_click", {
          target_id: target.target_id, tab_id: target.tab_id, ref: button.ref, input_route: "dom_event",
        });
      }
      if (results.length === 6) return call("get_browser_state", target);
      const after = observation(results[6]) as Page;
      if (after.page.url !== url || !after.content_refs.some(({ name }) => name === `Accepted ${ticket}`))
        return reply("I did not observe an acceptance receipt for the revised ticket.");
      record("spruce_verified_acceptance", { snapshot: after.snapshot.id, ticket, window_id });
      return reply(`I accepted the ticket in the revised Spruce queue. The board shows Accepted ${ticket}.`);
    }
    if (title === "Wren Dispatch Board") {
      if (before.page.url !== url) return reply("I could not verify the Wren dispatch tab.");
      if (results.length === 4) {
        const labels = before.content_refs.map(({ name }) => name);
        const button = before.refs.find(({ name }) => name === "Record delivery");
        if (!labels.includes("No delivery recorded") || !button)
          return reply("I left the board alone because it no longer shows an empty delivery.");
        record("wren_observed_empty", { snapshot: before.snapshot.id, window_id });
        return call("browser_click", {
          target_id: target.target_id, tab_id: target.tab_id, ref: button.ref, input_route: "dom_event",
        });
      }
      if (results.length === 5) {
        const outcome = messageText(results[4].content).trim();
        if (outcome === "MACHINE_UNKNOWN" || outcome === "TOOL_UNAVAILABLE")
          record("wren_acknowledgement_missing", { outcome });
        else record("wren_driver_acknowledgement", { effect: observation(results[4]).effect });
        const deadline = Date.now() + 50_000;
        while (dispatchRestored && !existsSync(dispatchRestored) && Date.now() < deadline)
          await Bun.sleep(250);
        return call("get_browser_state", target);
      }
      let after: Page;
      try {
        after = observation(results.at(-1) as Message);
      } catch {
        if (results.length < 8) return call("get_browser_state", target);
        return reply("The connection reopened, but I still could not read the board. I left the delivery untouched.");
      }
      const labels = after.content_refs.map(({ name }) => name);
      const receipt = labels.find((name) => /^WREN-REC-\d{5}$/.test(name));
      if (after.page.url === url && after.snapshot.id !== before.snapshot.id && receipt && labels.includes("1")) {
        record("wren_observed_existing_delivery", { receipt, snapshot: after.snapshot.id, window_id });
        return reply(`After reconnecting, the board shows one recorded delivery with receipt ${receipt}.`);
      }
      if (results.length < 8) {
        await Bun.sleep(3500);
        return call("get_browser_state", target);
      }
      return reply("I could not verify a delivery on the current board, so I did not repeat the action.");
    }
    if (title === "Fern Save Board") {
      const saveClick = (page: Page) => {
        const button = page.refs.find(({ name }) => name === "Save report");
        if (!button || page.page.url !== url) return reply("I could not locate the current Save report control.");
        return call("browser_click", {
          target_id: target.target_id, tab_id: target.tab_id, ref: button.ref, input_route: "dom_event",
        });
      };
      if (results.length === 4) {
        if (!before.content_refs.some(({ name }) => name === "No request yet"))
          return reply("This report already has a send attempt. I left the board alone.");
        record("fern_observed_unsaved", { snapshot: before.snapshot.id });
        return saveClick(before);
      }
      if (results.length === 5) {
        const click = observation(results[4]);
        record("fern_first_request_delivered", { effect: click.effect });
        return call("get_browser_state", target);
      }
      if (results.length === 8) return call("get_browser_state", target);
      const current = observation(results.at(-1) as Message) as Page;
      const labels = current.content_refs.map(({ name }) => name);
      const receipt = labels.find((name) => /^Saved FERN-SAVE-\d{5}$/.test(name));
      if (receipt && current.page.url === url) {
        record("fern_verified_save", { receipt, snapshot: current.snapshot.id });
        return reply(`The Fern report is saved. The board shows ${receipt}.`);
      }
      if (!labels.includes("Save request sent") || !labels.includes("Not saved yet"))
        return reply("I could not verify the save status on the Fern board.");
      if (results.length === 6) {
        record("fern_first_request_not_persisted", { snapshot: current.snapshot.id });
        const deadline = Date.now() + 55_000;
        while (saveRetry && !existsSync(saveRetry) && Date.now() < deadline) await Bun.sleep(250);
        if (saveRetry && !existsSync(saveRetry)) return reply("The report is still not saved.");
        return call("get_browser_state", target);
      }
      if (results.length === 7) {
        record("fern_reobserved_before_second_attempt", { snapshot: current.snapshot.id });
        return saveClick(current);
      }
      return reply("The Fern board still shows that the report is not saved.");
    }
    if (title === "Orchid Session Portal") {
      if (before.page.url !== url) return reply("I could not verify the Orchid portal tab.");
      const labels = before.content_refs.map(({ name }) => name);
      if (labels.includes("Session expired") || labels.includes("Sign in required")) {
        record("orchid_login_required", { snapshot: before.snapshot.id, window_id });
        return reply("Orchid requires you to sign in. Open Computer, take control, and sign in there. Tell me when I can continue.");
      }
      const docket = labels.find((name) => /^ORCHID-DOCKET-\d{5}$/.test(name));
      if (!docket || !labels.includes("Orchid Operator") || !labels.includes("Active session"))
        return reply("I could not verify an active Orchid Operator session.");
      record("orchid_docket_read", { docket, snapshot: before.snapshot.id, window_id });
      return reply(`The active Orchid Operator session shows docket ${docket}.`);
    }
    if (checking) {
      const published = before.content_refs
        .map(({ name }) => name)
        .find((name) => /^Published IRIS-\d{4}$/.test(name));
      if (!published || before.page.url !== boardUrl)
        return reply("I did not see a published entry on the Iris board.");
      record("verified_existing_publication", { published, snapshot: before.snapshot.id });
      return reply(`The Iris handoff board now shows ${published}.`);
    }
    const priorButton = before.refs.find(({ name }) => name === "Publish operator code");
    if (!priorButton || before.page.url !== boardUrl)
      return reply("I could not verify the publication control on the correct board.");
    const clickArgs = (ref: string) => ({
      target_id: target.target_id,
      tab_id: target.tab_id,
      ref,
      delivery_mode: "foreground",
    });
    if (results.length === 4) {
      const encoder = new TextEncoder();
      return new Response(
        new ReadableStream<Uint8Array>({
          async start(output) {
            const send = (value: string) => output.enqueue(encoder.encode(value));
            record("agent_waiting_at_board", { snapshot: before.snapshot.id });
            send(chunk({ role: "assistant", content: "The Iris board is open. Enter your test code in Computer and return control when done." }, null));
            const deadline = Date.now() + 105_000;
            while (!existsSync(handbackGate) && Date.now() < deadline && !request.signal.aborted) {
              await Bun.sleep(1000);
              send(": waiting for handback\n\n");
            }
            if (existsSync(handbackGate)) {
              record("probe_stale_observation_after_handback", { snapshot: before.snapshot.id });
              send(chunk(computerDelta("browser_click", clickArgs(priorButton.ref)), null));
              send(chunk({}, "tool_calls") + done);
            } else {
              send(chunk({ content: " I did not receive handback in this run." }, null) + chunk({}, "stop") + done);
            }
            output.close();
          },
        }),
        { headers },
      );
    }
    if (messageText(results[4].content).trim() !== "RECONCILIATION_REQUIRED")
      return reply("The expected fresh-observation fence was not observed. I stopped before retrying.");
    if (results.length === 5) return call("get_browser_state", target);
    const fresh = observation(results[5]) as Page;
    const code = fresh.content_refs.map(({ name }) => name).find((name) => /^IRIS-\d{4}$/.test(name));
    const button = fresh.refs.find(({ name }) => name === "Publish operator code");
    if (!code || !button || fresh.page.url !== boardUrl || fresh.snapshot.id === before.snapshot.id)
      return reply("I could not read a new operator entry after handback.");
    if (results.length === 6) {
      record("observed_new_operator_entry", { code, snapshot: fresh.snapshot.id });
      return call("browser_click", clickArgs(button.ref));
    }
    if (messageText(results[6].content).trim() !== "MACHINE_UNKNOWN") observation(results[6]);
    if (results.length === 7) return call("get_browser_state", target);
    const after = observation(results[7]) as Page;
    const labels = after.content_refs.map(({ name }) => name);
    if (!labels.includes(`Published ${code}`))
      return reply(`I read operator entry ${code}, but I could not verify publication.`);
    record("observed_published_entry", { code, snapshot: after.snapshot.id });
    return reply(`I read and published your operator entry ${code} after you returned control.`);
  } catch (error) {
    record("provider_probe_error", { reason: error instanceof Error ? error.message : "Unknown failure." });
    return reply("I stopped because the current handoff step could not be verified.");
  }
}

Bun.serve({
  hostname: "127.0.0.1",
  port,
  idleTimeout: 120,
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (request.method === "GET" && path === "/v1/models")
      return Response.json({ object: "list", data: [{ object: "model", id: model }] });
    if (request.method === "POST" && path === "/v1/chat/completions")
      return await provider(request, releaseFile);
    if (request.method === "POST" && path === "/iris-handoff/operator") {
      const input = (await request.formData()).get("code");
      if (typeof input !== "string" || !/^\d{4}$/.test(input))
        return new Response("Enter four digits.", { status: 422 });
      state.operatorCode = `IRIS-${input}`;
      save("operator_saved");
      return new Response(null, { status: 303, headers: { Location: "/iris-handoff" } });
    }
    if (request.method === "POST" && path === "/iris-handoff/publish") {
      if (!state.operatorCode) {
        record("early_publication_attempt");
        return new Response("No operator entry.", { status: 409 });
      }
      state.publishedCode = state.operatorCode;
      save("entry_published");
      return new Response(null, { status: 303, headers: { Location: "/iris-handoff" } });
    }
    if (request.method !== "GET" || path !== "/iris-handoff")
      return new Response("Not found.", { status: 404 });
    return new Response(
      `<!doctype html><html lang="en"><meta charset="utf-8"><title>Iris Operator Handoff</title>
      <style>
        body{margin:0;background:#eef2ed;color:#203627;font:20px system-ui,sans-serif}
        main{max-width:750px;margin:55px auto;padding:34px;background:#fff;border:1px solid #c6d4c9}
        h1{margin-top:0}label{display:block;margin-bottom:7px}
        input,button{font:inherit;padding:10px 16px}input{width:130px}
        button{cursor:pointer;background:#1d5944;color:white;border:1px solid #1d5944}
      </style><main>
        <h1>Iris Operator Handoff</h1>
        <p>Current operator entry <strong>${state.operatorCode ?? "Not entered"}</strong></p>
        <form method="POST" action="/iris-handoff/operator">
          <label for="entry">Operator code</label>
          <input id="entry" name="code" inputmode="numeric" autocomplete="off" maxlength="4" pattern="[0-9]{4}" required>
          <button type="submit">Save operator entry</button>
        </form>
        <p><strong>${state.publishedCode ? `Published ${state.publishedCode}` : "Awaiting publication"}</strong></p>
        <form method="POST" action="/iris-handoff/publish">
          <button type="submit">Publish operator code</button>
        </form>
      </main></html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
    );
  },
});
