import type { HarnessAdapter, HarnessClient } from "../../../apps/server/src/harness/client";
import { unknownCapabilities, interactionAnswer } from "../../../apps/server/src/harness/contracts";
import type { ProductTools } from "../../../apps/server/src/harness/tools";

/** External protocol fixture; HTTP, leases, tools, persistence and the broker remain real. */
export function fixtureAdapter(tools: ProductTools): HarnessAdapter {
  const rejectedRoutes = new Set<string>();
  return {
    harness: "codex",
    async connect(context) {
      let sessionId = crypto.randomUUID();
      let asked = false;
      let multiple = false;
      let ambiguous = false;
      let pending: {
        resolve: (status: "succeeded" | "cancelled") => void;
        input: boolean;
        approval: boolean;
        selected: string;
        choice: string;
      } | null = null;
      const client: HarnessClient = {
        async inspect() {
          return {
            login: "authenticated",
            account_id: "fixture-account",
            auth_method: "native_login",
            billing_source: "subscription",
            capabilities: {
              ...unknownCapabilities,
              resume: "supported",
              image_input: "supported",
              settings: "supported",
              product_tools: "supported",
              permission_requests: "supported",
              cancel: "supported",
            },
          };
        },
        async discoverModels() {
          return [{ id: "fixture", reasoning: [], input_modalities: ["text", "image"] }];
        },
        async start() {
          return { native_session_id: sessionId };
        },
        async resume(identity) {
          sessionId = identity.native_session_id;
          return identity;
        },
        async settings() {},
        async prompt(input) {
          const nativeRunId = crypto.randomUUID();
          input.onEvent({
            type: "accepted",
            native_session_id: sessionId,
            native_run_id: nativeRunId,
          });
          if (context.purpose === "routing") {
            const packet = JSON.parse(input.text.slice(input.text.indexOf("\n") + 1)) as {
              request: string;
              request_message_id: string;
              members: { agent_id: string }[];
            };
            const reject =
              packet.request.includes("fixture reject routing") &&
              !rejectedRoutes.has(packet.request_message_id);
            if (reject) rejectedRoutes.add(packet.request_message_id);
            input.onEvent({
              type: "text",
              text: reject
                ? "invalid routing output"
                : JSON.stringify({ agent_id: packet.members[0]?.agent_id }),
            });
            return {
              status: "succeeded",
              native_session_id: sessionId,
              native_run_id: nativeRunId,
            };
          }
          const currentRun = tools.lifecycle.store.get("run", input.tools.scope.run_id);
          const call = (name: string, arguments_: Record<string, unknown>) =>
            tools.call(input.tools.token, input.tools.scope, name, {
              command_id: crypto.randomUUID(),
              ...arguments_,
            });
          if (input.text === "fixture shared responsibility") {
            await call("ngertiin.capture_goal", {
              goal_id: crypto.randomUUID(),
              expected_revision: 0,
              title: "Shared campaign report",
              objective: "Prepare a summary and an independently reviewed example.",
              source_message_id: currentRun.input_message_id,
            });
            await call("ngertiin.create_file", {
              path: "summary.txt",
              text: "Verified campaign summary.",
            });
            await call("ngertiin.publish_artifact", {
              path: "summary.txt",
              media_type: "text/plain",
            });
            const peer = tools.lifecycle.store
              .get("thread", currentRun.thread_id)
              .member_agent_ids.find((id) => id !== currentRun.agent_id);
            await call("ngertiin.group_handoff", {
              agent_id: peer,
              purpose: "review",
              instruction:
                "INTERNAL_HANDOFF_CANARY_8472: prepare and publish the reviewed example, then finish the task.",
              summary: "Prepare the reviewed example",
              continuation: "finalize",
            });
            input.onEvent({ type: "text", text: "The campaign summary is ready." });
            return {
              status: "succeeded",
              native_session_id: sessionId,
              native_run_id: nativeRunId,
            };
          }
          if (input.text.startsWith("INTERNAL_HANDOFF_CANARY_8472")) {
            const shared = (await tools.call(
              input.tools.token,
              input.tools.scope,
              "ngertiin.list_goals",
              {},
            )) as { goals: { title: string }[] };
            if (!shared.goals.some((goal) => goal.title === "Shared campaign report"))
              throw new Error("The peer cannot see the shared goal.");
            await call("ngertiin.create_file", {
              path: "example.txt",
              text: "An independently reviewed campaign example.",
            });
            await call("ngertiin.publish_artifact", {
              path: "example.txt",
              media_type: "text/plain",
            });
            input.onEvent({ type: "text", text: "The reviewed example is ready." });
            return {
              status: "succeeded",
              native_session_id: sessionId,
              native_run_id: nativeRunId,
            };
          }
          if (currentRun.response_mode === "finalize") {
            const shared = (await tools.call(
              input.tools.token,
              input.tools.scope,
              "ngertiin.list_goals",
              {},
            )) as { goals: { id: string; revision: number; title: string }[] };
            const goal = shared.goals.find((goal) => goal.title === "Shared campaign report");
            if (goal) {
              const artifacts = tools.lifecycle.store
                .list("artifact")
                .filter(
                  (file) =>
                    file.thread_id === currentRun.thread_id && file.origin === "native_output",
                );
              await call("ngertiin.report_goal", {
                goal_id: goal.id,
                expected_revision: goal.revision,
                progress: "Both requested campaign files are ready.",
                disposition: "completed",
                evidence_artifact_ids: artifacts.map((file) => file.id),
              });
              input.onEvent({ type: "text", text: "INTERNAL_FINALIZATION_CANARY_8472" });
              return {
                status: "succeeded",
                native_session_id: sessionId,
                native_run_id: nativeRunId,
              };
            }
          }
          if (input.text.startsWith("fixture apps:")) {
            await tools.call(input.tools.token, input.tools.scope, "ngertiin.execute_app_tool", {
              command_id: crypto.randomUUID(),
              connection_id: input.text.slice("fixture apps:".length),
              tool: "CALENDAR_LIST_EVENTS",
              arguments: {},
            });
          }
          if (input.text.includes("fixture human") && !asked) {
            asked = true;
            await tools.call(input.tools.token, input.tools.scope, "ngertiin.group_ask_user", {
              command_id: crypto.randomUUID(),
              purpose: "input",
              question: "Which fixture report format?",
            });
          }
          if (input.text === "fixture tools") {
            for (const [item_id, name, state] of [
              ["read-source", "fixture_read_source", "completed"],
              ["read-notes", "fixture_read_notes", "completed"],
              ["failed-command", "fixture_shell_failure", "failed"],
              ["unverified-step", "fixture_pending", "started"],
            ] as const)
              input.onEvent({
                type: "native_tool",
                item_id,
                name,
                state,
                command: null,
                exit_code: null,
              });
          }
          if (!input.text.includes("fixture interaction")) {
            input.onEvent({ type: "text", text: "Fixture ready" });
            return {
              status: "succeeded",
              native_session_id: sessionId,
              native_run_id: nativeRunId,
            };
          }
          multiple = input.text.includes("multiple");
          ambiguous = input.text.includes("unknown");
          if (input.text.includes("preface"))
            input.onEvent({
              type: "text",
              // The published prefix ends in blank lines despite the redactor's credential tail reserve.
              text: `Before the question.\n\n${"This fixture introduction stays local and performs no external action.\n\n".repeat(40)}${"\n".repeat(4096)}`,
            });
          const status = await new Promise<"succeeded" | "cancelled">((resolve) => {
            pending = { resolve, input: true, approval: true, selected: "", choice: "" };
            input.signal.addEventListener("abort", () => resolve("cancelled"), { once: true });
          });
          if (status === "succeeded")
            input.onEvent({
              type: "text",
              text: `Fixture answer: ${pending?.selected}; approval: ${pending?.choice}`,
            });
          pending = null;
          return { status, native_session_id: sessionId, native_run_id: nativeRunId };
        },
        async stop() {
          pending?.resolve("cancelled");
          return { confirmed: true };
        },
        interactions() {
          return {
            user_inputs: pending?.input
              ? [
                  {
                    userInputId: "fixture-question",
                    questions: [
                      {
                        id: "format",
                        header: "Format",
                        question: "Choose the report format",
                        options: [
                          { label: "Markdown", description: "A concise report" },
                          { label: "CSV" },
                        ],
                        selection: {
                          mode: multiple ? "multiple" : "single",
                          min: 1,
                          max: multiple ? 2 : 1,
                        },
                      },
                    ],
                  },
                ]
              : [],
            approvals: pending?.approval
              ? [
                  {
                    approvalId: "fixture-approval",
                    toolName: "fixture_read",
                    subject: { kind: "tool", toolName: "fixture_read" },
                    currentRequirementId: { approvalId: "fixture-approval", sourceIndex: 7 },
                    availableChoices: [
                      {
                        choiceId: "allow-once",
                        decision: "allow",
                        scope: "once",
                        label: "Allow this read",
                      },
                      {
                        choiceId: "reject",
                        decision: "reject",
                        scope: "once",
                        label: "Reject this read",
                      },
                    ],
                  },
                ]
              : [],
          };
        },
        async respond(_runId, raw) {
          const answer = interactionAnswer.parse(raw);
          if (!pending) throw new Error("No pending fixture request.");
          // Simulate an ambiguous native transport; keep the request pending for replay-fence QA.
          if (ambiguous && answer.type === "user_input")
            throw new Error("Fixture native acknowledgement unavailable.");
          if (answer.type === "user_input") {
            const value = answer.answers[0];
            if (
              !value ||
              [value.freeText, value.selectedLabel, value.selectedLabels].filter(
                (v) => v !== undefined,
              ).length !== 1
            )
              throw new Error("Native answer must use exactly one representation.");
            pending.selected =
              value.freeText ?? value.selectedLabel ?? value.selectedLabels?.join(", ") ?? "";
            pending.input = false;
          } else {
            if (answer.source_index !== 7) throw new Error("Wrong fixture requirement.");
            pending.choice = answer.choice_id;
            pending.approval = false;
          }
          if (!pending.input && !pending.approval) pending.resolve("succeeded");
        },
        async close() {
          pending?.resolve("cancelled");
        },
      };
      return client;
    },
  };
}
