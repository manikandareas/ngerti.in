import { Button } from "@/components/ui/button";
import type { Message, Run, Snapshot } from "@/types/workspace";

export function WorkActivity({
  message,
  run,
  snapshot,
  open,
}: {
  message: Message;
  run?: Run;
  snapshot: Snapshot;
  open: (tab: "goals" | "routine" | "files", id: string) => void;
}) {
  const route = snapshot.routes.find((r) => r.message_id === message.id);
  const tasks = snapshot.tasks.filter(
    (t) => t.request_message_id === message.id && t.source_agent_id,
  );
  return (
    <div className="space-y-2 text-caption text-muted-foreground">
      {route?.state === "pending" && <p>Memilih satu penjawab…</p>}
      {route && ["rejected", "unknown"].includes(route.state) && (
        <p role="status">
          {route.state === "unknown"
            ? "Hasil routing belum diketahui. Periksa run sebelum melanjutkan."
            : "Penjawab belum dapat dipilih. Periksa anggota dan koneksinya."}{" "}
          {route.error_code}
        </p>
      )}
      {tasks.map((task) => (
        <p key={task.id}>
          {snapshot.agents.find((a) => a.id === task.source_agent_id)?.name ?? "Agent"} meminta
          bantuan {snapshot.agents.find((a) => a.id === task.agent_id)?.name ?? "anggota"} ·{" "}
          {(
            {
              working: "Sedang bekerja",
              waiting_peer: "Menunggu anggota",
              waiting_user: "Menunggu kamu",
              completed: "Selesai",
              failed: "Gagal",
              cancelled: "Dihentikan",
              unknown: "Hasil belum diketahui",
            } as Record<string, string>
          )[task.state] ?? task.state}
        </p>
      ))}
      {run?.goal_id && (
        <Button variant="ghost" size="sm" onClick={() => open("goals", run.goal_id as string)}>
          Goal: {snapshot.goals.find((g) => g.id === run.goal_id)?.title ?? "Lihat tanggung jawab"}
        </Button>
      )}
      {run?.routine_id && (
        <Button variant="ghost" size="sm" onClick={() => open("routine", run.routine_id as string)}>
          Lihat Routine
        </Button>
      )}
      {!!run?.sources?.length && (
        <details>
          <summary className="cursor-pointer">Sumber riset · {run.sources.length}</summary>
          <ul className="mt-2 space-y-2">
            {run.sources
              .filter((s) => /^https?:\/\//i.test(s.url))
              .map((source) => (
                <li key={`${source.operation}:${source.url}`}>
                  <a
                    className="text-link underline"
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {source.title || source.url}
                  </a>
                </li>
              ))}
          </ul>
        </details>
      )}
    </div>
  );
}
