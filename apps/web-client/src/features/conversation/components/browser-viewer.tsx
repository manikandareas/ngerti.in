import type RFB from "@novnc/novnc";
import { Globe, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { request } from "@/lib/api-client";
import type { BrowserObservation, BrowserSession } from "@/types/work";

export type BrowserView = {
  profileId: string;
  agentId: string;
  threadId: string;
  session?: BrowserSession;
};
export function BrowserViewer({
  target,
  close,
}: {
  target: BrowserView | null;
  close: () => void;
}) {
  return (
    <Dialog
      open={!!target}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="flex max-h-[94svh] flex-col gap-3 rounded-[16px] p-4 sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[15px] font-medium">
            <Globe size={17} strokeWidth={1.5} />
            Browser percakapan
          </DialogTitle>
          <DialogDescription>
            Tampilan browser yang sama dengan pekerjaan agent · hanya lihat.
          </DialogDescription>
        </DialogHeader>
        {target && (
          <BrowserScreen
            key={`${target.profileId}:${target.agentId}:${target.threadId}`}
            target={target}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
function BrowserScreen({ target }: { target: BrowserView }) {
  const screen = useRef<HTMLDivElement>(null);
  const boundSession = useRef<BrowserSession | null>(target.session ?? null);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState("Menghubungkan tampilan…");
  const [error, setError] = useState("");
  const [observation, setObservation] = useState<BrowserObservation | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt renews the scoped view ticket without a browser action.
  useEffect(() => {
    const abort = new AbortController();
    let rfb: RFB | undefined;
    let renewal: ReturnType<typeof setTimeout> | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;
    const scope = { agent_id: target.agentId, thread_id: target.threadId };
    setState("Menghubungkan tampilan…");
    setError("");
    async function connect() {
      const [{ default: Client }, session] = await Promise.all([
        import("@novnc/novnc"),
        boundSession.current
          ? Promise.resolve(boundSession.current)
          : request<BrowserSession>(
              `/v1/browser/profiles/${target.profileId}/open`,
              scope,
              undefined,
              abort.signal,
            ),
      ]);
      if (abort.signal.aborted || !screen.current) return;
      boundSession.current = session;
      async function observe() {
        try {
          const result = await request<BrowserObservation>(
            `/v1/browser/sessions/${session.id}?${new URLSearchParams(scope)}`,
            undefined,
            undefined,
            abort.signal,
          );
          if (!abort.signal.aborted) setObservation(result);
        } catch (e) {
          if (!abort.signal.aborted)
            setError(e instanceof Error ? e.message : "Status browser belum tersedia.");
        }
      }
      void observe();
      poll = setInterval(() => void observe(), 7000);
      const view = await request<{ url: string; session_id: string; generation: number }>(
        `/v1/browser/sessions/${session.id}/view`,
        scope,
        undefined,
        abort.signal,
      );
      if (abort.signal.aborted || !screen.current) return;
      if (view.session_id !== session.id || view.generation !== session.generation)
        throw new Error("Sesi browser berubah. Buka kembali tampilan.");
      rfb = new Client(screen.current, view.url);
      rfb.viewOnly = true;
      rfb.scaleViewport = true;
      rfb.resizeSession = false;
      rfb.focusOnClick = false;
      rfb.addEventListener("connect", () => {
        if (!abort.signal.aborted) setState("Tampilan terhubung");
      });
      rfb.addEventListener("disconnect", () => {
        if (!abort.signal.aborted)
          setState("Tampilan terputus. Sambungkan ulang untuk melihat sesi yang sama.");
      });
      rfb.addEventListener("securityfailure", () => {
        if (!abort.signal.aborted)
          setError("Tampilan belum dapat diakses. Periksa sesi dan akses browser.");
      });
      // A fresh view-only ticket renews access without replaying a browser action.
      renewal = setTimeout(() => setAttempt((n) => n + 1), 50_000);
    }
    void connect().catch((e) => {
      if (!abort.signal.aborted) {
        setError(e instanceof Error ? e.message : "Browser belum tersedia.");
        setState("Tampilan belum terhubung");
      }
    });
    return () => {
      abort.abort();
      clearTimeout(renewal);
      clearInterval(poll);
      rfb?.disconnect();
    };
  }, [target.profileId, target.agentId, target.threadId, attempt]);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 text-caption">
        <span role="status">{state}</span>
        <Button variant="outline" size="sm" onClick={() => setAttempt((n) => n + 1)}>
          <RefreshCw size={13} strokeWidth={1.5} />
          Sambungkan ulang tampilan
        </Button>
      </div>
      {observation?.auth === "required" && (
        <p role="alert" className="text-sm text-destructive">
          Situs meminta login ulang. Selesaikan login pada host browser lalu periksa kembali.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div
        role="img"
        ref={screen}
        className="h-[min(58svh,560px)] min-h-56 w-full min-w-0 overflow-hidden rounded-lg bg-muted"
        aria-label="Tampilan browser agent"
      />
      {observation && (
        <details className="text-[12px] text-muted-foreground">
          <summary className="w-fit cursor-pointer rounded-full px-2 py-1 hover:bg-foreground/[0.05]">
            Detail sesi browser
          </summary>
          <p className="mt-1 break-all rounded-lg bg-foreground/[0.045] px-3 py-2">
            Sesi {observation.session.id} · Tab{" "}
            {observation.binding?.tabs.find((t) => t.target_id === observation.binding?.target_id)
              ?.tab_id ?? "belum diketahui"}{" "}
            ·{" "}
            {observation.auth === "authenticated"
              ? "Situs terautentikasi"
              : observation.auth === "unknown"
                ? "Status login situs belum diketahui"
                : "Login diperlukan"}
          </p>
        </details>
      )}
    </>
  );
}
