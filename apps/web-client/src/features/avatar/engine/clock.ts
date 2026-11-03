type Frame = (now: number, reducedMotion: boolean) => void;
interface Entry {
  element: Element;
  frame: Frame;
  visible: boolean;
}

const entries = new Set<Entry>();
let observer: IntersectionObserver | undefined;
let media: MediaQueryList | undefined;
let request = 0;

function tick(now: number) {
  request = 0;
  for (const entry of entries) {
    if (entry.visible) entry.frame(now, false);
  }
  schedule();
}

function schedule() {
  if (request || document.hidden || media?.matches) return;
  for (const entry of entries) {
    if (entry.visible) {
      request = requestAnimationFrame(tick);
      return;
    }
  }
}

function refresh() {
  cancelAnimationFrame(request);
  request = 0;
  for (const entry of entries) entry.frame(performance.now(), media?.matches ?? false);
  schedule();
}

/** One display-synchronized clock for all visible avatars. No frames while hidden or motion is reduced. */
export function subscribeAvatarFrame(element: Element, frame: Frame): () => void {
  if (!entries.size) {
    media = matchMedia("(prefers-reduced-motion: reduce)");
    media.addEventListener("change", refresh);
    document.addEventListener("visibilitychange", refresh);
    if (typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver((changes) => {
        for (const change of changes) {
          for (const entry of entries) {
            if (entry.element === change.target) entry.visible = change.isIntersecting;
          }
        }
        schedule();
      });
    }
  }
  const entry: Entry = { element, frame, visible: !observer };
  entries.add(entry);
  observer?.observe(element);
  frame(performance.now(), media?.matches ?? false);
  schedule();
  return () => {
    observer?.unobserve(element);
    entries.delete(entry);
    if (!entries.size) {
      cancelAnimationFrame(request);
      request = 0;
      observer?.disconnect();
      observer = undefined;
      media?.removeEventListener("change", refresh);
      document.removeEventListener("visibilitychange", refresh);
      media = undefined;
    }
  };
}
