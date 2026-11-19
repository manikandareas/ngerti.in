import { existsSync } from "node:fs";
import { join } from "node:path";

const model = "peer-checks";
const headers = { "Content-Type": "text/event-stream", "Cache-Control": "no-store" };
const gates = process.env.HERMES_DELEGATION_GATE_DIRECTORY;

type Message = { role: string; content?: string | { text?: string }[] };

function text(message: Message | undefined) {
  const content = message?.content;
  return typeof content === "string" ? content : (content ?? []).map((part) => part.text).join("\n");
}

Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.HERMES_DELEGATION_FIXTURE_PORT ?? 8459),
  idleTimeout: 70,
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (request.method === "GET" && pathname === "/v1/models")
      return Response.json({ object: "list", data: [{ id: model, object: "model" }] });
    if (request.method !== "POST" || pathname !== "/v1/chat/completions")
      return new Response("Not found.", { status: 404 });

    const { messages = [], tools = [] } = (await request.json()) as {
      messages?: Message[];
      tools?: { function: { name: string } }[];
    };
    const index = messages.findLastIndex(({ role }) => role === "user");
    const input = text(messages[index]);
    const results = messages.slice(index + 1).filter(({ role }) => role === "tool");
    const id = `peer-check-${crypto.randomUUID()}`;
    const created = Math.floor(Date.now() / 1000);
    const chunk = (delta: object, finish_reason: string | null = null) =>
      `data: ${JSON.stringify({
        id,
        created,
        model,
        object: "chat.completion.chunk",
        choices: [{ index: 0, delta, finish_reason }],
      })}\n\n`;
    const end = (reason = "stop") => chunk({}, reason) + "data: [DONE]\n\n";
    const reply = (content: string) =>
      new Response(chunk({ role: "assistant", content }) + end(), { headers });
    const toolCall = (suffix: string, args: object) => {
      const tool = tools.find(({ function: tool }) => tool.name.endsWith(suffix));
      return tool
        ? chunk({
          role: "assistant",
          tool_calls: [
            {
              index: 0,
              id: `call_${crypto.randomUUID()}`,
              type: "function",
              function: { name: tool.function.name, arguments: JSON.stringify(args) },
            },
          ],
          }) + end("tool_calls")
        : chunk({ role: "assistant", content: `Fixture tool unavailable: ${suffix}.` }) + end();
    };
    const call = (suffix: string, args: object) =>
      new Response(toolCall(suffix, args), { headers });
    const cardFile = (path: string, content: string, summary: string) => {
      if (results.length === 0)
        return call("create_file", { command_id: crypto.randomUUID(), path, text: content });
      if (results.length === 1)
        return call("publish_artifact", { command_id: crypto.randomUUID(), path, media_type: "text/plain" });
      if (results.length === 2) {
        const receipt = JSON.parse(text(results[1])) as { id?: string; name?: string };
        if (!receipt.id || receipt.name !== path.split("/").at(-1))
          return reply("The card file could not be published.");
        return call("submit_board_card", {
          command_id: crypto.randomUUID(),
          summary,
          artifact_ids: [receipt.id],
        });
      }
      return reply(summary);
    };
    const delayed = (
      opening: string,
      content: string,
      reason: string,
      ms: number,
      onCancel?: () => void,
    ) => {
      const encoder = new TextEncoder();
      let timer: ReturnType<typeof setTimeout>;
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(chunk({ role: "assistant", content: opening })));
            timer = setTimeout(() => {
              controller.enqueue(encoder.encode(chunk({ content }) + end(reason)));
              controller.close();
            }, ms);
          },
          cancel() {
            clearTimeout(timer);
            onCancel?.();
          },
        }),
        { headers },
      );
    };
    const heldWrite = (worker: string, opening: string, path: string, contents: string) => {
      if (!gates) return reply("Set the verification gate directory.");
      const gate = join(gates, `release-${worker}`);
      const encoder = new TextEncoder();
      let closed = false;
      const log = (event: string) => console.info(JSON.stringify({ event, worker, at: new Date().toISOString() }));
      return new Response(
        new ReadableStream({
          async start(controller) {
            controller.enqueue(encoder.encode(chunk({ role: "assistant", content: opening })));
            log("child_waiting");
            const deadline = Date.now() + 80_000;
            while (!closed && !request.signal.aborted && !existsSync(gate) && Date.now() < deadline) {
              await Bun.sleep(500);
              if (!closed && !request.signal.aborted) controller.enqueue(encoder.encode(": waiting\n\n"));
            }
            if (closed) return;
            if (request.signal.aborted) log("child_stream_aborted");
            else if (existsSync(gate)) {
              log("child_requested_create");
              controller.enqueue(encoder.encode(toolCall("create_file", {
                command_id: crypto.randomUUID(),
                path,
                text: contents,
              })));
            } else controller.enqueue(encoder.encode(chunk({ content: "The release did not arrive." }) + end()));
            controller.close();
          },
          cancel() {
            closed = true;
            log("child_stream_cancelled");
          },
        }),
        { headers },
      );
    };
    const packet = input
      .split("\n")
      .find((line) => line.startsWith('{"task_id"') && line.includes('"peer_results"'));
    if (input.includes("Willow settlement check")) {
      const code = /Additional information from the owner\.\s*Release code (WILLOW-[A-Z\d]+)\b/.exec(input)?.[1];
      if (!code) {
        if (!results.length)
          return call("submit_board_card", {
            command_id: crypto.randomUUID(),
            summary: "The Willow report is ready.",
            artifact_ids: [],
          });
        return /CONFLICT/.test(text(results[0]))
          ? reply("Done. The Willow report is ready.")
          : reply("Unexpected settlement without the required file.");
      }
      if (results.length >= 3)
        return delayed("The Willow report was submitted. ", "The Willow release note is finished.", "stop", 12_000);
      return cardFile(
        "willow-settled-note.txt",
        `Willow release code: ${code}\n`,
        `Verified the published release note for ${code}.`,
      );
    }
    if (input.includes("Juniper worker handoff")) {
      const count = /Additional information from the owner\.\s*Replacement count (\d+)\b/.exec(input)?.[1];
      const path = "juniper-replacement.txt";
      if (!count && !results.length)
        return heldWrite(
          "juniper-original",
          "Juniper’s first worker is waiting for its source release. ",
          path,
          "The original worker must not commit after stop.\n",
        );
      return cardFile(path, `Juniper verified count: ${count}\n`, `The replacement worker verified ${count}.`);
    }
    if (input.includes("Cedar release gate")) {
      const ticket = /Additional information from the owner\.\s*Operator ticket (LIFT-\d{3})\b/.exec(input)?.[1];
      if (!ticket) {
        return results.length
          ? reply("The card is blocked until the owner supplies the operator ticket ID.")
          : call("block_board_card", {
              command_id: crypto.randomUUID(),
              blocker: "The operator ticket ID is missing. Provide the ticket ID to continue.",
            });
      }
      return cardFile("operator-ticket.txt", `Operator ticket: ${ticket}\n`, `Verified and recorded operator ticket ${ticket}.`);
    }
    if (input.includes("Sycamore release review")) {
      const workerAt = input.lastIndexOf("Work on this board card.");
      const reviewerAt = input.lastIndexOf("Review the submitted result for this board card.");
      if (reviewerAt > workerAt) {
        if (!results.length) {
          const artifactId = /"attachments":\[\{"id":"([a-f\d-]{36})","name":"release-note\.txt"/.exec(input)?.[1];
          if (!artifactId) return reply("The release candidate was unavailable.");
          return call("read_attachment", { artifact_id: artifactId, start_page: 1, offset: 0, max_chars: 2000 });
        }
        const candidate = text(results[0]);
        if (!candidate.includes("Released units: 42"))
          return reply("The review could not verify the release count.");
        const signed = candidate.includes("Operator sign-off: Harbor QA");
        if (results.length === 1)
          return call("review_board_card", {
            command_id: crypto.randomUUID(),
            decision: signed ? "approve" : "request_changes",
            findings: signed
              ? "Verified 42 released units and the Harbor QA operator sign-off."
              : "The note lists 42 released units. Add the missing line Operator sign-off: Harbor QA.",
          });
        return delayed(
          signed ? "The revised note has the required sign-off. " : "The candidate needs a specific correction. ",
          signed ? "I approved the revised release note." : "I requested the missing operator sign-off.",
          "stop",
          12_000,
        );
      }
      if (workerAt >= 0) {
        const revised = input.lastIndexOf("The reviewer requested these corrections.") > workerAt;
        const path = `${revised ? "revised" : "draft"}/release-note.txt`;
        return cardFile(
          path,
          revised ? "Released units: 42\nOperator sign-off: Harbor QA\n" : "Released units: 42\n",
          revised ? "The revised release note is submitted." : "The draft is submitted for review.",
        );
      }
    }
    const budget = input.includes("Budget Birch verification.");
    if (packet && budget) {
      const { peer_results } = JSON.parse(packet) as {
        peer_results: { state: string; text: string | null; reason?: string }[];
      };
      const complete = peer_results.find(({ state }) => state === "completed");
      const overBudget = peer_results.find(({ state, reason }) =>
        state === "cancelled" && reason === "The child exceeded its time budget.",
      );
      const total = /Birch primary: (\d+) verified units/.exec(complete?.text ?? "")?.[1];
      if (peer_results.length === 2 && total && overBudget?.text === null)
        return reply(`Birch primary verified ${total} units. I stopped the unfinished secondary check when it reached its time budget.`);
      return reply("Birch did not have a verified result and a confirmed budget stop.");
    }
    if (input.includes("Check Birch secondary until the time limit.")) {
      console.info(JSON.stringify({ event: "budget_child_started", at: new Date().toISOString() }));
      return delayed(
        "Birch secondary is checking an input and will need more time. ",
        "Unverified secondary value 999.",
        "stop",
        65_000,
        () => console.info(JSON.stringify({ event: "budget_stream_cancelled", at: new Date().toISOString() })),
      );
    }
    const silver = [...input.matchAll(/Silver delivery (oak|pine|ash)\./g)].at(-1)?.[1];
    if (silver && packet) {
      const { peer_results } = JSON.parse(packet) as {
        peer_results: { state: string; text: string | null; artifact_ids: string[] }[];
      };
      if (peer_results.length !== 1) return reply("Unexpected Silver result count.");
      const [child] = peer_results;
      if (child.state === "cancelled" && child.artifact_ids.length === 0)
        return reply(`Silver ${silver} stopped before delivery. No file was produced.`);
      const link = /\[[^\]]+\]\(ngertiin:\/\/file\/[^)]+\)/.exec(child.text ?? "")?.[0];
      if (child.state === "completed" && child.artifact_ids.length === 1 && link)
        return reply(`Silver ${silver} delivery confirmed. ${link}`);
      return reply(`Silver ${silver} delivery could not be confirmed.`);
    }
    const worker = /Silver child (oak|pine|ash)\./.exec(input)?.[1];
    if (worker) {
      const path = `silver-delegation-${worker}.txt`;
      if (results.length === 1)
        return call("publish_artifact", {
          command_id: crypto.randomUUID(),
          path,
          media_type: "text/plain",
        });
      if (results.length > 1) {
        const receipt = JSON.parse(text(results[1])) as { name?: string; reference?: string };
        if (receipt.name !== path || !receipt.reference)
          return reply(`Silver ${worker} did not return publication evidence.`);
        return reply(`Silver ${worker} delivered. ${receipt.reference}`);
      }
      return heldWrite(worker, `Waiting for the Silver ${worker} release. `, path, `Silver ${worker} verified\n`);
    }
    if (silver) {
      const agentId = /"agent_id":"([a-f\d-]{36})","name":"Parallel Ledger"/.exec(input)?.[1];
      if (!agentId) return reply("The Silver worker is unavailable.");
      if (results.length) return reply("The Silver work is assigned.");
      return call("group_handoff", {
        command_id: crypto.randomUUID(),
        agent_id: agentId,
        purpose: "handoff",
        continuation: "synthesize",
        parallel: false,
        instruction: `Silver child ${silver}. Wait for the fixture release and publish the delivery file.`,
        summary: `Prepare the Silver ${silver} delivery`,
        announcement: `Parallel Ledger will prepare the Silver ${silver} delivery.`,
      });
    }
    if (packet && input.includes("Parallel Copper verification")) {
      const { peer_results } = JSON.parse(packet) as {
        peer_results: { state: string; text: string | null }[];
      };
      const result = peer_results.find(({ state }) => state === "completed")?.text;
      const total = /Copper primary: (\d+) verified units/.exec(result ?? "")?.[1];
      if (peer_results.length !== 2 || !total || !peer_results.some(({ state }) => state === "failed"))
        return reply("Fixture could not verify both settlement states.");
      return reply(`Copper primary verified ${total} units. The secondary count failed and remains unverified.`);
    }
    const primaryArea = /Check (Copper|Birch) primary ledger independently\./.exec(input)?.[1];
    const artifactId =
      /"id":"([a-f\d-]{36})","name":"(?:copper|birch)-parallel-primary\.txt"/.exec(input)?.[1];
    if (primaryArea) {
      if (!artifactId) return reply("Primary file was unavailable.");
      if (!results.length)
        return call("read_attachment", {
          artifact_id: artifactId,
          start_page: 1,
          offset: 0,
          max_chars: 2000,
        });
      const counts = [...text(results[0]).matchAll(/Bay [A-Z] = (\d+)/g)];
      if (counts.length !== 3) return reply("Primary file could not be verified.");
      const total = counts.reduce((sum, count) => sum + Number(count[1]), 0);
      return delayed(`Checking the three ${primaryArea} primary rows. `, `${primaryArea} primary: ${total} verified units.`, "stop", 29_000);
    }
    if (input.includes("Check Copper secondary independently.")) {
      if (!results.length)
        return call("create_file", {
          command_id: crypto.randomUUID(),
          path: "copper-parallel-rejected.txt",
          text: "Synthetic check side effect.",
        });
      if (!/SCOPE_DENIED/.test(text(results[0]))) return reply("Unexpected write authorization.");
      return delayed("The secondary source is missing. ", "", "length", 22_000);
    }
    if (input.includes("Parallel Copper verification") || budget) {
      const primary = results.length === 0;
      if (results.length >= 2) return reply("The two Copper checks are assigned.");
      const name = primary ? "Parallel Ledger" : "Parallel Secondary";
      const agentId = new RegExp(`"agent_id":"([a-f\\d-]{36})","name":"${name}"`).exec(input)?.[1];
      if (!agentId || !artifactId) return reply("The Copper peers or primary input could not be found.");
      const area = budget ? "Birch" : "Copper";
      return call("group_handoff", {
        command_id: crypto.randomUUID(),
        agent_id: agentId,
        purpose: "handoff",
        continuation: "synthesize",
        parallel: true,
        ...(budget && !primary ? { time_budget_seconds: 30 } : {}),
        attachment_ids: primary ? [artifactId] : [],
        instruction: primary
          ? `Check ${area} primary ledger independently.`
          : budget
            ? "Check Birch secondary until the time limit."
            : "Check Copper secondary independently.",
        summary: primary ? "Verify the primary ledger" : "Verify the secondary count",
        announcement: primary
          ? "I’ll ask Parallel Ledger to verify the primary count."
          : "Parallel Secondary will check the secondary count at the same time.",
      });
    }
    return reply("Ready to check the Copper counts.");
  },
});
