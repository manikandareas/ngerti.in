import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { DomainRuntime, readDomainPolicy } from "../machines/domain-runtime";
import { assertDatabaseTarget, offlineDatabase } from "./database";
import { type OperationsConfig, privateDirectory, run } from "./files";

export async function serviceActive(config: OperationsConfig) {
  return (
    (await run(["systemctl", "show", config.service, "--property=ActiveState", "--value"])) ===
    "active"
  );
}

/** A failed drill remains stopped for inspection; never resume after an uncertain external effect. */
export async function maintenance<T>(
  config: OperationsConfig,
  env: Record<string, string>,
  action: (database: Awaited<ReturnType<typeof offlineDatabase>>) => Promise<T>,
) {
  privateDirectory(dirname(config.state_dir));
  const lock = `${config.state_dir}.maintenance`;
  mkdirSync(lock, { mode: 0o700 });
  let database: Awaited<ReturnType<typeof offlineDatabase>> | undefined;
  try {
    await run(["systemctl", "stop", config.service]);
    if (await serviceActive(config))
      throw new Error("The application must stop before maintenance.");
    database = await offlineDatabase(env);
    await assertDatabaseTarget(database, config);
    return await action(database);
  } finally {
    await database?.end();
    rmSync(lock, { recursive: true });
  }
}

export async function retainedDomains(config: OperationsConfig, assetsDirectory?: string) {
  privateDirectory(config.state_dir);
  const installation = z
    .strictObject({ owner_id: z.uuid(), token: z.string() })
    .parse(JSON.parse(readFileSync(join(config.state_dir, "installation.json"), "utf8")));
  const runtime = new DomainRuntime(
    config.state_dir,
    installation.owner_id,
    readDomainPolicy(config.state_dir),
    assetsDirectory,
  );
  const directory = join(config.state_dir, "execution-domains");
  const ids: string[] = [];
  const running: string[] = [];
  if (existsSync(directory)) {
    for (const file of new Bun.Glob("*.json").scanSync(directory)) {
      const id = z.uuid().parse(file.slice(0, -5));
      const retained = runtime.configuration(id, false);
      if (retained.phase === "new") {
        if (await runtime.inspect(id)) throw new Error("Unreconciled new execution domain.");
        continue;
      }
      const observed = await runtime.inspect(id);
      if (!observed || retained.phase !== "retained")
        throw new Error("Reconcile missing or uncertain domains before backup.");
      runtime.attest(observed, retained);
      ids.push(id);
      if (observed.State.Running) running.push(id);
    }
  }
  const containers = await run([
    "docker",
    "ps",
    "-aq",
    "--filter",
    `label=io.ngertiin.installation=${installation.owner_id}`,
    "--filter",
    "label=io.ngertiin.resource=execution-domain",
  ]);
  if (containers.split("\n").filter(Boolean).length !== ids.length)
    throw new Error("Unrecorded execution domains prevent a coordinated backup.");
  return { installation: installation.owner_id, ids: ids.sort(), running };
}
