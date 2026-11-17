import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";

// Host-side test for the isolated disposable VM. The operator tunnel never replaces app auth.
const origin = "https://192.168.139.179";
const children = new Set<ReturnType<typeof spawn>>();
const relay = createServer((socket) => {
  const child = spawn(
    "orbctl",
    [
      "run",
      "-m",
      "ngertiin-nma082",
      "-u",
      "root",
      "python3",
      "-u",
      "/opt/ngertiin/current/scripts/verification/nma082/stdio-relay.py",
    ],
    { stdio: ["pipe", "pipe", "ignore"] },
  );
  children.add(child);
  child.stdin?.on("error", () => socket.destroy());
  child.on("error", () => socket.destroy());
  if (child.stdin) socket.pipe(child.stdin);
  child.stdout?.pipe(socket);
  socket.on("close", () => child.kill("SIGTERM"));
  child.on("close", () => {
    children.delete(child);
    socket.end();
  });
});
await new Promise<void>((resolve, reject) => {
  relay.once("error", reject);
  relay.listen(44482, "127.0.0.1", resolve);
});
try {
  const checks = [];
  for (const [path, expected] of [
    ["/", 200],
    ["/health/live", 200],
    ["/v1/contracts", 401],
    ["/v1/harness/tools", 404],
    ["/health/ready", 404],
  ] as const) {
    const child = Bun.spawn(
      [
        "curl",
        "--silent",
        "--show-error",
        "--noproxy",
        "*",
        "--max-time",
        "5",
        "--cacert",
        resolve(".dev/nma082/ca.pem"),
        "--connect-to",
        "192.168.139.179:443:127.0.0.1:44482",
        "--output",
        "/dev/null",
        "--write-out",
        "%{http_code}",
        `${origin}${path}`,
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const status = Number(await new Response(child.stdout).text());
    const diagnostic = await new Response(child.stderr).text();
    checks.push({
      path,
      expected,
      observed: status,
      pass: (await child.exited) === 0 && status === expected,
      ...(diagnostic ? { diagnostic: diagnostic.slice(0, 400) } : {}),
    });
  }
  const report = {
    client: "macOS ARM64",
    server: "isolated disposable Ubuntu 24.04 ARM64 VM",
    transport:
      "Operator OrbStack stdio channel forwards only the declared VM HTTPS ingress; certificate identity and chain validated with request-scoped CA and original Host/SNI. No system trust changes.",
    checks,
    pass: checks.filter((check) => check.pass).length,
    fail: checks.filter((check) => !check.pass).length,
    limits:
      "Direct VM IP connection from macOS is unavailable in this isolated VM configuration. Public DNS/ACME, direct-network reachability and actual Tauri journeys remain unverified.",
  };
  writeFileSync(".dev/verification/nma-082/remote-ingress.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ pass: report.pass, fail: report.fail }));
  if (report.fail) process.exitCode = 1;
} finally {
  for (const child of children) child.kill("SIGTERM");
  await new Promise<void>((resolve) => relay.close(() => resolve()));
}
