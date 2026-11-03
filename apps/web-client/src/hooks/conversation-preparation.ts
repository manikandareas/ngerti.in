export interface SessionPreparation {
  state: "ready" | "preparing" | "skipped";
}

const RETRY_DELAYS = [1000, 2000, 4000, 8000];

/** Warm the selected DM after selection settles and on activity inside its composer. */
export function observePreparation(
  composer: HTMLElement,
  eligible: () => boolean,
  prepare: (signal: AbortSignal) => Promise<SessionPreparation>,
) {
  const document = composer.ownerDocument;
  const window = document.defaultView;
  const lifetime = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending = false;
  let retry = 0;
  let nextActivityAt = 0;
  const active = () => !lifetime.signal.aborted && composer.isConnected && eligible();
  const clear = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const schedule = (delay: number) => {
    clear();
    timer = setTimeout(() => void attempt(), delay);
  };
  async function attempt() {
    timer = undefined;
    if (!active() || pending) return;
    pending = true;
    let ready = false;
    try {
      const result = await prepare(AbortSignal.any([lifetime.signal, AbortSignal.timeout(5000)]));
      ready = result.state === "ready";
    } catch {
      // This is speculative readiness. Sending retains its ordinary durable path.
    } finally {
      pending = false;
      if (active()) {
        if (!ready && retry < RETRY_DELAYS.length) schedule(RETRY_DELAYS[retry++]);
        else nextActivityAt = Date.now() + 10_000;
      }
    }
  }
  const activity = () => {
    if (!active() || pending || timer !== undefined || Date.now() < nextActivityAt) return;
    retry = 0;
    schedule(100);
  };
  const resume = () => {
    if (!eligible()) clear();
    else if (composer.contains(document.activeElement)) activity();
  };
  const events = ["focusin", "pointerdown", "beforeinput", "input"];
  // Editors may stop input propagation; capture only inside this composer.
  for (const event of events) composer.addEventListener(event, activity, true);
  document.addEventListener("visibilitychange", resume);
  window?.addEventListener("focus", resume);
  activity();
  return () => {
    lifetime.abort();
    clear();
    for (const event of events) composer.removeEventListener(event, activity, true);
    document.removeEventListener("visibilitychange", resume);
    window?.removeEventListener("focus", resume);
  };
}
