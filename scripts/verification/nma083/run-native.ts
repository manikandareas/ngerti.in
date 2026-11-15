import { resolve } from "node:path";

const image =
  "postgres:18.1-alpine@sha256:aa6eb304ddb6dd26df23d05db4e5cb05af8951cda3e0dc57731b771e0ef4ab29";
async function docker(args: string[]) {
  const child = Bun.spawn(["docker", ...args], { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code) throw new Error(`Disposable acceptance database failed: ${err.trim()}`);
  return out.trim();
}
let container: string | undefined;
let child: ReturnType<typeof Bun.spawn> | undefined;
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child?.kill(signal));
try {
  const password = crypto.randomUUID();
  container = await docker([
    "run",
    "-d",
    "--rm",
    "--label",
    "ngertiin.verification=nma-083",
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
  for (let index = 0; index < 100; index++) {
    const probe = Bun.spawn(["docker", "exec", container, "pg_isready", "-U", "postgres"], {
      stdout: "ignore",
      stderr: "ignore",
    });
    if ((await probe.exited) === 0) {
      ready = true;
      break;
    }
    await Bun.sleep(200);
  }
  if (!ready) throw new Error("Disposable PostgreSQL did not become ready.");
  const port = (await docker(["port", container, "5432/tcp"])).match(/^127\.0\.0\.1:(\d+)$/)?.[1];
  if (!port) throw new Error("The acceptance database must bind only loopback.");
  const database = `postgresql://postgres:${password}@127.0.0.1:${port}/ngertiin_test`;
  child = Bun.spawn([process.execPath, "scripts/verification/nma083/serve.ts"], {
    cwd: resolve(import.meta.dir, "../../.."),
    env: {
      ...process.env,
      NGERTIIN_TEST_DATABASE_URL: database,
      NGERTIIN_APPLICATION_DATABASE_URL: database,
    },
    stdout: "inherit",
    stderr: "inherit",
  });
  process.exitCode = await child.exited;
} finally {
  if (container) await docker(["rm", "-f", container]);
}
