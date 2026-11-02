import {
  CalendarClock,
  ChevronRight,
  ExternalLink,
  LoaderCircle,
  Target,
  Users,
} from "lucide-react";
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
      {route?.state === "pending" && (
        <p className="flex items-center gap-1.5">
          <LoaderCircle size={13} className="motion-safe:animate-spin" aria-hidden="true" />
          Memilih satu penjawab…
        </p>
      )}
      {route && ["rejected", "unknown"].includes(route.state) && (
        <p role="status">
          {route.state === "unknown"
            ? "Hasil routing belum diketahui. Periksa run sebelum melanjutkan."
            : "Penjawab belum dapat dipilih. Periksa anggota dan koneksinya."}{" "}
          {route.error_code}
        </p>
      )}
      {tasks.map((task) => (
        <p key={task.id} className="flex items-start gap-1.5">
          <Users size={13} strokeWidth={1.5} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
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
          </span>
        </p>
      ))}
      {run?.goal_id && (
        <Button variant="ghost" size="sm" onClick={() => open("goals", run.goal_id as string)}>
          <Target size={13} strokeWidth={1.5} />
          Goal: {snapshot.goals.find((g) => g.id === run.goal_id)?.title ?? "Lihat tanggung jawab"}
        </Button>
      )}
      {run?.routine_id && (
        <Button variant="ghost" size="sm" onClick={() => open("routine", run.routine_id as string)}>
          <CalendarClock size={13} strokeWidth={1.5} />
          Lihat Routine
        </Button>
      )}
      {!!run?.sources?.length && (
        <details className="group/sources w-fit max-w-full rounded-xl border border-border/40 bg-panel">
          <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 rounded-xl px-3 py-1.5 text-[13px] hover:bg-secondary [&::-webkit-details-marker]:hidden">
            <ExternalLink size={13} strokeWidth={1.5} aria-hidden="true" />
            Sumber riset · {run.sources.length}
            <ChevronRight
              size={13}
              strokeWidth={1.5}
              className="ml-auto group-open/sources:rotate-90"
              aria-hidden="true"
            />
          </summary>
          <ul className="space-y-2 border-t border-border/40 p-3 text-[13px]">
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
