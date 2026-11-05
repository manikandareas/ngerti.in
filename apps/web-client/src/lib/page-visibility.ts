let nativeVisible = true;
let unsubscribeNative: (() => void) | undefined;
const listeners = new Set<() => void>();

/** Native hide/minimize and browser visibility both suspend presentation, never backend work. */
export function isPageVisible() {
  // WKWebView can remain document.hidden during a background launch although its native window
  // is already shown. The host observes app hide, minimize and sleep directly.
  if (typeof window !== "undefined" && window.ngertiinDesktop?.nativeVisibility)
    return nativeVisible;
  return !document.hidden && nativeVisible;
}

function notify() {
  for (const listener of listeners) listener();
}

export function subscribePageVisibility(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    document.addEventListener("visibilitychange", notify);
    if (typeof window !== "undefined") {
      unsubscribeNative = window.ngertiinDesktop?.onVisibility((visible) => {
        nativeVisible = visible;
        notify();
      });
    }
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      document.removeEventListener("visibilitychange", notify);
      unsubscribeNative?.();
      unsubscribeNative = undefined;
      nativeVisible = true;
    }
  };
}
