import { expect, test } from "bun:test";
import {
  executeSubmission,
  type MessageSubmission,
} from "../src/features/conversation/lib/message-submission";

test("file-reference submissions skip the status request and retain exact retry keys; uploads retain recovery", async () => {
  const original = globalThis.fetch;
  const calls: { path: string; options?: RequestInit }[] = [];
  globalThis.fetch = (async (path, options) => {
    calls.push({ path: String(path), options });
    return Response.json(
      String(path).includes("message-submissions")
        ? { state: "committed", result: { message_id: "saved" } }
        : { message_id: "saved" },
    );
  }) as typeof fetch;
  try {
    const operation: MessageSubmission = {
      id: "stable-command",
      target: "dm",
      body: {
        submission_id: "stable-command",
        thread_id: "thread",
        agent_id: "agent",
        text: "Hello",
        artifact_ids: ["existing-file"],
      },
      files: [],
    };
    await executeSubmission(operation, () => {});
    await executeSubmission(operation, () => {});
    expect(calls.map((call) => call.path)).toEqual(["/v1/runs", "/v1/runs"]);
    expect(calls[0].options).toEqual(calls[1].options);
    expect(new Headers(calls[0].options?.headers).get("Idempotency-Key")).toBe(operation.id);
    calls.length = 0;
    await executeSubmission({ ...operation, target: "group" }, () => {});
    expect(calls.map((call) => call.path)).toEqual(["/v1/groups/thread/messages"]);
    calls.length = 0;
    const result = await executeSubmission(
      { ...operation, files: [{ id: "file", file: new File(["hello"], "hello.txt") }] },
      () => {},
    );
    expect(result).toEqual({ message_id: "saved" });
    expect(calls.map((call) => call.path)).toEqual(["/v1/message-submissions/stable-command"]);
  } finally {
    globalThis.fetch = original;
  }
});
