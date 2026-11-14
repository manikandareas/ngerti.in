import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../../..");
const image =
  "postgres:18.1-alpine@sha256:aa6eb304ddb6dd26df23d05db4e5cb05af8951cda3e0dc57731b771e0ef4ab29";
let container: string | undefined;
let interrupted = false;
let stopTests = () => {};
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    interrupted = true;
    stopTests();
  });
async function docker(args: string[]) {
  const child = Bun.spawn(["docker", ...args], { stdout: "pipe", stderr: "pipe" });
  const [output, error, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) throw new Error(`Disposable PostgreSQL setup failed: ${error.trim()}`);
  return output.trim();
}
try {
  let database = process.env.NGERTIIN_TEST_DATABASE_URL;
  if (!database) {
    const password = crypto.randomUUID();
    container = await docker([
      "run",
      "-d",
      "--rm",
      "--label",
      "ngertiin.verification=nma-072",
      "--tmpfs",
      "/var/lib/postgresql",
      "-e",
      `POSTGRES_PASSWORD=${password}`,
      "-e",
      "POSTGRES_DB=ngertiin_test",
      "-p",
      "127.0.0.1::5432",
      image,
    ]);
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      const child = Bun.spawn(
        [
          "docker",
          "exec",
          container,
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
      if ((await child.exited) === 0) {
        ready = true;
        break;
      }
      await Bun.sleep(200);
    }
    if (interrupted) throw new Error("Verification interrupted.");
    if (!ready) throw new Error("Disposable PostgreSQL did not become ready.");
    const mapping = await docker(["port", container, "5432/tcp"]);
    const port = mapping.match(/^127\.0\.0\.1:(\d+)$/)?.[1];
    if (!port) throw new Error("Disposable PostgreSQL port was not bound to loopback.");
    database = `postgresql://postgres:${password}@127.0.0.1:${port}/ngertiin_test`;
  }
  const paths = process.argv.slice(2);
  const child = Bun.spawn(
    [process.execPath, "test", "--timeout", "45000", ...(paths.length ? paths : ["tests"])],
    {
      cwd: resolve(root, "apps/server"),
      env: { ...process.env, NGERTIIN_TEST_DATABASE_URL: database,NGERTIIN_APPLICATION_DATABASE_URL:database },
      stdout: "inherit",
      stderr: "inherit",
      stdin: "inherit",
    },
  );
  stopTests = () => child.kill("SIGTERM");
  if (interrupted) stopTests();
  process.exitCode = await child.exited;
} finally {
  if (container) await docker(["rm", "-f", container]);
}
