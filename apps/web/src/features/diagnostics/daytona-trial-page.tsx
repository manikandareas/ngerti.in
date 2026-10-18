import { useAuth } from "@clerk/tanstack-react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api, apiUrl } from "@/lib/api";
import { AppShell } from "@/ui/app-shell";
import { DesktopViewer } from "./desktop-viewer";

type Session = {
  id: string;
  sandbox_id: string;
  mode: string;
  status: string;
  version: number;
  reserved_usd: number;
  deadline: number;
};

export function DaytonaTrialPage() {
  const { userId, isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <p>Memuat sesi…</p>;
  return (
    <AppShell>
      <Link to="/">Kembali ke percakapan</Link>
      <h1 className="mt-6 text-2xl font-bold">Trial desktop Daytona</h1>
      <p className="my-4 text-muted-foreground">
        NG-031 · Satu sandbox aktif, TTL maksimal 30 menit, plafon reservasi US$1.
      </p>
      {isSignedIn ? <Workbench key={userId} /> : <Link to="/sign-in">Masuk untuk menguji</Link>}
    </AppShell>
  );
}

function Workbench() {
  const { getToken } = useAuth();
  const cache = useQueryClient();
  const [viewer, setViewer] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const sessions = useQuery({
    queryKey: ["daytona-trial"],
    queryFn: async () => api<Session[]>("/dev/daytona/sessions", await getToken()),
    refetchInterval: 3000,
  });
  const active = sessions.data?.find((session) => session.status !== "deleted");

  async function command(path: string, method: string, body?: object) {
    setPending(true);
    setError("");
    try {
      const result = await api<{ path?: string }>(`/dev/daytona/${path}`, await getToken(), {
        method,
        credentials: "include",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      setViewer(result?.path ? `${apiUrl}${result.path}` : null);
      await cache.invalidateQueries({ queryKey: ["daytona-trial"] });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Trial belum berhasil.");
    } finally {
      setPending(false);
    }
  }

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
