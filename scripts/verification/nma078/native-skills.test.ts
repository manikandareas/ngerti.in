import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseEnv } from "node:util";
import { CodexClient } from "../../../apps/server/src/harness/codex/client";
import { MuseClient } from "../../../apps/server/src/harness/muse/client";
import { Redactor, type LaunchContext } from "../../../apps/server/src/harness/context";
import { inheritedSkills } from "../../../apps/server/src/harness/inherited-skills";
import { HarnessRuntime } from "../../../apps/server/src/harness/runtime";
import { fixture } from "../../../apps/server/tests/helpers";

test.skipIf(process.env.NGERTIIN_NMA078_NATIVE_SKILLS !== "1")(
  "real native catalogs and bounded package reads stay inside each actor home",
  async () => {
    const f = await fixture();
    const root = resolve(import.meta.dir, "../../..");
    const runtime = new HarnessRuntime({ muse: join(root, ".dev/nma050/muse") });
    const report: Record<string, unknown> = {
      scope:
        "real native skill catalogs and application bounded package reads; no model inference or production admission",
      lanes: [],
      completed: false,
    };
    const clients: (CodexClient | MuseClient)[] = [];
    try {
      for (const harness of ["codex", "muse"] as const) {
        const available = await runtime.detect(harness);
        expect(available.state).toBe("supported");
        for (const actor of ["alice", "bob"]) {
          const directory = join(f.dir, harness, actor);
          const home = join(directory, "home");
          const codex = join(directory, "codex");
          const workspace = join(directory, "workspace");
          const skillRoot = join(
            home,
            harness === "muse" ? ".muse/skills" : ".agents/skills",
            `${actor}-private`,
          );
          for (const path of [home, codex, workspace, skillRoot, join(directory, "tmp")])
            mkdirSync(path, { recursive: true, mode: 0o700 });
          const marker = `${harness}-${actor}-${crypto.randomUUID()}`;
          writeFileSync(
            join(skillRoot, "SKILL.md"),
            `---\nname: ${actor}-private\ndescription: ${actor} private catalog proof\n---\nRead this private marker: ${marker}.\n`,
            { mode: 0o600 },
          );
          const context: LaunchContext = {
            scoped: true,
            state_directory: directory,
            redactor: new Redactor(),
            env: {
              HOME: home,
              USERPROFILE: home,
              CODEX_HOME: codex,
              TMPDIR: join(directory, "tmp"),
              XDG_CONFIG_HOME: join(home, ".config"),
              XDG_DATA_HOME: join(home, ".local/share"),
              PATH: process.env.PATH ?? "/usr/bin:/bin",
              MUSE_NO_AUTO_UPDATE: "1",
              MUSE_CONTRIBUTOR_MODE: "0",
            },
            workspace: { id: crypto.randomUUID(), root: workspace, revision: 1 },
          };
          if (harness === "muse") {
            const env = parseEnv(readFileSync(join(root, ".env"), "utf8"));
            const key = env.MUSE_API_KEY ?? env.META_API_KEY;
            if (!key) throw new Error("The explicitly selected Muse API key is unavailable.");
            context.env.META_API_KEY = key;
            context.redactor.add(key);
          }
          const client =
            harness === "codex"
              ? new CodexClient(
                  available.executable as string,
                  context,
                  workspace,
                  () => "http://127.0.0.1:1",
                )
              : new MuseClient(
                  available.executable as string,
                  context,
                  workspace,
                  () => "http://127.0.0.1:1",
                  "",
                  [],
                  "muse-spark-1.3",
                );
          clients.push(client);
          await client.initialize();
          if (client instanceof MuseClient)
            await client.start({ model_id: "muse-spark-1.3", reasoning: "medium" });
          const catalog = await client.skills();
          const nativeDiscovered = catalog.some((item) => item.name.includes(`${actor}-private`));
          if (harness === "codex") expect(nativeDiscovered).toBe(true);
          expect(
            catalog.some((item) =>
              item.name.includes(`${actor === "alice" ? "bob" : "alice"}-private`),
            ),
          ).toBe(false);
          const packages = inheritedSkills(context, harness);
          const own = packages.skills.find((item) => item.name === `${actor}-private`);
          expect(own?.package.instructions).toContain(marker);
          expect(
            packages.skills.some(
              (item) => item.name === `${actor === "alice" ? "bob" : "alice"}-private`,
            ),
          ).toBe(false);
          expect(readFileSync(join(skillRoot, "SKILL.md"), "utf8")).toContain(marker);
          (report.lanes as unknown[]).push({
            harness,
            actor,
            version: available.version,
            native_catalog: true,
            native_package_discovery: nativeDiscovered,
            application_package_read: true,
            foreign_package_absent: true,
            package_sha256: own?.sha256,
          });
          await client.close();
        }
      }
      report.completed = true;
    } finally {
      for (const client of clients) await client.close();
      if (process.env.NGERTIIN_NMA078_NATIVE_REPORT)
        writeFileSync(
          process.env.NGERTIIN_NMA078_NATIVE_REPORT,
          `${JSON.stringify(report, null, 2)}\n`,
        );
      await f.close();
    }
  },
  180_000,
);
