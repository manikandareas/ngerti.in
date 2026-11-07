import { useEffect, useSyncExternalStore } from "react";
import { FILE_ICON_BASE, type FileIconManifest } from "./file-icon-manifest";

let manifest: FileIconManifest | null = null;
let pending: Promise<void> | undefined;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const snapshot = () => manifest;
const serverSnapshot = () => null;

export function useFileIcons() {
  const value = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  useEffect(() => {
    if (manifest || pending) return;
    pending = fetch(`${FILE_ICON_BASE}/manifest.json`)
      .then(async (response) => {
        if (!response.ok) throw new Error("File icons unavailable.");
        manifest = (await response.json()) as FileIconManifest;
        for (const listener of listeners) listener();
      })
      .catch(() => {
        pending = undefined;
      });
  }, []);
  return value;
}
