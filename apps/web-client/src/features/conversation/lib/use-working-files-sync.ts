import { useEffect } from "react";
import { isPageVisible, subscribePageVisibility } from "@/lib/page-visibility";
import type { WorkingFilesBrowser } from "./working-files-browser";

export const WORKING_FILES_SYNC_MS = 5_000;

export function useWorkingFilesSync(browser: WorkingFilesBrowser | undefined, active: boolean) {
  useEffect(() => () => browser?.pause(), [browser]);
  useEffect(() => {
    if (!browser) return;
    const reconcile = () => {
      if (!isPageVisible() || !navigator.onLine) {
        browser.pause();
        return;
      }
      void (active ? browser.refresh() : browser.warm());
    };
    const interval = active ? window.setInterval(reconcile, WORKING_FILES_SYNC_MS) : undefined;
    window.addEventListener("focus", reconcile);
    window.addEventListener("online", reconcile);
    window.addEventListener("offline", reconcile);
    const unsubscribe = subscribePageVisibility(reconcile);
    reconcile();
    return () => {
      if (interval !== undefined) window.clearInterval(interval);
      window.removeEventListener("focus", reconcile);
      window.removeEventListener("online", reconcile);
      window.removeEventListener("offline", reconcile);
      unsubscribe();
    };
  }, [browser, active]);
}
