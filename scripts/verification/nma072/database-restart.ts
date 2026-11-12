import { Artifacts } from "../../../apps/server/src/artifacts";
import { Workspaces } from "../../../apps/server/src/workspaces/service";
import { fixture } from "../../../apps/server/tests/helpers";

const image =
  "postgres:18.1-alpine@sha256:aa6eb304ddb6dd26df23d05db4e5cb05af8951cda3e0dc57731b771e0ef4ab29";
const name = `ngertiin-nma072-restart-${crypto.randomUUID()}`;
const password = crypto.randomUUID();
let container: string | undefined,
  volume: string | undefined,
  f: Awaited<ReturnType<typeof fixture>> | undefined;
async function docker(args: string[]) {
  const child = Bun.spawn(["docker", ...args], { stdout: "pipe", stderr: "pipe" });
  const [output, error, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code) throw new Error(`Disposable restart probe failed: ${error.trim()}`);
  return output.trim();
}
async function ready() {
  for (let i = 0; i < 100; i++) {
    const child = Bun.spawn(
      [
        "docker",
        "exec",
        name,
        "pg_isready",
        "-h",
        "127.0.0.1",
        "-p",
        "5432",
        "-U",
        "postgres",
        "-d",
        "ngertiin_test",
      ],
      { stdout: "ignore", stderr: "ignore" },
    );
    if ((await child.exited) === 0) return;
    await Bun.sleep(200);
  }
  throw new Error("Disposable restart database is unavailable.");
}
async function selectDatabase() {
  const mapping = await docker(["port", name, "5432/tcp"]);
  const port = mapping.match(/^127\.0\.0\.1:(\d+)$/)?.[1];
  if (!port) throw new Error("Restart probe requires loopback binding.");
  const url = `postgresql://postgres:${password}@127.0.0.1:${port}/ngertiin_test`;
  process.env.NGERTIIN_TEST_DATABASE_URL = url;
  if (f) f.options.connectionString = url;
}
let phase = "create";
try {
  volume = await docker(["volume", "create", "--label", "ngertiin.verification=nma-072", name]);
  container = await docker([
    "run",
    "-d",
    "--name",
    name,
    "--label",
    "ngertiin.verification=nma-072",
    "-e",
    `POSTGRES_PASSWORD=${password}`,
    "-e",
    "POSTGRES_DB=ngertiin_test",
    "-p",
    "127.0.0.1::5432",
    "-v",
    `${volume}:/var/lib/postgresql`,
    image,
  ]);
  await ready();
  await selectDatabase();
  phase = "seed";
  f = await fixture();
  await f.bind();
  const workspace = await new Workspaces(f.lifecycle).ensure(f.thread.id, f.agent.id);
  const artifact = await new Artifacts(f.lifecycle).upload(workspace.id, crypto.randomUUID(), {
    name: "restart.txt",
    media_type: "text/plain",
    content_base64: Buffer.from("Persisted outside SQL").toString("base64"),
  });
  const admit = f.admit;
  const operation = crypto.randomUUID(),
    input = { operation: "database_restart" };
  const admitted = await f.store.command(operation, input, () => admit("Survive database restart"));
  const claim = await f.lifecycle.claimNext(f.thread.id, f.agent.id);
  if (!claim?.dispatch_token) throw new Error("Restart run was not claimed.");
  await f.lifecycle.started(claim.id, claim.dispatch_token, "database-restart-native");
  const before = (
    await f.store.query(
      "SELECT pg_postmaster_start_time() AS started,current_setting('fsync') AS fsync,current_setting('synchronous_commit') AS synchronous_commit,version() AS version",
    )
  ).rows[0];
  const events = await f.store.events(0, 1000),
    epoch = f.store.epoch;
  phase = "close";
  await f.store.close();
  phase = "restart";
  await docker(["restart", name]);
  await ready();
  await selectDatabase();
  phase = "reopen";
  await f.restart();
  phase = "reconcile";
  const after = (await f.store.query("SELECT pg_postmaster_start_time() AS started")).rows[0];
  const receipt = await f.store.command<typeof admitted>(operation, input, () => {
    throw new Error("Duplicate restart admission.");
  });
  const run = await f.store.get("run", admitted.run.id),
    persisted = await f.store.events(0, 1000),
    bytes = await new Artifacts(f.lifecycle).download(artifact.id, workspace.id);
  await f.admit("Remain queued behind unknown native work after database restart");
  const checks = {
    database_restarted: new Date(before.started).getTime() !== new Date(after.started).getTime(),
    receipt_identity: receipt.run.id === admitted.run.id,
    event_prefix: JSON.stringify(persisted.slice(0, events.length)) === JSON.stringify(events),
    native_work_unknown:
      run.status === "unknown" && run.native_run_id === "database-restart-native",
    epoch_advanced: f.store.epoch > epoch,
    immutable_artifact: bytes.bytes.toString() === "Persisted outside SQL",
    unknown_lane_fenced: (await f.lifecycle.claimNext(f.thread.id, f.agent.id)) === null,
  };
  if (Object.values(checks).some((value) => !value))
    throw new Error("Database restart reconciliation failed.");
  console.log(
    JSON.stringify(
      {
        verified_at: new Date().toISOString(),
        image,
        bun: Bun.version,
        postgres: before.version,
        settings: { fsync: before.fsync, synchronous_commit: before.synchronous_commit },
        checks,
        pass: Object.values(checks).length,
        fail: 0,
        limitations: [
          "Disposable PostgreSQL container restart with an owned disk volume; not a power-loss or production restore proof.",
          "No provider login, inference, credential restore or multi-user acceptance.",
        ],
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(JSON.stringify({ event: "database_restart_probe_failed", phase }));
  throw error;
} finally {
  await f?.close().catch(() => {});
  if (container) await docker(["rm", "-f", name]);
  if (volume) await docker(["volume", "rm", volume]);
}
