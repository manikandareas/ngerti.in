import { expect, test } from "bun:test";
import { lstatSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeOperatorFile } from "../../src/operations/files";

test("operator metadata publishes privately and exclusive writes preserve existing recovery state", () => {
  const root = mkdtempSync(join(tmpdir(), "ngertiin-operator-file-"));
  const path = join(root, "intent.json");
  try {
    writeOperatorFile(path, "original", true);
    expect(lstatSync(path).mode & 0o077).toBe(0);
    expect(() => writeOperatorFile(path, "foreign", true)).toThrow();
    expect(readFileSync(path, "utf8")).toBe("original");
    expect(readdirSync(root)).toEqual(["intent.json"]);
    writeOperatorFile(path, "completed");
    expect(readFileSync(path, "utf8")).toBe("completed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
