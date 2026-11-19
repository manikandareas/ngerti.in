import { existsSync } from "node:fs";

const models = ["verification-alpha", "verification-beta"];
const gate = process.env.HERMES_PROVIDER_SWITCH_GATE;
const expired = process.env.HERMES_PROVIDER_EXPIRED_GATE;
const fixtureApiKey = process.env.HERMES_PROVIDER_SWITCH_API_KEY ?? "ngertiin-provider-fixture-only";
const reviewSkill = process.env.HERMES_PROVIDER_SWITCH_REVIEW_SKILL ?? "spruce-release-reconciliation";
const reloadGates = process.env.HERMES_MCP_RELOAD_GATES;
const pluginGate = process.env.HERMES_OUTPUT_PLUGIN_GATE;
const surfaceGate = process.env.HERMES_CROSS_SURFACE_GATE;
const encoder = new TextEncoder();
const headers = { "Content-Type": "text/event-stream", "Cache-Control": "no-store" };

Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.HERMES_PROVIDER_SWITCH_PORT ?? 8463),
  idleTimeout: 90,
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (request.headers.get("Authorization") !== `Bearer ${fixtureApiKey}`)
      return Response.json({ error: { message: "Fixture API key rejected" } }, { status: 401 });
    if (request.method === "GET" && path === "/v1/models")
      return Response.json({ object: "list", data: models.map((id) => ({ id, object: "model" })) });
    if (request.method !== "POST" || path !== "/v1/chat/completions")
      return new Response("Not found.", { status: 404 });
    if (expired && existsSync(expired)) {
      console.info(JSON.stringify({ event: "credential_expired", status: 401, at: new Date().toISOString() }));
      return Response.json(
        { error: { message: "The test API key has expired.", type: "invalid_request_error", code: "invalid_api_key" } },
        { status: 401 },
      );
    }
    const { model, messages = [], tools = [] } = (await request.json()) as {
      model: string;
      messages?: { role: string; content: string | { text?: string; type?: string }[] }[];
      tools?: { function: { name: string } }[];
    };
    if (!models.includes(model))
      return Response.json({ error: { message: "Unknown fixture model" } }, { status: 400 });
    const text = (content?: typeof messages[number]["content"]) =>
      typeof content === "string" ? content : (content ?? []).map((part) => part.text).join("\n");
    const userIndex = messages.findLastIndex(({ role }) => role === "user");
    const input = text(messages[userIndex]?.content);
    const step = /Redwood model switch (first|second)\./.exec(input)?.[1];
    const id = `provider-fixture-${crypto.randomUUID()}`;
    const created = Math.floor(Date.now() / 1000);
    const chunk = (delta: object, finish_reason: string | null = null) =>
      `data: ${JSON.stringify({
        id,
        created,
        model,
        object: "chat.completion.chunk",
        choices: [{ index: 0, delta, finish_reason }],
      })}\n\n`;
    const end = (text: string) =>
      chunk({ content: text }) + chunk({}, "stop") + "data: [DONE]\n\n";
    const reply = (text: string) => new Response(chunk({ role: "assistant" }) + end(text), { headers });
    const heldReply = (release: string, success: string, failure: string, first = "") =>
      new Response(new ReadableStream({
        async start(stream) {
          if (first) stream.enqueue(encoder.encode(chunk({ role: "assistant", content: first })));
          const deadline = Date.now() + 300_000;
          try {
            while (!request.signal.aborted && !existsSync(release) && Date.now() < deadline) {
              stream.enqueue(encoder.encode(": waiting\n\n"));
              await Bun.sleep(700);
            }
            if (request.signal.aborted) return;
            stream.enqueue(encoder.encode(existsSync(release) ? success : failure));
            stream.close();
          } catch {
            // The native request may end while the verification hold is active.
          }
        },
      }), { headers });
    const surfaceStage = /Cross-surface proof\. (baseline|reconnect)\./.exec(input)?.[1];
    if (surfaceStage) {
      console.info(JSON.stringify({ event: "cross_surface", stage: surfaceStage, model, at: new Date().toISOString() }));
      if (surfaceStage === "baseline") return reply("Web receipt confirmed. CEDAR-846.");
      if (!surfaceGate) return reply("The reconnect fixture is unavailable.");
      return heldReply(
        surfaceGate,
        end(" Confirmed after reconnect. WREN-327."),
        end(" The reconnect wait expired."),
        "Checking the cross-device receipt.",
      );
    }
    const pluginStage = /Kite plugin proof\. (active|disabled|held|failure)\./.exec(input)?.[1];
    if (pluginStage) {
      const results = {
        active: "WORKFLOW_VERDICT: STAGED ACT-625",
        disabled: "WORKFLOW_VERDICT: STAGED OFF-997",
        held: "WORKFLOW_VERDICT: READY HOLD-308",
        failure: "The release review is complete for FAIL-212.",
      };
      const result = results[pluginStage as keyof typeof results];
      console.info(JSON.stringify({ event: "output_plugin", stage: pluginStage, model, result }));
      if (pluginStage !== "held" || !pluginGate) return reply(result);
      const prefix = "WORKFLOW_VERDICT:";
      console.info(JSON.stringify({ event: "output_plugin_partial", stage: pluginStage, prefix }));
      return heldReply(pluginGate, end(result.slice(prefix.length)), end(" verification timed out"), prefix);
    }
    const call = (suffix: string, args: object) => {
      const name = tools.find(({ function: tool }) => tool.name.endsWith(suffix))?.function.name;
      if (!name) return reply(`Fixture tool unavailable: ${suffix}.`);
      return new Response(chunk({ role: "assistant", tool_calls: [
        { index: 0, id: `call_${crypto.randomUUID()}`, type: "function",
          function: { name, arguments: JSON.stringify(args) } },
      ] }) + chunk({}, "tool_calls") + "data: [DONE]\n\n", { headers });
    };
    const channelStage = /Cedar bridge check\. (attachment|webhook|retry)\./.exec(input)?.[1];
    if (channelStage) {
      const results = messages.slice(userIndex + 1).filter(({ role }) => role === "tool");
      if (!results.length)
        console.info(JSON.stringify({ event: "channel_request", stage: channelStage, model }));
      if (channelStage === "webhook") return reply("Cedar event recorded once. CLAY-238.");
      if (channelStage === "retry") return reply("Cedar reply is ready. SPRUCE-694.");
      const path = "cedar-ticket-46.txt";
      if (!results.length)
        return call("create_file", { command_id: crypto.randomUUID(), path, text: "Cedar ticket 46\nInspection code: FIR-602\n" });
      if (results.length === 1)
        return call("publish_artifact", { command_id: crypto.randomUUID(), path, media_type: "text/plain" });
      return text(results[1].content).includes(path)
        ? reply("Cedar ticket 46 is complete. Your inspection code is FIR-602.")
        : reply("Cedar ticket 46 could not publish the receipt.");
    }
    if (input.includes("Media vision check. alternate.")) {
      const current = messages[userIndex]?.content;
      const imageParts = Array.isArray(current) ? current.filter((part) => part.type === "image_url").length : 0;
      const observations = messages.slice(userIndex + 1).filter((message) => message.role === "tool");
      const artifact = /"id":"([a-f\d-]{36})","name":"bay-card-2\.png"/.exec(input)?.[1];
      if (!observations.length) {
        console.info(JSON.stringify({ event: "alternate_vision", imageParts, artifact }));
        if (imageParts || !artifact) return reply("The expected authorized image input was not available.");
        return call("process_media", { operation: "inspect_image", artifact_id: artifact, prompt: "Read the printed inspection code.", command_id: crypto.randomUUID() });
      }
      const code = text(observations[0]?.content).match(/[A-Z]{5}-\d{3}/)?.[0];
      return code ? reply(`The inspection code is ${code}. I read it using Cedar Media.`) : reply("The alternate media backend could not read the card.");
    }
    const audioStage = /Media audio check\. (transcribe|speak)\./.exec(input)?.[1];
    if (audioStage) {
      const observations = messages.slice(userIndex + 1).filter((message) => message.role === "tool");
      if (audioStage === "transcribe") {
        const artifact = /"id":"([a-f\d-]{36})","name":"office-gate\.wav"/.exec(input)?.[1];
        if (!artifact) return reply("I could not find the attached audio.");
        if (!observations.length)
          return call("process_media", { operation: "transcribe_audio", artifact_id: artifact, prompt: "Transcribe the spoken sentence.", command_id: crypto.randomUUID() });
        const transcript = text(observations[0].content).match(/The office gate opens at [^"\n\\]+\./i)?.[0];
        return transcript ? reply(`Transcription: ${transcript}`) : reply("I could not transcribe the sample.");
      }
      if (!messages.slice(0, userIndex).some((message) => message.role === "assistant" && /gate opens at 7[.:]30/.test(text(message.content))))
        return reply("I could not find the previous audio transcript.");
      if (observations.length < 2) {
        const command_id = crypto.randomUUID();
        console.info(JSON.stringify({ event: "speak_request", attempt: observations.length + 1, command_id }));
        return call("process_media", { operation: "speak", prompt: "The office gate opens at seven thirty.", command_id });
      }
      const references = observations.map((entry) => text(entry.content).match(/\[voice-reply\.wav\]\(ngertiin:\/\/file\/[a-f\d-]{36}\)/)?.[0]);
      return references[0] && references[0] === references[1]
        ? reply(`The office gate opens at 7:30. ${references[0]}`)
        : reply("I could not verify the voice reply file.");
    }
    const videoStage = /Media video check\. (inspect|bad-input|broken-output|generate)\./.exec(input)?.[1];
    if (videoStage) {
      const observation = messages.slice(userIndex + 1).find((message) => message.role === "tool");
      if (observation) {
        const result = text(observation.content);
        if (result.includes("INVALID_REQUEST")) return reply("The uploaded clip is not a valid MP4.");
        if (result.includes("MEDIA_BACKEND_FAILED"))
          return reply("Cedar Media did not return a valid video. No file was published.");
        const finding = /The screen (?:changes|stays) [a-z ]+\./.exec(result)?.[0];
        if (finding) return reply(finding);
        const reference = /\[generated-video\.mp4\]\(ngertiin:\/\/file\/[a-f\d-]{36}\)/.exec(result)?.[0];
        return reference ? reply(`The green and purple slate is ready. ${reference}`) : reply("I could not verify the video result.");
      }
      const inspect = videoStage === "inspect" || videoStage === "bad-input";
      const clip = inspect ? (videoStage === "inspect" ? "signal-shift" : "truncated-shift") : null;
      const artifact_id = clip ? new RegExp(`"id":"([a-f\\d-]{36})","name":"${clip}\\.mp4"`).exec(input)?.[1] : undefined;
      if (inspect && (!artifact_id || !input.includes(`artifact ${artifact_id}, use ngertiin.process_media with operation inspect_video`)))
        return reply("The authorized video input was not available.");
      if (inspect) {
        const content = messages[userIndex]?.content;
        const nativeMediaParts = Array.isArray(content) ? content.filter((part) => part.type !== "text").length : 0;
        if (nativeMediaParts) return reply("Unexpected native media input.");
        console.info(JSON.stringify({ event: "video_analysis", stage: videoStage, artifact_id, nativeMediaParts }));
      }
      return call("process_media", {
        operation: inspect ? "inspect_video" : "generate_video",
        ...(inspect && { artifact_id }),
        prompt: input.split(`Media video check. ${videoStage}.`).at(-1)?.trim(),
        command_id: crypto.randomUUID(),
      });
    }
    const imageStage = /Media image check\. (generate|edit)\./.exec(input)?.[1];
    if (imageStage) {
      const observation = messages.slice(userIndex + 1).find((message) => message.role === "tool");
      if (observation) {
        const reference = text(observation.content).match(/\[(generated|revised)-image\.png\]\(ngertiin:\/\/file\/[a-f\d-]{36}\)/)?.[0];
        if (!reference) return reply("I could not verify the image file.");
        return reply(`${imageStage === "generate" ? "Orange circle on dark green." : "Changed the circle to blue and kept the dark green background."} ${reference}`);
      }
      const source = messages.slice(0, userIndex).reverse().find((message) =>
        message.role === "assistant" && text(message.content).includes("[generated-image.png]"),
      );
      const artifact_id = /\[generated-image\.png\]\(ngertiin:\/\/file\/([a-f\d-]{36})\)/.exec(text(source?.content))?.[1];
      if (imageStage === "edit" && !artifact_id) return reply("I could not find the original image.");
      return call("process_media", {
        operation: imageStage === "generate" ? "generate_image" : "edit_image",
        ...(imageStage === "edit" && { artifact_id }),
        prompt: input.split(`Media image check. ${imageStage}.`).at(-1)?.trim(),
        command_id: crypto.randomUUID(),
      });
    }
    if (input.includes("MCP reload proof.")) {
      const stage = /MCP reload proof\. (stale|updated|revoke)\./.exec(input)?.[1];
      const results = messages.slice(userIndex + 1).filter(({ role }) => role === "tool");
      if (!results.length) return call("list_apps", {});
      const listing = JSON.parse(text(results[0].content)) as { connections: { id: string; toolkit: string }[] };
      const connection = listing.connections.find((item) => item.toolkit === "mcp_kite");
      if (!connection) return reply("The inventory connector is unavailable.");
      if (results.length === 1)
        return call("search_app_tools", { connection_id: connection.id, query: "lookup" });
      const catalog = JSON.parse(text(results[1].content)) as {
        slug: string; input_schema?: { properties?: Record<string, { const?: string }> };
      }[];
      const slug = stage === "stale" ? "MCP_LOOKUP_KITE_ITEM" : "MCP_LOOKUP_RAVEN_ITEM";
      const choice = catalog.find((item) => item.slug === slug);
      const item = choice?.input_schema?.properties?.item_id?.const;
      if (!choice || !item) return reply("The expected inventory schema could not be loaded.");
      if (results.length === 2) {
        const action = call("execute_app_tool", {
          connection_id: connection.id, tool: choice.slug,
          arguments: { item_id: item }, command_id: crypto.randomUUID(),
        });
        if (stage === "updated" || !reloadGates) return action;
        const release = `${reloadGates}/release-${stage}`;
        const payload = await action.text();
        console.info(JSON.stringify({ event: "waiting", stage, slug, item, at: new Date().toISOString() }));
        return heldReply(release, payload, end("The test wait expired."));
      }
      const outcome = text(results[2].content);
      if (stage === "stale" && outcome.includes("SCOPE_DENIED"))
        return reply("The previous Kite lookup is no longer available. No lookup was sent.");
      if (stage === "revoke" && outcome.includes("SCOPE_DENIED"))
        return reply("The connector was disconnected before the lookup. No lookup was sent.");
      if (stage === "updated" && /RAVEN-309/.test(outcome) && /cobalt-19/.test(outcome))
        return reply("Verified RAVEN-309 with the updated schema. The carrier signal is cobalt-19.");
      return reply("The connector reload fixture did not reach its expected result.");
    }
    if (input.includes("Kite MCP spending check.")) {
      const stage = /Kite MCP spending check\. (read-only|approved|after-limit)\./.exec(input)?.[1];
      const results = messages.slice(userIndex + 1).filter(({ role }) => role === "tool");
      if (!results.length) return call("list_apps", {});
      const listing = JSON.parse(text(results[0].content)) as { connections: { id: string; toolkit: string }[] };
      const connection = listing.connections.find((item) => item.toolkit === "mcp_kite");
      if (!connection) return reply("The Kite connector is not assigned to this conversation.");
      if (results.length === 1)
        return call("search_app_tools", { connection_id: connection.id, query: "Kite laboratory" });
      const catalog = JSON.parse(text(results[1].content)) as {
        slug: string; action_policy?: { mutability: string; units: number };
      }[];
      const read = catalog.find((t) => t.slug === "MCP_LOOKUP_KITE_ITEM");
      const write = catalog.find((t) => t.slug === "MCP_SET_KITE_STATUS");
      const execute = (tool: string, args: object) => call("execute_app_tool", {
        connection_id: connection.id, tool, arguments: args, command_id: crypto.randomUUID(),
      });
      if (stage === "read-only" && read?.action_policy?.mutability === "read_only" && !write) {
        if (results.length === 2) return execute(read.slug, { item_id: "KITE-624" });
        if (results.length === 3)
          return execute("MCP_SET_KITE_STATUS", { item_id: "KITE-624", status: "checker-accepted" });
        if (text(results[2].content).includes("amber-27") && text(results[3].content).includes("SCOPE_DENIED"))
          return reply("Kite lookup returned amber-27. This conversation cannot write to the connector.");
      }
      if ((stage === "approved" || stage === "after-limit") && write?.action_policy?.units === 2) {
        if (results.length === 2)
          return execute(write.slug, { item_id: "KITE-624", status: stage === "approved" ? "checker-accepted" : "checker-second" });
        const outcome = text(results[2].content);
        if (stage === "approved" && outcome.includes("checker-accepted"))
          return reply("Kite verification status changed to checker-accepted.");
        if (stage === "after-limit" && outcome.includes("APP_BUDGET_EXCEEDED"))
          return reply("The Kite action budget is exhausted. The second write was blocked.");
      }
      return reply("The Kite permission or budget fixture could not verify the expected outcome.");
    }
    if (input.includes("Kite MCP inventory check.")) {
      const results = messages.slice(userIndex + 1).filter(({ role }) => role === "tool");
      if (!results.length) return call("list_apps", {});
      const listing = JSON.parse(text(results[0].content)) as { connections: { id: string; toolkit: string }[] };
      const connection = listing.connections.find((item) => item.toolkit === "mcp_kite");
      if (!connection) return reply("The Kite connector is not assigned to this conversation.");
      if (results.length === 1)
        return call("search_app_tools", { connection_id: connection.id, query: "lookup" });
      const catalog = JSON.parse(text(results[1].content)) as {
        slug: string; input_schema?: { required?: string[]; properties?: Record<string, { const?: string }> };
      }[];
      const candidate = catalog.find((t) => t.slug === "MCP_LOOKUP_KITE_ITEM");
      const item = candidate?.input_schema?.properties?.item_id?.const;
      if (!candidate || !item || !candidate.input_schema?.required?.includes("item_id"))
        return reply("The current Kite lookup schema is unavailable.");
      if (results.length === 2)
        return call("execute_app_tool", {
          connection_id: connection.id, tool: candidate.slug,
          arguments: { item_id: item }, command_id: crypto.randomUUID(),
        });
      const outcome = JSON.parse(text(results[2].content)) as {
        receipt?: { result?: { structuredContent?: { value?: string } }; state?: string };
      };
      const value = outcome.receipt?.result?.structuredContent?.value;
      return reply(value ? `Verified ${item}: ${value}.` : "Kite could not complete the lookup.");
    }
    if (input.includes("Alder restored-profile check.") ||
      input.includes("Report the synthetic Alder release briefing in this conversation.")) {
      const results = messages.slice(userIndex + 1).filter(({ role }) => role === "tool");
      console.info(JSON.stringify({ event: "alder", model, step: results.length, at: new Date().toISOString() }));
      if (!results.length) return call("list_skills", {});
      const inventory = JSON.parse(text(results[0].content)) as {
        application: { name: string; id: string; assignment: { version: number; enabled: boolean } }[];
      };
      const skill = inventory.application.find(({ name }) => name === "alder-release-checklist");
      if (!skill?.assignment.enabled) return reply("The Alder release checklist is unavailable.");
      if (results.length === 1)
        return call("read_skill", { skill_id: skill.id, version: skill.assignment.version, asset_path: "references/current-release.txt" });
      const code = /Approved release code: (ALD-[0-9]+-[A-Z]+)/.exec(text(results[1].content))?.[1];
      if (!code || !messages.some((entry) => entry.role === "system" && text(entry.content).includes("ALDER OPERATIONS")))
        return reply("The restored profile could not verify its greeting and release reference.");
      return reply(`ALDER OPERATIONS\n\nVerified ${code} from references/current-release.txt.`);
    }
    if (input.includes("Auxiliary Spruce release summary.")) {
      const review = input.startsWith("Review the completed work as evidence.");
      console.info(JSON.stringify({ event: review ? "review" : "foreground", model, at: new Date().toISOString() }));
      if (review) {
        const usage = { prompt_tokens: 97, completion_tokens: 21, total_tokens: 118 };
        const result = { memory: null, skill: {
          name: reviewSkill,
          description: "Use when assembling a release total from a gate ledger.",
          instructions: "Read the complete ledger and sum the distinct gate counts. Verify that all gate labels are present once before publishing the total.",
        } };
        const trailer = `data: ${JSON.stringify({
          id, created, model, object: "chat.completion.chunk", choices: [], usage,
        })}\n\n`;
        return new Response(
          chunk({ role: "assistant", content: JSON.stringify(result) }) +
          chunk({}, "stop") + trailer + "data: [DONE]\n\n",
          { headers },
        );
      }
      const artifactId = /"id":"([a-f\d-]{36})","name":"spruce-gate-ledger\.txt"/.exec(input)?.[1];
      if (!artifactId) return reply("Fixture cannot find the attached ledger.");
      const results = messages.slice(userIndex + 1).filter(({ role }) => role === "tool");
      if (!results.length)
        return call("read_attachment", { artifact_id: artifactId, start_page: 1, offset: 0, max_chars: 2000 });
      const counts = [...text(results[0].content).matchAll(/Gate [A-Z] = (\d+)/g)];
      if (counts.length !== 3) return reply("Fixture could not verify all three gates.");
      const total = counts.reduce((sum, count) => sum + Number(count[1]), 0);
      const path = "spruce-release-total.txt";
      if (results.length === 1)
        return call("create_file", { command_id: crypto.randomUUID(), path, text: `Spruce verified total: ${total}\n` });
      if (results.length === 2)
        return call("publish_artifact", { command_id: crypto.randomUUID(), path, media_type: "text/plain" });
      return reply(`Spruce verified total: ${total} across three gates.`);
    }
    const report = (event: string) => {
      if (step) console.info(JSON.stringify({ event, step, model, at: new Date().toISOString() }));
    };
    report("requested");
    if (step !== "first" || !gate) {
      report("finished");
      return new Response(
        chunk({ role: "assistant", content: "" }) + end(
          step === "second" ? `The second Redwood run used ${model}.` : `Ready on ${model}.`,
        ),
        { headers },
      );
    }
    let closed = false;
    return new Response(new ReadableStream({
      async start(stream) {
        stream.enqueue(encoder.encode(chunk({
          role: "assistant",
          content: `The first Redwood run has started on ${model}. Waiting for the test release. `,
        })));
        const until = Date.now() + 80_000;
        while (!closed && !request.signal.aborted && !existsSync(gate) && Date.now() < until) {
          await Bun.sleep(500);
          if (!closed && !request.signal.aborted) stream.enqueue(encoder.encode(": waiting\n\n"));
        }
        if (closed) return;
        if (!request.signal.aborted && existsSync(gate)) {
          report("finished");
          stream.enqueue(encoder.encode(end(`The first Redwood run completed on ${model}.`)));
        } else report("interrupted");
        stream.close();
      },
      cancel() {
        closed = true;
        report("interrupted");
      },
    }), { headers });
  },
});
