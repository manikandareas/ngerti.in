import { spawn } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron, expect, test } from "@playwright/test";
import electronPath from "electron";
import { findExecutable } from "../src/profile";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const bun = process.env.NGERTIIN_TEST_BUN ?? findExecutable("bun") ?? "bun";
async function prepare() {
  const home = mkdtempSync(join(tmpdir(), "ngertiin-electron-"));
  const child = spawn(bun, [join(root, "apps/desktop/scripts/setup.ts")], {
    env: { ...process.env, NGERTIIN_DESKTOP_HOME: home, NGERTIIN_STATE_DIR: join(home, "state") },
    stdio: "pipe",
  });
  await new Promise<void>((ok, fail) => {
    child.on("error", fail);
    child.on("exit", (code) => (code === 0 ? ok() : fail(new Error("Setup failed"))));
  });
  const profile = JSON.parse(readFileSync(join(home, "profile.json"), "utf8"));
  if (process.env.NGERTIIN_PACKAGED_EXECUTABLE) {
    profile.bunExecutable = "/unavailable/local-bun";
    profile.projectRoot = "/unavailable/source-checkout";
  }
  profile.configFile = join(home, "empty.env");
  writeFileSync(profile.configFile, "NGERTIIN_GROUP_ROUTER=member\nTYPESAFE_API_KEY=\n", {
    mode: 0o600,
  });
  writeFileSync(join(home, "profile.json"), JSON.stringify(profile), { mode: 0o600 });
  return { home, profile };
}
async function launch(home: string) {
  return electron.launch({
    executablePath: process.env.NGERTIIN_PACKAGED_EXECUTABLE ?? (electronPath as unknown as string),
    args: process.env.NGERTIIN_PACKAGED_EXECUTABLE ? [] : [join(root, "apps/desktop")],
    env: {
      ...process.env,
      NGERTIIN_DESKTOP_HOME: home,
      NGERTIIN_GROUP_ROUTER: "member",
      TYPESAFE_API_KEY: "",
    },
  });
}

test("close/reopen, duplicate launch, reload, renderer crash and Quit preserve one backend", async () => {
  const f = await prepare();
  let application: Awaited<ReturnType<typeof launch>> | undefined;
  try {
    application = await launch(f.home);
    expect(await application.evaluate(({ app }) => app.isPackaged)).toBe(
      !!process.env.NGERTIIN_PACKAGED_EXECUTABLE,
    );
    const page = await application.firstWindow();
    page.on("pageerror", (error) => console.log("desktop renderer error:", error.message));
    page.on("console", (message) => {
      if (message.type() === "error") console.log("desktop console:", message.text());
    });

    await page.waitForFunction(
      async () => (await (await fetch("/_desktop/status")).json()).state === "ready",
    );
    await expect(page.getByText("Tobi", { exact: true }).first()).toBeVisible({ timeout: 20000 });
    expect(
      await page.evaluate(() => typeof (window as unknown as { require: unknown }).require),
    ).toBe("undefined");
    expect(await page.evaluate(() => typeof window.ngertiinDesktop?.onVisibility)).toBe("function");
    const runtime = JSON.parse(
      readFileSync(join(f.profile.stateDirectory, "runtime.json"), "utf8"),
    );
    await page.evaluate(() =>
      localStorage.setItem(
        "ngertiin:pending:desktop-proof",
        JSON.stringify({ key: "stable-key", body: { text: "Unacknowledged draft" } }),
      ),
    );
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    expect(
      await application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].isVisible(),
      ),
    ).toBe(false);
    expect((await fetch(`${runtime.url}/health/live`)).ok).toBe(true);
    await application.evaluate(({ app }) => app.emit("activate", {}, false));
    await expect
      .poll(() =>
        application?.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
      )
      .toBe(true);
    const second = spawn(
      process.env.NGERTIIN_PACKAGED_EXECUTABLE ?? (electronPath as unknown as string),
      process.env.NGERTIIN_PACKAGED_EXECUTABLE ? [] : [join(root, "apps/desktop")],
      { env: { ...process.env, NGERTIIN_DESKTOP_HOME: f.home }, stdio: "ignore" },
    );
    const secondCode = await new Promise<number | null>((ok) => second.on("exit", ok));
    expect(secondCode).toBe(0);
    expect(
      JSON.parse(readFileSync(join(f.profile.stateDirectory, "runtime.json"), "utf8")).instance_id,
    ).toBe(runtime.instance_id);
    await page.reload();
    await expect(page.getByText("Tobi", { exact: true }).first()).toBeVisible({ timeout: 20000 });
    expect(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem("ngertiin:pending:desktop-proof") ?? "null").key,
      ),
    ).toBe("stable-key");
    await application.evaluate(
      ({ BrowserWindow }) =>
        new Promise<void>((resolve) => {
          const contents = BrowserWindow.getAllWindows()[0].webContents;
          contents.once("did-finish-load", () => resolve());
          contents.forcefullyCrashRenderer();
        }),
    );
    // The original CDP Page stays marked crashed; inspect the replacement renderer through Electron.
    await expect
      .poll(() =>
        application?.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0].webContents.executeJavaScript(
            'document.body.innerText.includes("Tobi")',
          ),
        ),
      )
      .toBe(true);
    expect(
      JSON.parse(readFileSync(join(f.profile.stateDirectory, "runtime.json"), "utf8")).instance_id,
    ).toBe(runtime.instance_id);
    await application.evaluate(({ powerMonitor }) => {
      powerMonitor.emit("suspend");
      powerMonitor.emit("resume");
    });
    // The original CDP Page stays marked crashed; inspect the replacement renderer through Electron.
    await expect
      .poll(() =>
        application?.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0].webContents.executeJavaScript(
            'document.body.innerText.includes("Tobi")',
          ),
        ),
      )
      .toBe(true);
    const screenshot = await application.evaluate(async ({ BrowserWindow }) =>
      (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString("base64"),
    );
    writeFileSync(join(root, ".dev/electron-workspace.png"), Buffer.from(screenshot, "base64"));
    await application.close();
    application = undefined;
    await expect
      .poll(() => {
        try {
          readFileSync(join(f.profile.stateDirectory, "runtime.json"));
          return true;
        } catch {
          return false;
        }
      })
      .toBe(false);
  } finally {
    await application?.close();
    rmSync(f.home, { recursive: true, force: true });
  }
});

test("persistent origin and Chromium storage survive a full application restart", async () => {
  const f = await prepare();
  let application: Awaited<ReturnType<typeof launch>> | undefined;
  try {
    application = await launch(f.home);
    let page = await application.firstWindow();
    await page.waitForFunction(
      async () => (await (await fetch("/_desktop/status")).json()).state === "ready",
    );
    await page.evaluate(() =>
      localStorage.setItem("ngertiin:pending:restart-proof", "original-receipt-key"),
    );
    const origin = new URL(page.url()).origin;
    await application.close();
    application = undefined;
    application = await launch(f.home);
    page = await application.firstWindow();
    await page.waitForFunction(
      async () => (await (await fetch("/_desktop/status")).json()).state === "ready",
    );
    expect(new URL(page.url()).origin).toBe(origin);
    expect(await page.evaluate(() => localStorage.getItem("ngertiin:pending:restart-proof"))).toBe(
      "original-receipt-key",
    );
  } finally {
    await application?.close();
    rmSync(f.home, { recursive: true, force: true });
  }
});

test("Vite UI and its HMR WebSocket work through the stable gateway", async () => {
  test.skip(!!process.env.NGERTIIN_PACKAGED_EXECUTABLE, "Packaged mode serves built assets.");
  const { createServer } = await import("vite");
  const server = await createServer({
    root: join(root, "apps/web-client"),
    configFile: join(root, "apps/web-client/vite.config.ts"),
    server: { host: "127.0.0.1", port: 0, strictPort: false },
  });
  await server.listen();
  const f = await prepare();
  let application: Awaited<ReturnType<typeof launch>> | undefined;
  const previous = process.env.NGERTIIN_DESKTOP_VITE_URL;
  let connections = 0;
  server.ws.on("connection", () => connections++);
  try {
    process.env.NGERTIIN_DESKTOP_VITE_URL = server.resolvedUrls?.local[0];
    application = await launch(f.home);
    const page = await application.firstWindow();
    await page.waitForFunction(
      async () => (await (await fetch("/_desktop/status")).json()).state === "ready",
    );
    await expect(page.getByText("Tobi", { exact: true }).first()).toBeVisible({ timeout: 20000 });
    await expect.poll(() => connections).toBeGreaterThan(0);
    await page.evaluate(async () => {
      const path = "/@vite/client";
      const { createHotContext } = await import(path);
      createHotContext("/desktop-proof").on("ngertiin:proof", (data: string) => {
        (window as unknown as { hmrProof: string }).hmrProof = data;
      });
    });
    server.ws.send({ type: "custom", event: "ngertiin:proof", data: "received-through-gateway" });
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { hmrProof: string }).hmrProof))
      .toBe("received-through-gateway");
  } finally {
    if (previous === undefined) delete process.env.NGERTIIN_DESKTOP_VITE_URL;
    else process.env.NGERTIIN_DESKTOP_VITE_URL = previous;
    await application?.close();
    await server.close();
    f.home && rmSync(f.home, { recursive: true, force: true });
  }
});

test("Computer renders the retained desktop read-only and closes its viewer on hide", async () => {
  test.skip(
    !process.env.NGERTIIN_TEST_MACHINE_STATE,
    "Requires an explicitly selected local Cua installation.",
  );
  test.setTimeout(90000);
  const f = await prepare();
  mkdirSync(f.profile.stateDirectory, { recursive: true, mode: 0o700 });
  for (const name of ["machine.json", "machine.env"]) {
    copyFileSync(
      join(process.env.NGERTIIN_TEST_MACHINE_STATE as string, name),
      join(f.profile.stateDirectory, name),
    );
    chmodSync(join(f.profile.stateDirectory, name), 0o600);
  }
  let application: Awaited<ReturnType<typeof launch>> | undefined;
  try {
    application = await launch(f.home);
    const page = await application.firstWindow();
    await page.waitForFunction(
      async () => (await (await fetch("/_desktop/status")).json()).state === "ready",
    );
    await page.getByRole("button", { name: "Detail Tobi", exact: true }).click({ timeout: 30000 });
    await page.getByRole("tab", { name: "Computer", exact: true }).click();
    const button = page.getByRole("button", { name: "View desktop", exact: true });
    await expect(button).toBeEnabled({ timeout: 30000 });
    await button.click();
    const frame = page.frameLocator('iframe[title="Agent desktop"]');
    await expect(frame.locator("canvas").first()).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole("button", { name: "Take control", exact: true })).toBeVisible();
    await expect
      .poll(
        () =>
          frame
            .locator("canvas")
            .first()
            .evaluate((element) => (element as HTMLCanvasElement).width),
        { timeout: 30000 },
      )
      .toBeGreaterThan(1);
    await expect
      .poll(
        () =>
          frame
            .locator("canvas")
            .first()
            .evaluate((element) => (element as HTMLCanvasElement).height),
        { timeout: 30000 },
      )
      .toBeGreaterThan(1);
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    await application.evaluate(({ app }) => app.emit("activate", {}, false));
    await expect(
      page.getByRole("dialog", { name: "Shared desktop", exact: true }),
    ).not.toBeVisible();
    const machine = await page.evaluate(async () => await (await fetch("/v1/machine")).json());
    expect(machine.lease.holder).toBe("none");
  } finally {
    await application?.close();
    rmSync(f.home, { recursive: true, force: true });
  }
});
