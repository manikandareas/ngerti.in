import { isPageVisible, subscribePageVisibility } from "@/lib/page-visibility";

type Frame = (now: number, reducedMotion: boolean) => void;
type Gaze = (x: number, y: number, active: boolean) => void;
interface Entry {
  element: Element;
  frame: Frame;
  gaze?: Gaze;
  visible: boolean;
  pointerVersion: number;
  boundsReadAt: number;
}

const entries = new Set<Entry>();
let observer: IntersectionObserver | undefined;
let modalObserver: MutationObserver | undefined;
let modal: Element | undefined;
let media: MediaQueryList | undefined;
let pointerMedia: MediaQueryList | undefined;
let pointer: { x: number; y: number } | undefined;
let pointerUsers = 0;
let pointerVersion = 0;
let request = 0;
let unsubscribeVisibility: (() => void) | undefined;

function trackPointer(event: PointerEvent) {
  if (event.pointerType === "touch" || !pointerMedia?.matches) {
    resetPointer();
    return;
  }
  if (!isPageVisible() || media?.matches) return;
  pointer = { x: event.clientX, y: event.clientY };
  pointerVersion++;
}

function resetPointer() {
  pointer = undefined;
  pointerVersion++;
}

function invalidatePointerBounds() {
  pointerVersion++;
}

function canDraw(entry: Entry) {
  return isPageVisible() && entry.visible && (!modal || modal.contains(entry.element));
}

function refreshModal() {
  const dialogs = document.querySelectorAll(
    '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
  );
  const next = dialogs[dialogs.length - 1];
  if (next === modal) return;
  modal = next;
  refresh();
}

function drawVisible(now: number, reducedMotion: boolean) {
  // Read all visible bounds before any SVG writes, once per frame rather than per pointer event.
  for (const entry of entries) {
    if (!canDraw(entry) || !entry.gaze) continue;
    if (entry.pointerVersion === pointerVersion && now - entry.boundsReadAt < 250) continue;
    entry.pointerVersion = pointerVersion;
    entry.boundsReadAt = now;
    if (!pointer || reducedMotion) {
      entry.gaze(0, 0, false);
      continue;
    }
    const rect = entry.element.getBoundingClientRect();
    const reach = Math.max(160, rect.width * 2);
    entry.gaze(
      (pointer.x - rect.x - rect.width / 2) / reach,
      (pointer.y - rect.y - rect.height / 2) / reach,
      true,
    );
  }
  for (const entry of entries) {
    if (canDraw(entry)) entry.frame(now, reducedMotion);
  }
}

function tick(now: number) {
  request = 0;
  drawVisible(now, false);
  schedule();
}

function schedule() {
  if (request || !isPageVisible() || media?.matches) return;
  for (const entry of entries) {
    if (canDraw(entry)) {
      request = requestAnimationFrame(tick);
      return;
    }
  }
}

function refresh() {
  cancelAnimationFrame(request);
  request = 0;
  if (!isPageVisible() || media?.matches) resetPointer();
  drawVisible(performance.now(), media?.matches ?? false);
  schedule();
}

/** One display-synchronized clock for all visible avatars. No frames while hidden or motion is reduced. */
export function subscribeAvatarFrame(element: Element, frame: Frame, gaze?: Gaze): () => void {
  if (!entries.size) {
    media = matchMedia("(prefers-reduced-motion: reduce)");
    media.addEventListener("change", refresh);
    unsubscribeVisibility = subscribePageVisibility(refresh);
    // Modal backgrounds remain intersecting. Stop their SVG work behind scrims and blur.
    modalObserver = new MutationObserver(refreshModal);
    modalObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state"],
    });
    refreshModal();
    if (typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver((changes) => {
        for (const change of changes) {
          for (const entry of entries) {
            if (entry.element === change.target) {
              entry.visible = change.isIntersecting;
              entry.pointerVersion = -1;
            }
          }
        }
        refresh();
      });
    }
  }
  if (gaze && pointerUsers++ === 0) {
    pointerMedia = matchMedia("(hover: hover) and (pointer: fine)");
    pointerMedia.addEventListener("change", resetPointer);
    document.addEventListener("pointermove", trackPointer, { passive: true });
    document.addEventListener("pointerleave", resetPointer);
    window.addEventListener("blur", resetPointer);
    document.addEventListener("scroll", invalidatePointerBounds, { capture: true, passive: true });
    window.addEventListener("resize", invalidatePointerBounds, { passive: true });
  }
  const entry: Entry = {
    element,
    frame,
    gaze,
    visible: !observer,
    pointerVersion: -1,
    boundsReadAt: 0,
  };
  entries.add(entry);
  observer?.observe(element);
  if (canDraw(entry)) frame(performance.now(), media?.matches ?? false);
  schedule();
  return () => {
    observer?.unobserve(element);
    entries.delete(entry);
    if (gaze && --pointerUsers === 0) {
      pointerMedia?.removeEventListener("change", resetPointer);
      pointerMedia = undefined;
      document.removeEventListener("pointermove", trackPointer);
      document.removeEventListener("pointerleave", resetPointer);
      window.removeEventListener("blur", resetPointer);
      document.removeEventListener("scroll", invalidatePointerBounds, true);
      window.removeEventListener("resize", invalidatePointerBounds);
      resetPointer();
    }
    if (!entries.size) {
      cancelAnimationFrame(request);
      request = 0;
      observer?.disconnect();
      observer = undefined;
      modalObserver?.disconnect();
      modalObserver = undefined;
      modal = undefined;
      media?.removeEventListener("change", refresh);
      unsubscribeVisibility?.();
      unsubscribeVisibility = undefined;
      media = undefined;
    }
  };
}
