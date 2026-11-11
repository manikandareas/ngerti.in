import { afterEach, expect, spyOn, test } from "bun:test";
import { exportConversation } from "../src/features/settings/lib/export-conversation";
import { defaultPreferences, parsePreferences } from "../src/hooks/use-preferences";
import type { Snapshot } from "../src/types/workspace";

let restore: (() => void) | undefined;
afterEach(() => {
  restore?.();
  restore = undefined;
});

test("corrupt, unknown-version and malformed stored preferences fall back field by field", () => {
  expect(parsePreferences("invalid-json")).toEqual(defaultPreferences);
  expect(parsePreferences('{"version":2,"sendShortcut":"mod-enter"}')).toEqual(defaultPreferences);
  expect(
    parsePreferences(
      JSON.stringify({
        version: 1,
        startup: "bad",
        textSize: 999,
        persistDrafts: "false",
        alwaysShowActions: true,
      }),
    ),
  ).toEqual({ ...defaultPreferences, alwaysShowActions: true });
});

function snapshot(): Snapshot {
  return {
    thread: { id: "thread", name: "Public conversation", type: "dm" },
    agents: [{ id: "agent", name: "Tobi" }],
    timeline: {
      has_more: true,
      next_before: 3,
      parts: [{ sequence: 4, message_id: "latest" }],
      messages: [
        {
          id: "latest",
          state: "published",
          author: "assistant",
          author_agent_id: "agent",
          text: "Public reply",
          created_at: "2026-11-11T00:00:01Z",
          artifact_ids: [],
          native_prompt: "private",
        },
      ],
    },
    runs: [{ native_prompt: "private", credentials: "private" }],
  } as unknown as Snapshot;
}

test("export follows the public timeline, deduplicates overlap and omits private fields", async () => {
  const fetch = spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({
      has_more: false,
      next_before: null,
      parts: [
        { sequence: 1, message_id: "earlier" },
        { sequence: 4, message_id: "latest" },
      ],
      messages: [
        {
          id: "earlier",
          state: "published",
          author: "user",
          author_agent_id: null,
          text: "Question",
          created_at: "2026-11-11T00:00:00Z",
          artifact_ids: [],
        },
        { id: "deleted", state: "deleted", text: "Removed" },
        ...snapshot().timeline.messages,
      ],
    }),
  );
  restore = () => fetch.mockRestore();
  const result = await exportConversation(snapshot(), new AbortController().signal);
  expect(fetch.mock.calls[0]?.[0]).toBe("/v1/threads/thread/timeline?before=3&limit=100");
  expect(result.messages.map((message) => message.id)).toEqual(["earlier", "latest"]);
  expect(JSON.stringify(result)).not.toContain("private");
  expect(result.messages[1]?.agent).toBe("Tobi");
});

test("a repeated history cursor fails rather than downloading an incomplete or looping export", async () => {
  const fetch = spyOn(globalThis, "fetch").mockResolvedValue(Response.json(snapshot().timeline));
  restore = () => fetch.mockRestore();
  await expect(exportConversation(snapshot(), new AbortController().signal)).rejects.toThrow(
    "Riwayat",
  );
  expect(fetch).toHaveBeenCalledTimes(1);
});

test("cancelled export cannot publish a download", async () => {
  const abort = new AbortController();
  abort.abort();
  await expect(exportConversation(snapshot(), abort.signal)).rejects.toThrow();
});
