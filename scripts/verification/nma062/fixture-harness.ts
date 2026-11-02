import type { HarnessAdapter, HarnessClient } from "../../../apps/server/src/harness/client";
import { unknownCapabilities, interactionAnswer } from "../../../apps/server/src/harness/contracts";
import type { ProductTools } from "../../../apps/server/src/harness/tools";

/** External protocol fixture; HTTP, leases, tools, persistence and the broker remain real. */
export function fixtureAdapter(tools: ProductTools): HarnessAdapter {
  return {
    harness: "codex",
    async connect() {
      const sessionId = crypto.randomUUID();
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
              input.onEvent({ type: "native_tool", item_id, name, state, command: null, exit_code: null });
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
