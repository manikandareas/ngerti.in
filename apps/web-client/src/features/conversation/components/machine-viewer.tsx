import { useEffect, useRef, useState } from "react";
import { useComputerView } from "../lib/computer-view-session";

export function MachineScreen({
  interactive,
  revision,
  surface = "expanded",
  compact = false,
}: {
  interactive: boolean;
  revision: number;
  surface?: string;
  compact?: boolean;
}) {
  const { view, error, reconnecting, reconnect } = useComputerView(surface, interactive, revision);
  const frame = useRef<HTMLIFrameElement>(null);
  const [health, setHealth] = useState({ id: "", live: false, received: 0, status: "connecting" });
  const [now, setNow] = useState(Date.now());
  const lastRecovery = useRef(0);
  useEffect(() => {
    const update = (event: MessageEvent) => {
      if (
        !view ||
        event.origin !== location.origin ||
        event.source !== frame.current?.contentWindow ||
        event.data?.type !== "ngertiin:computer-health" ||
        event.data.viewer_id !== view.viewer_id
      )
        return;
      setHealth({
        id: view.viewer_id,
        live: event.data.status === "streaming" && Number(event.data.frames_decoded) > 0,
        received: Date.now(),
        status: String(event.data.status),
      });
    };
    window.addEventListener("message", update);
    const timer = setInterval(() => setNow(Date.now()), 2000);
    return () => {
      window.removeEventListener("message", update);
      clearInterval(timer);
    };
  }, [view]);
  useEffect(() => {
    if (!view) return;
    window.ngertiinDesktop?.reportComputerView(view.interactive, view.control_revision);
    return () => window.ngertiinDesktop?.reportComputerView(false, view.control_revision);
  }, [view]);
  useEffect(() => {
    if (!view || document.visibilityState !== "visible" || now - lastRecovery.current < 20_000)
      return;
    if (
      (health.id === view.viewer_id && health.status === "failed") ||
      (health.received > 0 && now - health.received > 15_000)
    ) {
      lastRecovery.current = now;
      reconnect();
    }
  }, [view, health, now, reconnect]);
  const live =
    !reconnecting && health.id === view?.viewer_id && health.live && now - health.received < 6000;
  return (
    <div className="space-y-2" data-computer-live={live}>
      <div
        className={
          compact
            ? "relative aspect-[16/10] w-full overflow-hidden rounded-xl bg-black"
            : "relative h-[min(72dvh,820px)] min-h-64 overflow-hidden rounded-xl bg-black max-sm:aspect-[16/10] max-sm:h-auto max-sm:min-h-0"
        }
      >
        {view ? (
          <iframe
            ref={frame}
            title="Agent desktop"
            src={(() => {
              const url = new URL(view.viewer_url, location.origin);
              const params = new URLSearchParams(url.hash.slice(1));
              if (compact) params.set("ngertiin_preview", "1");
              url.hash = params.toString();
              return `${url.pathname}${url.search}${url.hash}`;
            })()}
            referrerPolicy="no-referrer"
            allow="clipboard-read; clipboard-write; fullscreen"
            className="size-full border-0"
          />
        ) : (
          <div
            role="status"
            className="grid size-full place-items-center px-5 text-center text-sm text-muted-foreground"
          >
            {error || "Connecting desktop…"}
          </div>
        )}
      </div>
    </div>
  );
}
