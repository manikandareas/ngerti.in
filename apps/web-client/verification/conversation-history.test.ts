import { expect, test } from "bun:test";
import { mergeConversationHistory } from "../src/features/conversation/lib/conversation-history";

const item = (id: string, thread_id: string, text = id) => ({ id, thread_id, text });

test("switching between cached DMs cannot combine their retained history", () => {
  const claire = [item("welcome", "claire"), item("answer", "claire")];
  const muse = [item("question", "muse"), item("reply", "muse")];
  const selected = mergeConversationHistory("muse", claire, muse);
  expect(selected).toEqual(muse);
  expect(mergeConversationHistory("claire", selected, claire)).toEqual(claire);
});

test("a late history page from the previous thread is excluded and current revisions win", () => {
  const retained = [item("reply", "muse", "streaming")];
  const current = [item("reply", "muse", "complete"), item("activity", "muse")];
  const late = [item("old-page", "claire")];
  expect(mergeConversationHistory("muse", [...late, ...retained], current)).toEqual(current);
  expect(mergeConversationHistory(null, retained, current)).toEqual([]);
});
