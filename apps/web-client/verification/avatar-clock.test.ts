import { expect, test } from "bun:test";
import { subscribeAvatarFrame } from "../src/features/avatar/engine/clock";

test("modal dialogs suspend background avatars and resume the shared clock on close", () => {
  const names = [
    "document",
    "matchMedia",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "IntersectionObserver",
    "MutationObserver",
    "window",
  ];
  const saved = names.map(
    (name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const,
  );
  const frames = new Map<number, FrameRequestCallback>();
  let next = 0;
  let changed: (() => void) | undefined;
  let nativeVisibility: ((visible: boolean) => void) | undefined;
  const background = {} as Element;
  const foreground = {} as Element;
  let modal: Element | null = null;
  let backgroundDraws = 0;
  let foregroundDraws = 0;
  const unsubscribers: (() => void)[] = [];
  const values: Record<string, unknown> = {
    window: {
      ngertiinDesktop: {
        onVisibility(callback: (visible: boolean) => void) {
          nativeVisibility = callback;
          return () => {
            nativeVisibility = undefined;
          };
        },
      },
    },
    document: {
      hidden: false,
      body: {},
      addEventListener() {},
      removeEventListener() {},
      querySelectorAll: () => (modal ? [modal] : []),
    },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      frames.set(++next, callback);
      return next;
    },
    cancelAnimationFrame: (id: number) => frames.delete(id),
    IntersectionObserver: undefined,
    MutationObserver: class {
      constructor(callback: () => void) {
        changed = callback;
      }
      observe() {}
      disconnect() {}
    },
  };
  try {
    for (const [name, value] of Object.entries(values))
      Object.defineProperty(globalThis, name, { configurable: true, value });
    unsubscribers.push(subscribeAvatarFrame(background, () => backgroundDraws++));
    expect(frames.size).toBe(1);
    const before = backgroundDraws;
    modal = { contains: (element: Element) => element === foreground } as Element;
    changed?.();
    expect(frames.size).toBe(0);
    expect(backgroundDraws).toBe(before);
    unsubscribers.push(subscribeAvatarFrame(foreground, () => foregroundDraws++));
    expect(foregroundDraws).toBe(1);
    expect(frames.size).toBe(1);
    const [id, tick] = [...frames][0];
    frames.delete(id);
    tick(100);
    expect(foregroundDraws).toBe(2);
    expect(backgroundDraws).toBe(before);
    modal = null;
    changed?.();
    expect(backgroundDraws).toBe(before + 1);
    expect(frames.size).toBe(1);
    const visibleDraws = backgroundDraws;
    nativeVisibility?.(false);
    expect(frames.size).toBe(0);
    expect(backgroundDraws).toBe(visibleDraws);
    nativeVisibility?.(true);
    expect(backgroundDraws).toBe(visibleDraws + 1);
    expect(frames.size).toBe(1);
  } finally {
    for (const unsubscribe of unsubscribers) unsubscribe();
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
