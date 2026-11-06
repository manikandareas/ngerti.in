import { useEffect, useSyncExternalStore } from "react";
import { request } from "@/lib/api-client";
import type { MachineView } from "@/types/machine";

type State = { view: MachineView | null; error: string; reconnecting: boolean };
const sessions = new Map<string, ComputerViewSession>();
/** A viewer grant outlives incidental component mounts; each surface owns a distinct grant. */
class ComputerViewSession {
  state: State = { view: null, error: "", reconnecting: false };
  listeners = new Set<() => void>();
  users = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private disposal?: ReturnType<typeof setTimeout>;
  private inFlight = false;
  private closed = false;
  private failures = 0;
  readonly interactive: boolean;
  readonly revision: number;
  readonly key: string;
  constructor(interactive: boolean, revision: number, key: string) {
    this.interactive = interactive;
    this.revision = revision;
    this.key = key;
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  snapshot = () => this.state;
  private publish(state: Partial<State>) {
    this.state = { ...this.state, ...state };
    for (const listener of this.listeners) listener();
  }
  private wake = () => {
    if (
      document.visibilityState === "visible" &&
      (!this.state.view ||
        Date.parse(this.state.view.expires_at) - Date.now() < 60_000 ||
        this.failures)
    )
      void this.connect();
  };
  attach() {
    this.users++;
    clearTimeout(this.disposal);
    if (this.users === 1) {
      window.addEventListener("online", this.wake);
      document.addEventListener("visibilitychange", this.wake);
      void this.connect();
    }
    return () => {
      if (--this.users !== 0) return;
      window.removeEventListener("online", this.wake);
      document.removeEventListener("visibilitychange", this.wake);
      this.disposal = setTimeout(() => this.close(), 30_000);
    };
  }
  private revoke(view: MachineView) {
    void fetch(`/v1/machine/views/${view.viewer_id}`, { method: "DELETE", keepalive: true }).catch(
      () => {},
    );
  }
  private close() {
    this.closed = true;
    clearTimeout(this.timer);
    if (this.state.view) this.revoke(this.state.view);
    sessions.delete(this.key);
  }
  async connect(force = false) {
    if (this.inFlight || this.closed) return;
    clearTimeout(this.timer);
    this.inFlight = true;
    try {
      const previous = this.state.view;
      if (previous && !force && Date.parse(previous.expires_at) > Date.now()) {
        const renewed = await request<{ expires_at: string }>(
          `/v1/machine/views/${previous.viewer_id}/renew`,
          {},
        );
        if (!this.closed)
          this.publish({
            view: { ...previous, expires_at: renewed.expires_at },
            error: "",
            reconnecting: false,
          });
      } else {
        const view = await request<MachineView>("/v1/machine/view", {
          interactive: this.interactive,
        });
        if (this.closed) {
          this.revoke(view);
          return;
        }
        if (this.interactive && view.control_revision !== this.revision) {
          this.revoke(view);
          throw new Error("Desktop control changed. Reconnecting…");
        }
        this.publish({ view, error: "", reconnecting: false });
        if (previous) this.revoke(previous);
      }
      this.failures = 0;
      const expiresAt = this.state.view?.expires_at;
      if (!expiresAt) return;
      this.timer = setTimeout(
        () => void this.connect(),
        Math.max(1000, Date.parse(expiresAt) - Date.now() - 60_000),
      );
    } catch (error) {
      if (!this.closed) {
        this.failures++;
        this.publish({
          error: error instanceof Error ? error.message : "Desktop is reconnecting…",
          reconnecting: true,
        });
        // Keep the visible frame while recovering. A revoked/expired grant gets replaced.
        this.timer = setTimeout(
          () => void this.connect(this.failures > 1),
          Math.min(15_000, 1000 * 2 ** Math.min(this.failures - 1, 4)),
        );
      }
    } finally {
      this.inFlight = false;
    }
  }
}
export function useComputerView(surface: string, interactive: boolean, revision: number) {
  const key = `${surface}:${interactive}:${interactive ? revision : "view"}`;
  let session = sessions.get(key);
  if (!session) {
    session = new ComputerViewSession(interactive, revision, key);
    sessions.set(key, session);
  }
  const current = session;
  const state = useSyncExternalStore(current.subscribe, current.snapshot);
  useEffect(() => current.attach(), [current]);
  return { ...state, reconnect: () => void current.connect(true) };
}
