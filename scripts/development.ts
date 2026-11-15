import { createServer as createTcpServer } from "node:net";
import { join } from "node:path";
import { createServer } from "vite";
import { setupDesktop } from "../apps/desktop/scripts/setup";
import { startDevelopmentInbox } from "../apps/server/src/auth/inbox";
import { developmentConfig } from "../apps/server/src/config";

const root = join(import.meta.dir, "..");
const config = developmentConfig();
if (process.env.APP_ENV === "production")
  throw new Error("Use the deployed server entry point in production.");
const webPort = Number(new URL(config.authentication.origin).port || 3001);
if (
  new URL(config.authentication.origin).hostname !== "127.0.0.1" ||
  new URL(config.authentication.origin).protocol !== "http:"
)
  throw new Error("The local development workspace uses an explicit IPv4 loopback HTTP origin.");
const apiUrl = `http://127.0.0.1:${config.port}`;
const desktopHome = process.env.NGERTIIN_DESKTOP_HOME || join(root, ".dev/development-client");
const environment = {
  ...process.env,
  APP_ENV: "development",
  NGERTIIN_AUTH_URL: config.authentication.origin,
  NGERTIIN_API_URL: apiUrl,
  NGERTIIN_DESKTOP_HOME: desktopHome,
};
const children: ReturnType<typeof Bun.spawn>[] = [];
let vite: Awaited<ReturnType<typeof createServer>> | undefined;
let inbox: ReturnType<typeof startDevelopmentInbox> | undefined;
let finish = () => {};
let closing = false;
const stopped = new Promise<void>((resolve) => {
  finish = resolve;
});
const stop = () => {
  closing = true;
  finish();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

async function requirePort(port: number) {
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Select valid development ports.");
  const listener = createTcpServer();
  await new Promise<void>((accept, reject) => {
    listener.once("error", () =>
      reject(
        new Error(`Development port ${port} is occupied. Stop the other development run first.`),
      ),
    );
    listener.listen(port, "127.0.0.1", () =>
      listener.close((error) => (error ? reject(error) : accept())),
    );
  });
}

try {
  const inboxPort = Number(process.env.NGERTIIN_DEV_INBOX_PORT || 8025);
  for (const port of [
    config.port,
    webPort,
    ...(config.authentication.email.delivery === "local" ? [inboxPort] : []),
  ])
    await requirePort(port);
  await setupDesktop(config.authentication.origin, desktopHome);
  const build = Bun.spawn([process.execPath, "run", "build:web-client"], {
    cwd: root,
    env: environment,
    stdout: "inherit",
    stderr: "inherit",
  });
  children.push(build);
  const built = await Promise.race([build.exited, stopped.then(() => null)]);
  if (built === null) throw new Error("Development startup was cancelled.");
  if (built) throw new Error("The shared UI build failed.");
  const api = Bun.spawn([process.execPath, "apps/server/src/main.ts"], {
    cwd: root,
    env: environment,
    stdout: "inherit",
    stderr: "inherit",
  });
  children.push(api);
  let available = false;
  for (let attempt = 0; attempt < 150; attempt++) {
    if (closing) break;
    if (api.exitCode !== null) throw new Error("The development server exited during startup.");
    const record = await Bun.file(join(config.stateDir, "runtime.json"))
      .json()
      .catch(() => null);
    available =
      record?.pid === api.pid &&
      (await fetch(`${apiUrl}/health/live`, { signal: AbortSignal.timeout(500) }).then(
        (response) => response.ok,
        () => false,
      ));
    if (available) break;
    await Promise.race([Bun.sleep(100), stopped]);
  }
  if (!available) throw new Error("The development server did not become available.");
  Object.assign(process.env, {
    NGERTIIN_API_URL: apiUrl,
    NGERTIIN_AUTH_URL: config.authentication.origin,
  });
  vite = await createServer({
    root: join(root, "apps/web-client"),
    configFile: join(root, "apps/web-client/vite.config.ts"),
    server: { host: "127.0.0.1", port: webPort, strictPort: true },
  });
  await vite.listen();
  const url = vite.resolvedUrls?.local[0];
  if (!url) throw new Error("The web development server did not start.");
  if (config.authentication.email.delivery === "local")
    inbox = startDevelopmentInbox(config.authentication.email.directory, inboxPort);
  const desktop = Bun.spawn([process.execPath, "--no-env-file", "apps/desktop/scripts/dev.ts"], {
    cwd: root,
    env: {
      ...Object.fromEntries(
        Object.entries(process.env).filter(([key]) =>
          [
            "PATH",
            "HOME",
            "USER",
            "LOGNAME",
            "TMPDIR",
            "LANG",
            "TERM",
            "SHELL",
            "CARGO_HOME",
            "RUSTUP_HOME",
            "CARGO_TARGET_DIR",
            "SDKROOT",
            "DEVELOPER_DIR",
          ].includes(key),
        ),
      ),
      APP_ENV: "development",
      NGERTIIN_DESKTOP_HOME: desktopHome,
      NGERTIIN_DESKTOP_VITE_URL: url,
    },
    stdout: "inherit",
    stderr: "inherit",
  });
  children.push(desktop);
  console.log(
    `Web: ${url}\nAPI: ${apiUrl}${inbox ? `\nEmail inbox: http://127.0.0.1:${inbox.port}` : ""}\nAccount authentication and organizations are enabled.`,
  );
  const desktopFailed = desktop.exited.then((code) => {
    if (code) throw new Error(`The desktop client exited (${code}).`);
    console.log("Desktop closed. The development server and web remain running until Ctrl+C.");
    return new Promise<never>(() => {});
  });
  await Promise.race([
    stopped,
    desktopFailed,
    api.exited.then(() => {
      throw new Error("The development server exited.");
    }),
  ]);
} finally {
  for (const child of [...children].reverse()) if (child.exitCode === null) child.kill("SIGTERM");
  await vite?.close();
  await inbox?.stop(true);
  await Promise.all(
    children.map(async (child) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        child.exited,
        new Promise<void>((resolve) => {
          timer = setTimeout(() => {
            if (child.exitCode === null) child.kill("SIGKILL");
            resolve();
          }, 8000);
        }),
      ]);
      clearTimeout(timer);
      await child.exited;
    }),
  );
}
