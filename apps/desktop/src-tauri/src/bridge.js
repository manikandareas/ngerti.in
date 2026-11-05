(() => {
  if (window.top !== window.self) return;
  let visible = true;
  const listeners = new Set();
  Object.defineProperty(window, "ngertiinDesktop", {
    configurable: false,
    value: Object.freeze({
      platform: "darwin",
      nativeVisibility: true,
      // Rust observes issued viewer tickets at the gateway. This is presentation-only compatibility.
      reportComputerView() {},
      onVisibility(callback) {
        if (typeof callback !== "function") return () => {};
        listeners.add(callback);
        callback(visible);
        return () => listeners.delete(callback);
      },
    }),
  });
  Object.defineProperty(window, "__ngertiinDesktopVisibility", {
    value(next) {
      visible = next === true;
      for (const callback of listeners) {
        try { callback(visible); } catch { /* One consumer cannot block handback. */ }
      }
    },
  });
})();
