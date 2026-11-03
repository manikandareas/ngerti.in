import { expect, test } from "bun:test";
import { conversationEntries } from "../src/features/conversation/lib/conversation-parts";
import { routineName } from "../src/features/conversation/lib/routine-name";
import type { ConversationPart, Message } from "../src/types/workspace";

test("milestones group only across adjacent events and sequence wins over intake timestamps", () => {
  const part = (
    sequence: number,
    kind: ConversationPart["kind"],
    message_id: string | null = null,
  ) =>
    ({
      id: String(sequence),
      sequence,
      kind,
      message_id,
      actors: [],
      created_at: "2026-11-03T00:00:00Z",
    }) as unknown as ConversationPart;
  const messages = [
    { id: "a", text: "Answer", created_at: "2026-11-03T01:00:00Z" },
    { id: "b", text: "Queued", created_at: "2026-11-03T00:00:00Z" },
  ] as Message[];
  const entries = conversationEntries(
    [
      part(5, "goal_completed"),
      part(1, "goal_created"),
      part(2, "goal_created"),
      part(3, "message", "a"),
      part(4, "message", "b"),
      part(6, "goal_completed"),
    ],
    messages,
  );
  expect(
    entries.map((entry) =>
      entry.type === "message"
        ? entry.message.text
        : `${entry.parts[0].kind}:${entry.parts.length}`,
    ),
  ).toEqual(["goal_created:2", "Answer", "Queued", "goal_completed:2"]);
});

test("Routine milestones remain separate and legacy references never become technical titles", () => {
  const parts = [1, 2].map(
    (sequence) =>
      ({
        id: String(sequence),
        sequence,
        kind: "routine_created",
        actors: [],
      }) as unknown as ConversationPart,
  );
  expect(conversationEntries(parts, [])).toHaveLength(2);
  expect(routineName({ name: "Review notes", instruction: "Internal execution steps" })).toBe(
    "Review notes",
  );
  expect(
    routineName({
      name: null,
      instruction: "Review [notes.md](ngertiin://file/b6869bf7-af0b-4a32-a96f-d8a823a3deeb).",
    }),
  ).toBe("Review notes.md.");
});
