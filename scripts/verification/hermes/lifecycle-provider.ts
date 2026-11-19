import { existsSync } from "node:fs";

const model = "conversation-lifecycle";
const gateDirectory = process.env.HERMES_LIFECYCLE_GATE_DIRECTORY;
if (!gateDirectory) throw new Error("Set the lifecycle fixture gate directory.");
const gates = gateDirectory;
const encoder = new TextEncoder();
const headers = { "Content-Type": "text/event-stream", "Cache-Control": "no-store" };
const done = "data: [DONE]\n\n";

type ProviderMessage = { role: string; content?: string | { text?: string }[] };
type ProviderTool = { function: { name: string } };

function messageText(content: ProviderMessage["content"]) {
  return typeof content === "string"
    ? content
    : (content ?? []).map((part) => part.text ?? "").join("\n");
}

function observed(event: string, marker: string, step: string) {
  console.log(JSON.stringify({ event, marker, step, at: new Date().toISOString() }));
}

Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.HERMES_LIFECYCLE_PORT ?? 8451),
  idleTimeout: 120,
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (request.method === "GET" && pathname === "/v1/models")
      return Response.json({ object: "list", data: [{ id: model, object: "model" }] });
    if (request.method !== "POST" || pathname !== "/v1/chat/completions")
      return new Response("Not found.", { status: 404 });

    const { messages = [], tools = [] } = (await request.json()) as {
      messages?: ProviderMessage[];
      tools?: ProviderTool[];
    };
    const inputIndex = messages.findLastIndex(({ role }) => role === "user");
    const input = messageText(messages[inputIndex]?.content);
    const match = /Queue check (first|second) (QUEUE-[A-F0-9]{8})\b/.exec(input);
    const id = `chatcmpl-${crypto.randomUUID()}`;
    const created = Math.floor(Date.now() / 1000);
    const chunk = (delta: object, finish_reason: string | null = null) =>
      `data: ${JSON.stringify({
        id, created, model, object: "chat.completion.chunk",
        choices: [{ index: 0, delta, finish_reason }],
      })}\n\n`;
    const end = chunk({}, "stop") + done;
    const reply = (content: string) =>
      new Response(chunk({ role: "assistant", content }) + end, { headers });
    function heldReply(marker: string, step: string, opening: string, closing: string) {
      const release = `${gates}/${marker}`;
      let consumerClosed = false;
      function recordAbort() {
        if (consumerClosed) return;
        consumerClosed = true;
        observed("provider_aborted", marker, step);
      }
      return new Response(
        new ReadableStream<Uint8Array>({
          async start(body) {
            try {
              body.enqueue(encoder.encode(chunk({ role: "assistant", content: opening })));
              const deadline = Date.now() + 85_000;
              while (!consumerClosed && !existsSync(release) && Date.now() < deadline && !request.signal.aborted) {
                await Bun.sleep(700);
                if (!consumerClosed && !request.signal.aborted)
                  body.enqueue(encoder.encode(": waiting for fixture release\n\n"));
              }
              if (consumerClosed) return;
              if (request.signal.aborted) {
                recordAbort();
                body.close();
                return;
              }
              const released = existsSync(release);
              observed(released ? "provider_finished" : "provider_wait_expired", marker, step);
              body.enqueue(encoder.encode(
                chunk({ content: released ? closing : "The request timed out while waiting for the fixture." }) + end,
              ));
              body.close();
            } catch (error) {
              if (!consumerClosed) body.error(error);
            }
          },
          cancel: recordAbort,
        }),
        { headers },
      );
    }
    function call(suffix: string, args: object) {
      const tool = tools.find(({ function: tool }) => tool.name.endsWith(suffix));
      if (!tool) return reply("The requested fixture tool is unavailable.");
      const delta = {
        role: "assistant",
        tool_calls: [{
          index: 0, id: `call_${crypto.randomUUID()}`, type: "function",
          function: { name: tool.function.name, arguments: JSON.stringify(args) },
        }],
      };
      return new Response(chunk(delta) + chunk({}, "tool_calls") + done, { headers });
    }
    const reconnect = /Reconnect check (REJOIN-[A-F0-9]{8})\b/.exec(input)?.[1];
    if (reconnect) {
      const path = `${reconnect.toLowerCase()}.txt`;
      const results = messages.slice(inputIndex + 1).filter(({ role }) => role === "tool");
      if (!results.length) {
        observed("reconnect_create_requested", reconnect, "create");
        return call("create_file", { command_id: crypto.randomUUID(), path, text: `Reconnect record ${reconnect}\n` });
      }
      try {
        if (results.length === 1) {
          const creation = JSON.parse(messageText(results[0].content));
          if (creation.path !== path) return reply("The reconnect file could not be verified.");
          observed("reconnect_publish_requested", reconnect, "publish");
          return call("publish_artifact", { command_id: crypto.randomUUID(), path, media_type: "text/plain" });
        }
        const receipt = JSON.parse(messageText(results[1].content));
        if (!receipt.id || receipt.name !== path || typeof receipt.reference !== "string")
          return reply("The reconnect file did not return a publication receipt.");
        observed("reconnect_file_ready", reconnect, "stream");
        return heldReply(
          reconnect,
          "stream",
          "I published the reconnect file and am checking the final handoff. ",
          `Reconnect result ${reconnect} is ready. ${receipt.reference}`,
        );
      } catch {
        return reply("The reconnect file receipt could not be read.");
      }
    }
    const checkpoint = /Checkpoint (start|continue) (RECOVER-[A-F0-9]{8})\b/.exec(input);
    const recover = /Recovery check (RECOVER-[A-F0-9]{8})\b/.exec(input)?.[1] ?? checkpoint?.[2];
    if (recover) {
      const fetchTarget = (path: string) => call("machine_exec", {
        command_id: crypto.randomUUID(),
        command: `curl --fail-with-body --silent --show-error --max-time 6 'http://host.docker.internal:8452/recovery/${recover}/${path}'`,
        pty: false,
        timeout_ms: 15_000,
        wait_ms: 10_000,
      });
      try {
        const processes = messages.slice(inputIndex + 1)
          .filter(({ role }) => role === "tool")
          .map((result) => JSON.parse(messageText(result.content)));
        const continuation = checkpoint?.[1] === "continue";
        let verifiedPrimary: number | undefined;
        if (continuation) {
          const previousPrompt = messages.slice(0, inputIndex).findLastIndex(
            ({ role, content }) =>
              role === "user" && messageText(content).includes(`Checkpoint start ${recover}`),
          );
          if (previousPrompt < 0) return reply("I could not locate the earlier checkpoint.");
          for (const result of messages.slice(previousPrompt + 1, inputIndex)) {
            if (result.role !== "tool") continue;
            const receipt = JSON.parse(messageText(result.content));
            if (receipt.exit_code !== 0) continue;
            const row = JSON.parse(receipt.stdout);
            if (row.source === "primary" && Number.isInteger(row.units)) verifiedPrimary = row.units;
          }
          if (verifiedPrimary === undefined)
            return reply("I could not verify the previous primary subtotal.");
          if (!processes.length) {
            observed("checkpoint_recovered_primary", recover, "continue");
            return fetchTarget("detail?view=rows");
          }
        }
        if (!processes.length) return fetchTarget("primary");
        const latest = processes.at(-1);
        if (latest.state === "running")
          return call("machine_process", {
            command_id: crypto.randomUUID(), process_id: latest.id, operation: "read", text: "", wait_ms: 1000,
          });
        const receipts = processes.filter(({ state }) => state === "exited");
        const [first, failure, final] = receipts;
        const primary = JSON.parse(first.stdout);
        if (continuation && verifiedPrimary !== undefined) {
          if (first.exit_code !== 0 || primary.source !== "detail" || !Number.isInteger(primary.units))
            return reply("The detail source is still pending.");
          observed("checkpoint_completed", recover, "continue");
          return reply(
            `The final checkpoint report is complete. Primary ${verifiedPrimary} units. Detail ${primary.units} units. Combined total ${verifiedPrimary + primary.units} units.`,
          );
        }
        if (first.exit_code !== 0 || primary.source !== "primary" || !Number.isInteger(primary.units))
          return reply("I could not verify the primary units.");
        if (checkpoint?.[1] === "start") {
          observed("checkpoint_partial_sent", recover, "partial");
          return heldReply(
            recover,
            "partial",
            `Checkpoint ${recover}. Primary verified at ${primary.units} units. Detail is still pending. I am preparing the next source check, and the full reconciliation will follow after the remaining source has been verified. `,
            "The checkpoint reached its wait deadline. The detail is still pending.",
          );
        }
        if (receipts.length === 1) return fetchTarget("detail?view=compact");
        const guidance = JSON.parse(failure.stdout);
        if (failure.exit_code !== 22 || guidance.available_view !== "rows")
          return reply(`I verified ${primary.units} primary units. The details could not be recovered.`);
        if (receipts.length === 2) return fetchTarget("detail?view=rows");
        const detail = JSON.parse(final.stdout);
        if (final.exit_code !== 0 || detail.source !== "detail" || !Number.isInteger(detail.units))
          return reply(`I verified ${primary.units} primary units. The alternate detail view did not provide a verified total.`);
        return reply(
          `The primary source showed ${primary.units} units. The compact detail view was temporarily unavailable. The row view recovered ${detail.units} detail units. The verified combined total is ${primary.units + detail.units} units.`,
        );
      } catch {
        return reply("The recovery receipt could not be read.");
      }
    }
    if (!match) return reply("Lifecycle fixture connected.");
    const [, step, marker] = match;
    observed("provider_started", marker, step);
    if (step === "second") {
      observed("provider_finished", marker, step);
      const direction = /\b(Additional focus|Replacement focus): ([A-Za-z]{3,24})\b/.exec(input);
      const result = direction
        ? `${direction[1]} applied to ${direction[2]}.`
        : "Second request complete.";
      return reply(`${result} Receipt ${marker}-SECOND.`);
    }
    return heldReply(marker, step, "I started the first request. ", `First request complete. Receipt ${marker}-FIRST.`);
  },
});
