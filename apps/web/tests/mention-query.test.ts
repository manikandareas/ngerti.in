import { describe, expect, test } from "bun:test";
import { insertMention, mentionAtCaret } from "../src/features/direct-messages/mention-query";

describe("group mention editing", () => {
  test("finds the mention at the caret, including after a newline", () => {
    expect(mentionAtCaret("Hi\n@bo later", 6)).toEqual({ start: 3, end: 6, query: "bo" });
    expect(mentionAtCaret("@", 1)?.query).toBe("");
  });
  test("does not treat email addresses, completed tokens, or selections as mentions", () => {
    expect(mentionAtCaret("hi@example", 10)).toBeNull();
    expect(mentionAtCaret("@boni ", 6)).toBeNull();
    expect(mentionAtCaret("@boni", 1, 5)).toBeNull();
  });
  test("replaces a partial handle in the middle without losing the suffix", () => {
    const text = "Hi @resear later @generalist";
    const query = mentionAtCaret(text, 7);
    expect(query).not.toBeNull();
    if (!query) throw new Error("Expected a mention query");
    expect(insertMention(text, query, "researcher")).toEqual({
      text: "Hi @researcher later @generalist",
      caret: 15,
    });
  });
  test("adds a space after selection at the end", () => {
    expect(insertMention("@bo", { start: 0, end: 3, query: "bo" }, "boni")).toEqual({
      text: "@boni ",
      caret: 6,
    });
  });
});
