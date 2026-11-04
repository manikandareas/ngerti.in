import { contextBridge, ipcRenderer } from "electron";

if (process.isMainFrame) {
  contextBridge.exposeInMainWorld("ngertiinDesktop", {
    platform: process.platform,
    reportComputerView(active: boolean, revision: number) {
      if (typeof active === "boolean" && Number.isSafeInteger(revision) && revision >= 0)
        ipcRenderer.send("desktop:computer-view", active, revision);
    },
    onVisibility(callback: (visible: boolean) => void) {
      const listener = (_event: Electron.IpcRendererEvent, visible: unknown) => {
        if (typeof visible === "boolean") callback(visible);
      };
      ipcRenderer.on("desktop:visibility", listener);
      return () => ipcRenderer.removeListener("desktop:visibility", listener);
    },
  });
}
