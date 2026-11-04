import { RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { request } from "@/lib/api-client";
import type { MachineView } from "@/types/machine";

export function MachineScreen({
  interactive,
  revision,
}: {
  interactive: boolean;
  revision: number;
}) {
  const [view, setView] = useState<MachineView | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: ownership revision and attempt invalidate the issued viewer ticket.
  useEffect(() => {
    const abort = new AbortController();
    let issued: MachineView | undefined;
    let renewal: ReturnType<typeof setTimeout> | undefined;
    const revoke = (ticket: MachineView) => {
      void fetch(`/v1/machine/views/${ticket.viewer_id}`, {
        method: "DELETE",
        keepalive: true,
      }).catch(() => {});
    };
    setView(null);
    setError("");
    void request<MachineView>("/v1/machine/view", { interactive })
      .then((ticket) => {
        issued = ticket;
        if (abort.signal.aborted) {
          revoke(ticket);
          return;
        }
        if (interactive && ticket.control_revision !== revision) {
          revoke(ticket);
          throw new Error("Control changed. Reconnect the desktop.");
        }
        window.ngertiinDesktop?.reportComputerView(ticket.interactive, ticket.control_revision);
        setView(ticket);
        renewal = setTimeout(
          () => setAttempt((value) => value + 1),
          Math.max(1000, Date.parse(ticket.expires_at) - Date.now() - 30_000),
        );
      })
      .catch((e) => {
        if (!abort.signal.aborted)
          setError(e instanceof Error ? e.message : "Desktop could not be connected.");
      });
    return () => {
      abort.abort();
      clearTimeout(renewal);
      if (issued) {
        window.ngertiinDesktop?.reportComputerView(false, issued.control_revision);
        revoke(issued);
      }
    };
  }, [interactive, revision, attempt]);
  return (
    <>
      <div className="relative h-[min(72dvh,820px)] min-h-64 overflow-hidden rounded-lg bg-muted max-sm:aspect-[16/10] max-sm:h-auto max-sm:min-h-0">
        {view ? (
          <iframe
            key={view.viewer_id}
            title="Agent desktop"
            src={view.viewer_url}
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted-foreground">
          {interactive
            ? "Agent mouse and keyboard input waits while you have control."
            : "View only · agent work can continue."}
        </p>
        <Button variant="ghost" size="sm" onClick={() => setAttempt((n) => n + 1)}>
          <HugeiconsIcon icon={RefreshIcon} size={14} />
          Reconnect view
        </Button>
      </div>
    </>
  );
}
