import { expect, test } from "bun:test";
import { Redactor } from "../src/harness/context";

test("long credentials do not buffer unrelated conversational text", () => {
  const redactor = new Redactor();
  redactor.add(`private-token-${"q".repeat(4000)}`);
  expect(redactor.stream("A normal answer can stream immediately.")).toBe(
    "A normal answer can stream immediately.".slice(0, -8),
  );
});

test("every partial known credential remains private across chunk boundaries", () => {
  for (const secret of ["private-token-abcdef", 'a-long-"quoted"-secret', "a/path?key=value"]) {
    const redactor = new Redactor();
    redactor.add(secret);
    for (const variant of [
      secret,
      JSON.stringify(secret).slice(1, -1),
      encodeURIComponent(secret),
    ]) {
      for (let size = 1; size <= variant.length; size++) {
        expect(redactor.stream(`Public answer. ${variant.slice(0, size)}`)).toBe(
          "Public answer. ".slice(0, Math.min(15, 15 + size - 8)),
        );
      }
      expect(redactor.stream(`Public answer. ${variant} finished now.`)).toBe(
        "Public answer. [REDACTED] finis",
      );
    }
  }
});

test("generic bearer and API key tokens remain private while incomplete", () => {
  const redactor = new Redactor();
  for (const secret of ["Bearer unknown-private-token", "sk-unknown-private-token"]) {
    for (let size = 1; size <= secret.length; size++) {
      expect(redactor.stream(`Public answer. ${secret.slice(0, size)}`)).not.toContain("unknown");
    }
  }
});

test("overlapping complete credentials cannot be split by the holdback boundary", () => {
  const redactor = new Redactor();
  redactor.add("123456789abcdef");
  redactor.add("abcdef-very-long-tail");
  expect(redactor.stream("Public answer. 123456789abcdef-very")).toBe("Public answer. ");
});
