import { join } from "node:path";
import { developmentExecutable } from "./dev-bundle";
import { prepareRuntime } from "./prepare-runtime";
import { loadProfile } from "./profile";
import { cargo, native, root, run, toolchainEnv } from "./toolchain";

const profile = loadProfile();
let server: { close(): Promise<void> } | undefined;
let url = process.env.NGERTIIN_DESKTOP_VITE_URL;
if (!url) {
  await run([process.execPath, "run", "build:web-client"], root);
  const { createServer } = await import("vite");
  const vite = await createServer({
    root: join(root, "apps/web-client"),
    configFile: join(root, "apps/web-client/vite.config.ts"),
    server: { host: "127.0.0.1", port: 0, strictPort: false },
  });
  await vite.listen();
  server = vite;
  url = vite.resolvedUrls?.local[0];
}
if (!url) throw new Error("The UI development server did not start.");
let child: ReturnType<typeof Bun.spawn> | undefined;
let closing = false;
const close = () => {
  closing = true;
  child?.kill("SIGTERM");
};
process.on("SIGINT", close);
process.on("SIGTERM", close);
try {
  await prepareRuntime();
  if (!closing) {
    child = Bun.spawn([cargo, "build", "-j", "2"], {
      cwd: native,
      env: toolchainEnv,
      stdout: "inherit",
      stderr: "inherit",
    });
    const compiled = await child.exited;
    if (compiled && !closing) throw new Error("The desktop build failed.");
    const executable = closing ? undefined : await developmentExecutable();
    if (!closing && executable) {
      child = Bun.spawn([executable], {
        cwd: native,
        env: { ...toolchainEnv, NGERTIIN_DESKTOP_VITE_URL: url },
        stdin: "ignore",
        stdout: "inherit",
        stderr: "inherit",
      });
      console.log(`Opening account-authenticated Tauri client on port ${profile.uiPort}.`);
      process.exitCode = await child.exited;
    }
  }
} finally {
  await server?.close();
}
