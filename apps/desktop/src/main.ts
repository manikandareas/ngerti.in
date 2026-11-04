import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  powerMonitor,
  session,
  shell,
  Tray,
} from "electron";
import { startGateway } from "./gateway";
import { createLog } from "./log";
import {
  desktopHome,
  loadProfile,
  prepareHome,
  privateJson,
  profileEnvironment,
  writePrivate,
} from "./profile";
import { Supervisor } from "./supervisor";

app.setName("Ngertiin Dev");
const home = prepareHome(desktopHome());
const chromium = join(home, "chromium");
mkdirSync(chromium, { recursive: true, mode: 0o700 });
app.setPath("userData", chromium);
const primary = app.requestSingleInstanceLock();
if (!primary) app.quit();
let window: BrowserWindow | undefined;
let tray: Tray | undefined;
let supervisor: Supervisor | undefined;
let gateway: Awaited<ReturnType<typeof startGateway>> | undefined;
let computerRevision: number | undefined;
function releaseControl(): Promise<void> | undefined {
  const revision = computerRevision;
  computerRevision = undefined;
  return supervisor?.releaseHuman(revision);
}
let quitting = false;
let shutdown: Promise<void> | undefined;
const log = createLog(home);
function show(): void {
  if (window?.isDestroyed()) window = undefined;
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
  window.webContents.send("desktop:visibility", true);
  void supervisor?.check();
}
function hide(): void {
  window?.webContents.send("desktop:visibility", false);
  window?.hide();
  void releaseControl();
}
function external(value: string): void {
  try {
    const url = new URL(value);
    if (value.length > 8192 || url.username || url.password) return;
    if (
      url.protocol === "https:" ||
      (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    )
      void shell.openExternal(url.href);
  } catch {
    /* Untrusted links never become shell commands. */
  }
}
async function stop(): Promise<void> {
  shutdown ??= (async () => {
    quitting = true;
    log("desktop.stopping");
    window?.webContents.send("desktop:visibility", false);
    await releaseControl();
    await supervisor?.stop();
    await gateway?.close();
    tray?.destroy();
    log("desktop.stopped");
  })();
  return shutdown;
}
function quit(): void {
  void stop().finally(() => app.exit(0));
}
if (primary) {
  app.on("second-instance", show);
  app.on("activate", show);
  app.on("window-all-closed", () => {});
  app.on("before-quit", (event) => {
    if (quitting && !shutdown) return;
    event.preventDefault();
    quit();
  });
  process.on("SIGTERM", quit);
  process.on("SIGINT", quit);
  void app
    .whenReady()
    .then(async () => {
      if (process.platform === "darwin") {
        app.dock?.setIcon(join(app.getAppPath(), "dist/app-icon.png"));
      }
      const profile = loadProfile(home);
      const root = app.isPackaged ? join(process.resourcesPath, "runtime") : profile.projectRoot;
      const bun = app.isPackaged ? join(root, "bin/bun") : profile.bunExecutable;
      const env = profileEnvironment(profile, bun);
      const secrets = Object.entries(env)
        .filter(([key]) => /key|token|secret|pass/i.test(key))
        .map(([, value]) => value)
        .filter((v): v is string => typeof v === "string");
      try {
        secrets.push(
          privateJson<{ token: string }>(join(profile.stateDirectory, "installation.json")).token,
        );
      } catch {
        /* New installation. */
      }
      const runtimeLog = createLog(home, secrets);
      supervisor = new Supervisor({
        profile,
        bun,
        root,
        serverEntry: join(root, "apps/server/src/main.ts"),
        log: runtimeLog,
        legacyUrl: env.NGERTIIN_API_URL,
      });
      const vite = !app.isPackaged ? process.env.NGERTIIN_DESKTOP_VITE_URL : undefined;
      gateway = await startGateway({
        port: profile.uiPort,
        assets: app.isPackaged
          ? join(process.resourcesPath, "web")
          : join(root, "apps/web-client/dist"),
        vite,
        token: () => supervisor?.token() ?? "",
        backend: () => supervisor?.backend,
        status: () =>
          supervisor?.status ?? { state: "starting", message: "Preparing your workspace…" },
        retry: () => {
          void supervisor?.start();
        },
        log: runtimeLog,
      });
      let saved = {
        width: 1280,
        height: 900,
        x: undefined as number | undefined,
        y: undefined as number | undefined,
        maximized: false,
      };
      try {
        saved = { ...saved, ...privateJson<typeof saved>(join(home, "window.json")) };
      } catch {
        /* First launch. */
      }
      const { screen } = await import("electron");
      const displays = screen.getAllDisplays();
      const visible = displays.some(
        (d) =>
          typeof saved.x === "number" &&
          typeof saved.y === "number" &&
          saved.x < d.workArea.x + d.workArea.width &&
          saved.x + saved.width > d.workArea.x &&
          saved.y < d.workArea.y + d.workArea.height &&
          saved.y + saved.height > d.workArea.y,
      );
      window = new BrowserWindow({
        title: "Ngertiin Dev",
        width: Math.max(720, saved.width),
        height: Math.max(500, saved.height),
        ...(visible ? { x: saved.x, y: saved.y } : {}),
        minWidth: 720,
        minHeight: 500,
        backgroundColor: "#171717",
        show: false,
        webPreferences: {
          preload: join(app.getAppPath(), "dist/preload.cjs"),
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webviewTag: false,
          backgroundThrottling: true,
        },
      });
      const win = window;
      if (saved.maximized) win.maximize();
      const origin = gateway.origin;
      ipcMain.on("desktop:computer-view", (event, active: unknown, revision: unknown) => {
        if (
          event.sender !== win.webContents ||
          event.senderFrame !== win.webContents.mainFrame ||
          typeof active !== "boolean" ||
          typeof revision !== "number" ||
          !Number.isSafeInteger(revision) ||
          revision < 0
        )
          return;
        try {
          if (new URL(event.senderFrame.url).origin !== origin) return;
        } catch {
          return;
        }
        if (active) computerRevision = revision;
        else if (computerRevision === revision) computerRevision = undefined;
      });

      const trusted = (value: string) => {
        try {
          return new URL(value).origin === origin;
        } catch {
          return false;
        }
      };
      session.defaultSession.setPermissionRequestHandler(
        (contents, permission, callback, details) => {
          const frame = details.requestingUrl;
          callback(
            contents === win.webContents &&
              win.isVisible() &&
              win.isFocused() &&
              trusted(frame) &&
              ["clipboard-read", "clipboard-sanitized-write"].includes(permission),
          );
        },
      );
      session.defaultSession.setPermissionCheckHandler(
        (_contents, permission, requestingOrigin) =>
          trusted(requestingOrigin) &&
          win.isVisible() &&
          ["clipboard-read", "clipboard-sanitized-write"].includes(permission),
      );
      win.webContents.setWindowOpenHandler(({ url }) => {
        if (trusted(url) && new URL(url).pathname.startsWith("/v1/"))
          win.webContents.downloadURL(url);
        else external(url);
        return { action: "deny" };
      });
      win.webContents.on("will-navigate", (event, url) => {
        if (!trusted(url)) {
          event.preventDefault();
          external(url);
        }
      });
      win.webContents.on("will-attach-webview", (event) => event.preventDefault());
      win.webContents.on("preload-error", (_event, _path, error) =>
        runtimeLog("desktop.preload.failed", { name: error.name }),
      );
      win.webContents.on("did-fail-load", (_event, code) =>
        runtimeLog("desktop.navigation.failed", { code }),
      );
      win.webContents.on("render-process-gone", (_event, details) => {
        runtimeLog("desktop.renderer.gone", { reason: details.reason });
        void releaseControl();
        if (!quitting && details.reason !== "clean-exit") void win.loadURL(origin);
      });
      win.on("close", (event) => {
        if (quitting) return;
        event.preventDefault();
        hide();
      });
      win.on("hide", () => {
        win.webContents.send("desktop:visibility", false);
        void releaseControl();
      });
      let saveTimer: ReturnType<typeof setTimeout> | undefined;
      const saveWindow = () => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          if (!win.isDestroyed())
            writePrivate(join(home, "window.json"), {
              ...win.getNormalBounds(),
              maximized: win.isMaximized(),
            });
        }, 250);
      };
      win.on("resize", saveWindow);
      win.on("move", saveWindow);
      const openLogs = () => {
        void shell.openPath(join(home, "desktop.log"));
      };
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          {
            label: "Ngertiin Dev",
            submenu: [
              { role: "about" },
              { type: "separator" },
              { label: "Show Workspace", click: show },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              {
                label: "Quit Ngertiin",
                accelerator: "CommandOrControl+Q",
                click: () => app.quit(),
              },
            ],
          },
          { role: "editMenu" },
          {
            label: "View",
            submenu: [
              { role: "reload" },
              { role: "toggleDevTools" },
              { role: "resetZoom" },
              { role: "zoomIn" },
              { role: "zoomOut" },
              { role: "togglefullscreen" },
            ],
          },
          {
            label: "Development",
            submenu: [
              {
                label: "Reconnect Workspace",
                click: () => {
                  void supervisor?.start();
                },
              },
              {
                label: "Start Shared Desktop",
                click: () => {
                  void supervisor?.startMachine();
                },
              },
              { label: "Open Desktop Logs", click: openLogs },
              {
                label: "Open Data Folder",
                click: () => {
                  void shell.openPath(profile.stateDirectory);
                },
              },
            ],
          },
          { role: "windowMenu" },
        ]),
      );
      const imagePath = join(app.getAppPath(), "dist/tray.png");
      const image = existsSync(imagePath)
        ? nativeImage.createFromPath(imagePath)
        : nativeImage.createEmpty();
      image.setTemplateImage(true);
      tray = new Tray(image);
      tray.setToolTip("Ngertiin Dev · agents can work while the window is closed");
      tray.setContextMenu(
        Menu.buildFromTemplate([
          { label: "Open Ngertiin", click: show },
          { label: "Open Desktop Logs", click: openLogs },
          { type: "separator" },
          { label: "Quit Ngertiin", click: () => app.quit() },
        ]),
      );
      tray.on("click", show);
      powerMonitor.on("suspend", () => {
        win.webContents.send("desktop:visibility", false);
        void releaseControl();
        runtimeLog("desktop.suspend");
      });
      powerMonitor.on("resume", () => {
        runtimeLog("desktop.resume");
        win.webContents.send("desktop:visibility", win.isVisible());
        void supervisor?.check();
      });
      powerMonitor.on("shutdown", () => app.quit());
      await win.loadURL(origin);
      win.show();
      runtimeLog("desktop.started", {
        packaged: app.isPackaged,
        electron: process.versions.electron,
      });
      await supervisor.start();
      supervisor.watch();
      void supervisor.startMachine();
    })
    .catch(async (error) => {
      log("desktop.start_failed", {
        message: error instanceof Error ? error.message : "Unknown startup failure",
      });
      await dialog.showMessageBox({
        type: "error",
        title: "Ngertiin Dev could not start",
        message: error instanceof Error ? error.message : "The desktop could not start.",
        detail:
          "Run bun run setup:desktop from your checkout. Details are in the desktop data folder.",
      });
      await stop();
      app.exit(1);
    });
}
