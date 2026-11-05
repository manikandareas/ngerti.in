import { expect, test } from "bun:test";
import { isPageVisible, subscribePageVisibility } from "../src/lib/page-visibility";

test("native window visibility initializes a background-launched WKWebView before WebKit exposes it", () => {
  const names = ["window", "document"];
  const saved = names.map(
    (name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const,
  );
  let native: ((visible: boolean) => void) | undefined;
  let disposed = false;
  let unsubscribe = () => {};
  try {
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: { hidden: true, addEventListener() {}, removeEventListener() {} },
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        ngertiinDesktop: {
          nativeVisibility: true,
          onVisibility(callback: (visible: boolean) => void) {
            native = callback;
            callback(true);
            return () => {
              disposed = true;
            };
          },
        },
      },
    });
    unsubscribe = subscribePageVisibility(() => {});
    expect(isPageVisible()).toBe(true);
    native?.(false);
    expect(isPageVisible()).toBe(false);
    native?.(true);
    expect(isPageVisible()).toBe(true);
    unsubscribe();
    expect(disposed).toBe(true);
  } finally {
    unsubscribe();
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
