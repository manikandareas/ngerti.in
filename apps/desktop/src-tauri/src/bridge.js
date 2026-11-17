(() => {
  if (window.top !== window.self) return;
  let visible = true;
  const listeners = new Set();
  Object.defineProperty(window, "ngertiinDesktop", {
    configurable: false,
    value: Object.freeze({
      platform: "darwin",
      customTitlebar: true,
      async windowAction(action) {
        if (action !== "drag" && action !== "toggle-maximize") return;
        const response = await fetch(`/_desktop/window/${action}`, {
          method: "POST",
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error("The window action could not finish.");
      },
      nativeVisibility: true,
      remote: true,
      async signIn() {
        const response = await fetch("/_desktop/login", { method: "POST", signal: AbortSignal.timeout(310000) });
        if (!response.ok) throw new Error("Sign in could not finish. Try again from this window.");
      },
      async cancelSignIn() {
        await fetch("/_desktop/cancel-login", { method: "POST", signal: AbortSignal.timeout(10000) });
      },
      async openExternal(url) {
        const response = await fetch("/_desktop/open-external", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error("The browser could not be opened. Try Open browser again.");
      },
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
