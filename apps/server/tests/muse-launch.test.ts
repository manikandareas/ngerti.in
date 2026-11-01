import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Redactor } from "../src/harness/context";
import { MuseTransport } from "../src/harness/muse/transport";

for (const purpose of ["conversation", "routing"] as const) {
  test(`Muse ${purpose} launch restricts tools without removing user interaction`, async () => {
    const dir = mkdtempSync(join(tmpdir(), "muse-launch-"));
    const transport = new MuseTransport(
      process.execPath,
      {
        purpose,
        state_directory: dir,
        env: { HOME: dir },
        redactor: new Redactor(),
        workspace: { id: "workspace", root: dir, revision: 1 },
      },
      [join(import.meta.dir, "fixtures/muse-serve.ts")],
    );
    try {
      await transport.initialize();
      const args: string[] = JSON.parse(readFileSync(join(dir, "launch-args.json"), "utf8"));
      expect(args).toContain("--disable-shell");
      expect(args).toContain("--disable-write");
      expect(args).not.toContain("empty");
      const setting = args.find((value) => value.startsWith("run.toolset="));
      expect(setting).toBeDefined();
      if (!setting) throw new Error("Missing tool policy");
      expect(JSON.parse(setting.slice("run.toolset=".length))).toEqual(
        purpose === "routing" ? [] : ["request_user_input", "mcp__ngertiin__*"],
      );
    } finally {
      await transport.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
