import { Button } from "@/components/ui/button";
import { useDaytonaTrial } from "@/features/diagnostics/hooks/use-daytona-trial";
import { DesktopViewer } from "./desktop-viewer";

export function DaytonaWorkbench() {
  const { sessions, active, viewer, pending, error, command } = useDaytonaTrial();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3">
        <Button disabled={pending || !!active} onClick={() => command("sessions", "POST", {})}>
          Buat sandbox trial
        </Button>
        {active ? (
          <>
            <Button
              disabled={pending}
              onClick={() => command(`sessions/${active.id}/viewer`, "POST")}
            >
              Buka / perbarui viewer
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                command(`sessions/${active.id}/control`, "POST", {
                  destination: active.mode === "human" ? "agent" : "human",
                })
              }
            >
              {active.mode === "human" ? "Kembalikan ke agent" : "Ambil alih kendali"}
            </Button>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => command(`sessions/${active.id}/viewer`, "DELETE")}
            >
              Cabut viewer
            </Button>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => command(`sessions/${active.id}`, "DELETE")}
            >
              Hapus resource trial
            </Button>
          </>
        ) : null}
      </div>
      {error || sessions.error ? <p role="alert">{error || sessions.error?.message}</p> : null}
      {active ? (
        <p className="text-sm">
          Sesi {active.id} · {active.status} · kendali {active.mode} · revisi {active.version} ·
          reservasi US${active.reserved_usd.toFixed(3)} · deadline{" "}
          {new Date(active.deadline * 1000).toLocaleTimeString("id-ID")}
        </p>
      ) : null}
      {viewer ? <DesktopViewer key={viewer} url={viewer.replace(/^http/, "ws")} /> : null}
      <p className="text-sm text-muted-foreground">
        Viewer berlaku 60 detik. Kendali agent menolak input keyboard, pointer, dan clipboard pada
        gateway. Perbarui viewer setelah pergantian kendali.
      </p>
    </div>
  );
}
