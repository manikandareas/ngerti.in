const model = "schedule-recovery";
const gate = process.env.HERMES_SCHEDULE_RECOVERY_GATE;
const dependencyGate = process.env.HERMES_SCHEDULE_DEPENDENCY_GATE;
const heartbeatGate = process.env.HERMES_HEARTBEAT_GATE;
const loopGate = process.env.HERMES_LOOP_GATE;
const marshSource = process.env.HERMES_LOOP_MARSH_SOURCE;
const revokeGate = process.env.HERMES_CATALOG_REVOKE_GATE;
if (!gate) throw new Error("Set the schedule fixture gate path.");
let wrenChecks = 0;
let ibisChecks = 0;
let glasswingChecks = 0;
let brambleChecks = 0;
let marshCheck = { number: 0, observedText: "" };

type Message = { role: string; content?: string | { type: string; text?: string }[] };
type Tool = { function: { name: string } };

function messageText(content: Message["content"]) {
  return typeof content === "string"
    ? content
    : (content ?? []).map((part) => part.text ?? "").join("\n");
}

function namedValue(content: string, key: string) {
  return content.replaceAll('\\\"', '"').match(new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`))?.[1];
}

Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.HERMES_SCHEDULE_RECOVERY_PORT ?? 8427),
  async fetch(request, server) {
    const { pathname } = new URL(request.url);
    if (request.method === "GET" && pathname === "/v1/models")
      return Response.json({ object: "list", data: [{ id: model, object: "model" }] });
    if (request.method !== "POST" || pathname !== "/v1/chat/completions")
      return new Response("Not found", { status: 404 });

    const { messages = [], tools = [] } = (await request.json()) as {
      messages?: Message[];
      tools?: Tool[];
    };
    const id = `chatcmpl-${crypto.randomUUID()}`;
    const headers = { "Content-Type": "text/event-stream", "Cache-Control": "no-store" };
    const chunk = (delta: object, finish_reason: string | null) =>
      `data: ${JSON.stringify({ id, model, created: Math.floor(Date.now() / 1000), object: "chat.completion.chunk", choices: [{ index: 0, delta, finish_reason }] })}\n\n`;
    const stream = (delta: object, finish: string) =>
      new Response(
        chunk({ role: "assistant", ...delta }, null) + chunk({}, finish) + "data: [DONE]\n\n",
        { headers },
      );
    const reply = (content: string) => stream({ content }, "stop");
    const observed = (event: string) =>
      console.log(JSON.stringify({ event, at: new Date().toISOString() }));
    const heldReply = (
      path: string,
      initial: string,
      result: string,
      started: string,
      released: string,
    ) => {
      const encoder = new TextEncoder();
      return new Response(
        new ReadableStream<Uint8Array>({
          async start(output) {
            try {
              observed(started);
              output.enqueue(encoder.encode(chunk({ role: "assistant", content: initial }, null)));
              const deadline = Date.now() + 105_000;
              while (
                Date.now() < deadline &&
                !request.signal.aborted &&
                (await Bun.file(path).text()).trim() === "hold"
              ) {
                await Bun.sleep(1200);
                output.enqueue(encoder.encode(": working\n\n"));
              }
              observed(released);
              output.enqueue(
                encoder.encode(
                  chunk({ content: result }, null) + chunk({}, "stop") + "data: [DONE]\n\n",
                ),
              );
              output.close();
            } catch (error) {
              output.error(error);
            }
          },
        }),
        { headers },
      );
    };
    const inputIndex = messages.findLastIndex(({ role }) => role === "user");
    const input = messageText(messages[inputIndex]?.content);
    if (!tools.length) {
      if (input.includes("<conversation>") && input.includes("context checkpoint summary")) {
        const reference = input.match(/TERN_REFERENCE=(TERN-[A-Z]+-\d+)/)?.[1];
        if (reference) {
          console.log(
            JSON.stringify({
              event: "tern_native_compaction",
              reference,
              at: new Date().toISOString(),
            }),
          );
          return reply(
            `## Goal\nRetain the user's synthetic Tern reference across turns.\n\n## Critical Context\nTERN_NATIVE_CHECKPOINT=${reference}`,
          );
        }
      }
      return reply("Schedule verification provider connected.");
    }
    const toolDelta = (suffix: string, args: object) => {
      const name = tools.find(({ function: tool }) => tool.name.endsWith(suffix))?.function.name;
      if (!name) return null;
      return {
        tool_calls: [
          {
            index: 0,
            id: `call_${crypto.randomUUID()}`,
            type: "function",
            function: { name, arguments: JSON.stringify(args) },
          },
        ],
      };
    };
    const call = (suffix: string, args: object) => {
      const delta = toolDelta(suffix, args);
      if (delta) return stream(delta, "tool_calls");
      console.log(JSON.stringify({ event: "fixture_tool_missing", suffix }));
      return reply("Fixture tool unavailable.");
    };

    const results = messages.slice(inputIndex + 1).filter(({ role }) => role === "tool");
    const observations = results.map(({ content }) => messageText(content).replaceAll('\\\"', '"'));
    const command_id = crypto.randomUUID();
    const marker = Array.from(
      input.matchAll(
        /GULL_PUBLISH_(BASELINE|UPDATE)\s+(\d+)|GULL_SETUP_WATCH|GULL_SOURCE_TICK|COVE_SETUP_SOURCE|COVE_SETUP_REPORT|COVE_SOURCE_TICK|COVE_REPORT_TICK|LARK_SETUP_HEARTBEAT|LARK_BUSY_PROMPT|LARK_SECOND_PROMPT|LARK_HEARTBEAT_TICK|TERN_CONTEXT_SEED|TERN_CONTEXT_PAD|TERN_SETUP_HEARTBEAT|TERN_HEARTBEAT_TICK|WREN_START_LOOP|WREN_LOOP_CHECK|IBIS_START_LOOP|IBIS_LOOP_CHECK|GLASSWING_START_LOOP|GLASSWING_LOOP_CHECK|BRAMBLE_START_LOOP|BRAMBLE_LOOP_CHECK|MARSH_START_LOOP|MARSH_LOOP_CHECK|HARBOR_CATALOG|HARBOR_REVOKE/g,
      ),
    ).at(-1);
    if (marker?.[0] === "HARBOR_REVOKE" && revokeGate) {
      if (!observations.length) return call("list_apps", {});
      const connection_id = namedValue(observations[0], "id");
      if (!connection_id) return reply("Harbor Docs requires access in this conversation.");
      if (observations.length === 1)
        return call("search_app_tools", { connection_id, query: "update the Harbor signal" });
      if (observations.length === 2) {
        if (
          !observations[1].includes("HARBOR_UPDATE_SIGNAL") ||
          !observations[1].includes("signal")
        )
          return reply("Harbor Docs did not supply the update action.");
        server.timeout(request, 0);
        observed("harbor_update_discovered");
        for (let attempt = 0; attempt < 900 && !request.signal.aborted; attempt++) {
          if ((await Bun.file(revokeGate).text()).trim() === "release") {
            observed("harbor_update_attempt_released");
            return call("execute_app_tool", {
              command_id,
              connection_id,
              tool: "HARBOR_UPDATE_SIGNAL",
              arguments: { signal: "HARBOR-UPDATED-921" },
            });
          }
          await Bun.sleep(100);
        }
        observed("harbor_gate_expired");
        return reply("The verification gate expired before the update was attempted.");
      }
      const denied = /SCOPE_DENIED|APP_AUTH_REQUIRED|STALE_DISPATCH/.test(observations[2]);
      observed(denied ? "harbor_update_refused" : "harbor_update_not_refused");
      return reply(
        denied
          ? "Harbor Docs access was removed before the update. The signal kept its previous value."
          : "The Harbor update returned an unexpected result.",
      );
    }
    if (marker?.[0] === "HARBOR_CATALOG") {
      const hasTool = (suffix: string) =>
        tools.some(({ function: tool }) => tool.name.endsWith(suffix));
      const search = hasTool("search_app_tools");
      const execute = hasTool("execute_app_tool");
      if (!observations.length) {
        console.log(
          JSON.stringify({
            event: "harbor_catalog",
            workspace: hasTool("get_workspace"),
            search,
            execute,
            count: tools.length,
            at: new Date().toISOString(),
          }),
        );
        return call("get_workspace", {});
      }
      if (observations.length === 1)
        return call("describe_tools", {
          names: ["ngertiin.read_file", "ngertiin.search_app_tools"],
        });
      if (observations.length === 2) return call("list_apps", {});
      const connection_id = namedValue(observations[2], "id");
      const workspace = namedValue(observations[0], "name") ?? "the current workspace";
      const described = observations[1].includes("ngertiin.search_app_tools");
      if (!search && !execute && !connection_id && observations[1].includes("INVALID_REQUEST"))
        return reply(`I can use ${workspace}. Harbor Docs requires access in this conversation.`);
      if (!search || !execute || !described || !connection_id)
        return reply("The fixture received inconsistent Harbor capabilities.");
      if (observations.length === 3)
        return call("search_app_tools", { connection_id, query: "read the Harbor signal" });
      const canRead = observations[3].includes("HARBOR_READ_SIGNAL");
      const canUpdate = observations[3].includes("HARBOR_UPDATE_SIGNAL");
      if (observations.length === 4) {
        console.log(
          JSON.stringify({
            event: "harbor_search",
            canRead,
            canUpdate,
            at: new Date().toISOString(),
          }),
        );
        if (!canRead || canUpdate)
          return reply("The Harbor action list exceeds its expected grant.");
        return call("execute_app_tool", {
          command_id,
          connection_id,
          tool: "HARBOR_READ_SIGNAL",
          arguments: {},
        });
      }
      const signal = namedValue(observations[4], "signal");
      return reply(
        signal
          ? `Harbor Docs returned ${signal}. I checked from ${workspace}.`
          : "The Harbor read returned no signal.",
      );
    }
    if (marker?.[0] === "WREN_START_LOOP") {
      if (observations.some((item) => namedValue(item, "kind") === "routine"))
        return reply("Wren session loop is ready.");
      if (observations.length) return reply("Fixture could not record the Wren loop.");
      return call("write_routine", {
        command_id,
        routine_id: crypto.randomUUID(),
        expected_revision: 0,
        goal_id: null,
        execution_target: null,
        name: "Wren session loop",
        instruction:
          "WREN_LOOP_CHECK. Run the synthetic same-session check and report its check number.",
        schedule: { type: "loop", every_ms: 12_000 },
        timezone: "Asia/Makassar",
      });
    }
    if (marker?.[0] === "WREN_LOOP_CHECK") {
      wrenChecks++;
      if (wrenChecks === 1 && loopGate)
        return heldReply(loopGate, "WREN-CHECK=", "1", "wren_first_started", "wren_first_released");
      observed("wren_later_check_started");
      return reply(`WREN-CHECK=${wrenChecks}`);
    }
    if (marker?.[0] === "IBIS_START_LOOP") {
      if (observations.some((item) => namedValue(item, "kind") === "routine"))
        return reply("Ibis adaptive loop is ready.");
      if (observations.length) return reply("Fixture could not record the Ibis loop.");
      return call("write_routine", {
        command_id,
        routine_id: crypto.randomUUID(),
        expected_revision: 0,
        goal_id: null,
        execution_target: null,
        name: "Ibis adaptive loop",
        instruction: "IBIS_LOOP_CHECK. Read and report the synthetic Ibis sensor state.",
        schedule: { type: "loop", every_ms: 15_000, self_paced: { max_every_ms: 50_000 } },
        timezone: "Asia/Makassar",
      });
    }
    if (marker?.[0] === "IBIS_LOOP_CHECK") {
      ibisChecks++;
      const result = ibisChecks <= 3 ? "IBIS-STATE=STABLE" : "IBIS-STATE=CHANGED";
      console.log(
        JSON.stringify({
          event: "ibis_check",
          check: ibisChecks,
          result,
          at: new Date().toISOString(),
        }),
      );
      return reply(result);
    }
    if (marker?.[0] === "GLASSWING_START_LOOP" || marker?.[0] === "BRAMBLE_START_LOOP") {
      const condition = marker[0] === "GLASSWING_START_LOOP";
      const name = condition ? "Glasswing readiness loop" : "Bramble three-check loop";
      if (observations.some((item) => namedValue(item, "kind") === "routine"))
        return reply(`${name} is ready.`);
      if (observations.length) return reply(`Fixture could not record ${name}.`);
      return call("write_routine", {
        command_id,
        routine_id: crypto.randomUUID(),
        expected_revision: 0,
        goal_id: null,
        execution_target: null,
        name,
        instruction: condition
          ? "GLASSWING_LOOP_CHECK. Check the synthetic sensor and publish glasswing-state.txt when ready."
          : "BRAMBLE_LOOP_CHECK. Check the synthetic Bramble service and report the check number.",
        schedule: condition
          ? {
              type: "loop",
              every_ms: 15_000,
              until: { artifact_name: "glasswing-state.txt", exact_text: "GLASSWING=READY" },
            }
          : { type: "loop", every_ms: 35_000, max_runs: 3 },
        timezone: "Asia/Makassar",
      });
    }
    if (marker?.[0] === "GLASSWING_LOOP_CHECK") {
      const path = "glasswing-state.txt";
      if (!observations.length) {
        glasswingChecks++;
        observed(`glasswing_check_${glasswingChecks}`);
        if (glasswingChecks === 1) return reply("Glasswing sensor is warming up.");
        return call("create_file", { command_id, path, text: "GLASSWING=READY\n" });
      }
      if (observations.length === 1)
        return call("publish_artifact", { command_id, path, media_type: "text/plain" });
      if (observations.some((item) => namedValue(item, "kind") === "artifact"))
        return reply("Glasswing sensor is ready. I published glasswing-state.txt.");
      return reply("Fixture could not publish the Glasswing sensor state.");
    }
    if (marker?.[0] === "BRAMBLE_LOOP_CHECK") {
      brambleChecks++;
      observed(`bramble_check_${brambleChecks}`);
      if (brambleChecks === 2)
        return Response.json(
          { error: { type: "invalid_request_error", message: "Synthetic Bramble interruption." } },
          { status: 400 },
        );
      return reply(`BRAMBLE-CHECK=${brambleChecks}`);
    }
    if (marker?.[0] === "MARSH_START_LOOP") {
      if (observations.some((item) => namedValue(item, "kind") === "routine"))
        return reply("Marsh seal loop is ready.");
      if (observations.length) return reply("Fixture could not record the Marsh loop.");
      return call("write_routine", {
        command_id,
        routine_id: crypto.randomUUID(),
        expected_revision: 0,
        goal_id: null,
        execution_target: null,
        name: "Marsh seal loop",
        instruction:
          "MARSH_LOOP_CHECK. Check the synthetic seal source and publish marsh-seal.txt with the exact reading.",
        schedule: {
          type: "loop",
          every_ms: 35_000,
          max_runs: 4,
          until: { artifact_name: "marsh-seal.txt", exact_text: "MARSH=SEALED" },
        },
        timezone: "Asia/Makassar",
      });
    }
    if (marker?.[0] === "MARSH_LOOP_CHECK" && marshSource) {
      const path = "marsh-seal.txt";
      if (!observations.length) {
        marshCheck = {
          number: marshCheck.number + 1,
          observedText: await Bun.file(marshSource).text(),
        };
        console.log(
          JSON.stringify({
            event: "marsh_check",
            number: marshCheck.number,
            result: marshCheck.observedText.trim(),
            at: new Date().toISOString(),
          }),
        );
        if (marshCheck.number === 1)
          return call("create_file", { command_id, path, text: marshCheck.observedText });
        return call("read_file", { path });
      }
      if (marshCheck.number > 1 && observations.length === 1) {
        const expected_sha256 = namedValue(observations[0], "sha256");
        if (!expected_sha256) return reply("Fixture could not read the previous Marsh result.");
        return call("write_file", {
          command_id,
          path,
          text: marshCheck.observedText,
          expected_sha256,
        });
      }
      if (observations.length === (marshCheck.number === 1 ? 1 : 2))
        return call("publish_artifact", { command_id, path, media_type: "text/plain" });
      if (observations.some((item) => namedValue(item, "kind") === "artifact"))
        return reply(
          marshCheck.number === 1
            ? "The Marsh seal is confirmed complete."
            : "I published the actual sealed state.",
        );
      return reply("Fixture could not publish the Marsh reading.");
    }
    if (marker?.[0] === "TERN_CONTEXT_SEED")
      return reply("The Tern session reference is recorded.");
    if (marker?.[0] === "TERN_CONTEXT_PAD")
      return reply("The synthetic Tern session data is recorded.");
    if (marker?.[0] === "TERN_SETUP_HEARTBEAT") {
      if (observations.some((item) => namedValue(item, "kind") === "routine"))
        return reply("Tern recovery heartbeat is scheduled.");
      const anchor_at = input
        .slice(marker.index)
        .match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/)?.[0];
      if (!anchor_at || observations.length)
        return reply("Fixture could not record Tern heartbeat.");
      return call("write_routine", {
        command_id,
        routine_id: crypto.randomUUID(),
        expected_revision: 0,
        goal_id: null,
        execution_target: null,
        name: "Tern recovery heartbeat",
        instruction: "TERN_HEARTBEAT_TICK. Report the Tern reference from this session.",
        schedule: { type: "heartbeat", anchor_at, every_ms: 120_000 },
        timezone: "Asia/Makassar",
      });
    }
    if (marker?.[0] === "TERN_HEARTBEAT_TICK") {
      const checkpoint = messages
        .map(({ content }) => messageText(content))
        .find((text) =>
          text.startsWith(
            "The conversation history before this point was compacted into the following summary:",
          ),
        );
      const reference = checkpoint?.match(/TERN_NATIVE_CHECKPOINT=(TERN-[A-Z]+-\d+)/)?.[1];
      console.log(
        JSON.stringify({
          event: "tern_heartbeat_dispatched",
          used_native_compaction_context: !!reference,
          reference: reference ?? null,
          at: new Date().toISOString(),
        }),
      );
      return reply(
        reference ? `Tern recovered session · ${reference}` : "Tern session reference unavailable.",
      );
    }
    if (marker?.[0] === "LARK_SETUP_HEARTBEAT") {
      if (observations.some((item) => namedValue(item, "kind") === "routine"))
        return reply("Lark heartbeat is scheduled.");
      const anchor_at = input
        .slice(marker.index)
        .match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/)?.[0];
      if (!anchor_at || observations.length)
        return reply("Fixture could not record Lark heartbeat.");
      return call("write_routine", {
        command_id,
        routine_id: crypto.randomUUID(),
        expected_revision: 0,
        goal_id: null,
        execution_target: null,
        name: "Lark heartbeat",
        instruction: "LARK_HEARTBEAT_TICK. Post LARK-CHECK-COMPLETE in this conversation.",
        schedule: { type: "heartbeat", anchor_at, every_ms: 20_000 },
        timezone: "Asia/Makassar",
      });
    }
    if (marker?.[0] === "LARK_BUSY_PROMPT") {
      if (!heartbeatGate) return reply("The heartbeat fixture gate is unavailable.");
      return heldReply(
        heartbeatGate,
        "LARK-FIRST-WORKING",
        " · LARK-FIRST-DONE",
        "lark_first_started",
        "lark_first_released",
      );
    }
    if (marker?.[0] === "LARK_SECOND_PROMPT") {
      console.log(
        JSON.stringify({ event: "lark_queued_user_started", at: new Date().toISOString() }),
      );
      return reply("LARK-USER-SECOND");
    }
    if (marker?.[0] === "LARK_HEARTBEAT_TICK") {
      console.log(
        JSON.stringify({ event: "lark_heartbeat_started", at: new Date().toISOString() }),
      );
      return reply("LARK-CHECK-COMPLETE");
    }
    if (marker?.[1]) {
      const [, action, value] = marker;
      const path = "gull-shift-source.txt";
      const text = `GULL_VALUE=${value}\n`;
      if (action === "BASELINE" && observations.length === 0)
        return call("create_file", { command_id, path, text });
      if (action === "UPDATE" && observations.length === 0) return call("read_file", { path });
      if (action === "UPDATE" && observations.length === 1) {
        const expected_sha256 = namedValue(observations[0], "sha256");
        if (!expected_sha256) return reply("Fixture could not read the prior source hash.");
        return call("write_file", { command_id, path, text, expected_sha256 });
      }
      if (observations.length === (action === "BASELINE" ? 1 : 2))
        return call("publish_artifact", { command_id, path, media_type: "text/plain" });
      return reply(`Published the source with GULL_VALUE=${value}.`);
    }

    if (marker?.[0] === "GULL_SETUP_WATCH") {
      if (!observations.length) return call("get_workspace", {});
      if (!observations.some((item) => namedValue(item, "kind") === "routine")) {
        const workspace_id = observations
          .map((item) => namedValue(item, "workspace_id"))
          .find(Boolean);
        const anchor_at = input
          .slice(marker.index)
          .match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/)?.[0];
        console.log(
          JSON.stringify({
            event: "schedule_setup",
            result_count: observations.length,
            has_workspace: !!workspace_id,
          }),
        );
        if (!workspace_id || !anchor_at || observations.length > 4)
          return reply("Fixture could not record the Routine.");
        return call("write_routine", {
          command_id,
          routine_id: crypto.randomUUID(),
          expected_revision: 0,
          goal_id: null,
          execution_target: null,
          name: "Gull source watch",
          instruction:
            "GULL_SOURCE_TICK. Read the current attached source snapshot and report its GULL_VALUE in this conversation.",
          schedule: { type: "interval", anchor_at, every_ms: 60_000 },
          timezone: "Asia/Makassar",
          precheck: { workspace_id, source_path: "gull-shift-source.txt", on_change: true },
        });
      }
      return reply(
        "Gull source watch is scheduled. It will check for changes to the published source.",
      );
    }

    if (marker?.[0] === "COVE_SETUP_SOURCE" || marker?.[0] === "COVE_SETUP_REPORT") {
      const producer = marker[0] === "COVE_SETUP_SOURCE";
      const at = input.slice(marker.index).match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/)?.[0];
      if (!at) return reply("Fixture could not read the requested schedule.");
      if (
        observations.some(
          (item) => !item.includes('"routines"') && namedValue(item, "kind") === "routine",
        )
      )
        return reply(
          producer ? "Cove source is scheduled." : "Cove report is linked to Cove source.",
        );
      let precheck:
        | { workspace_id: string; source_routine_id: string; source_path: string }
        | undefined;
      if (!producer) {
        const workspace = observations.find((item) => namedValue(item, "workspace_id"));
        const routines = observations.find((item) => item.includes('"routines"'));
        if (!workspace) return call("get_workspace", {});
        if (!routines) return call("list_goals", {});
        const workspace_id = namedValue(workspace, "workspace_id");
        const source_routine_id = namedValue(routines.split('"routines"')[1], "id");
        if (!workspace_id || !source_routine_id)
          return reply("Fixture could not find Cove source.");
        precheck = { workspace_id, source_routine_id, source_path: "cove-source-output.txt" };
      }
      if (observations.length > 3) return reply("Fixture could not record the Routine.");
      return call("write_routine", {
        command_id,
        routine_id: crypto.randomUUID(),
        expected_revision: 0,
        goal_id: null,
        execution_target: null,
        name: producer ? "Cove source" : "Cove report",
        instruction: producer
          ? "COVE_SOURCE_TICK. Produce and publish the synthetic Cove source output for this test slot."
          : "COVE_REPORT_TICK. Read the attached output of Cove source, then report the COVE_RESULT value.",
        schedule: { type: "once", at },
        timezone: "Asia/Makassar",
        ...(precheck ? { precheck } : {}),
      });
    }

    if (marker?.[0] === "COVE_SOURCE_TICK") {
      if (!dependencyGate) return reply("The source fixture gate is unavailable.");
      const mode = (await Bun.file(dependencyGate).text()).trim();
      if (mode === "fail")
        return Response.json(
          {
            error: {
              message: "Intentional upstream processing failure.",
              type: "invalid_request_error",
            },
          },
          { status: 400 },
        );
      if (mode === "dry") return reply("Cove source completed without publishing a file.");
      const path = "cove-source-output.txt";
      const first = mode === "first";
      const value = first ? 31 : 52;
      const text = `COVE_RESULT=${value}\n`;
      if (!observations.length)
        return first
          ? call("create_file", { command_id, path, text })
          : call("read_file", { path });
      if (!first && observations.length === 1) {
        const expected_sha256 = namedValue(observations[0], "sha256");
        if (!expected_sha256) return reply("Fixture could not read the previous Cove output.");
        return call("write_file", { command_id, path, text, expected_sha256 });
      }
      if (observations.length === (first ? 1 : 2))
        return call("publish_artifact", { command_id, path, media_type: "text/plain" });
      return reply(`Cove source published COVE_RESULT=${value}.`);
    }

    if (marker?.[0] === "GULL_SOURCE_TICK" || marker?.[0] === "COVE_REPORT_TICK") {
      const gull = marker[0] === "GULL_SOURCE_TICK";
      const recovered =
        gull &&
        input
          .slice(Math.max(0, marker.index - 240), marker.index)
          .includes("recovering a previously observed change");
      if (!observations.length) {
        console.log(
          JSON.stringify({
            event: "scheduled_turn",
            recovered,
            scenario: gull ? "gull" : "cove",
            at: new Date().toISOString(),
          }),
        );
        if (gull && (await Bun.file(gate).text()).trim() === "fail") {
          console.log(
            JSON.stringify({ event: "provider_rejected", recovered, at: new Date().toISOString() }),
          );
          return Response.json(
            {
              error: { message: "Intentional processing failure.", type: "invalid_request_error" },
            },
            { status: 400 },
          );
        }
        return call("read_run_context", {});
      }
      if (observations.length === 1) {
        const currentAttachments =
          observations[0].split('"previous_attachments"')[0].split('"attachments"')[1] ?? "";
        const artifact_id = namedValue(currentAttachments, "id");
        if (!artifact_id) return reply("Fixture could not find the attached source snapshot.");
        console.log(JSON.stringify({ event: "read_observation", recovered, artifact_id }));
        return call("read_attachment", { artifact_id, start_page: 1, offset: 0, max_chars: 12000 });
      }
      const value = observations[1].match(gull ? /GULL_VALUE=(\d+)/ : /COVE_RESULT=(\d+)/)?.[1];
      if (!value) return reply("Fixture could not read the observed source value.");
      console.log(JSON.stringify({ event: "report", recovered, value: Number(value) }));
      return reply(
        gull ? `Gull source report · GULL_VALUE=${value}` : `Cove report · COVE_RESULT=${value}`,
      );
    }
    return reply("Schedule verification provider connected.");
  },
});
