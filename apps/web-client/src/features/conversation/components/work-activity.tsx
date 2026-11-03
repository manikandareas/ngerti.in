import {
  ArrowRight01Icon,
  Clock01Icon,
  LinkSquare02Icon,
  Loading03Icon,
  Target02Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { ConversationEvent } from "@/features/conversation/components/conversation-event";
import type { Message, Run, Snapshot } from "@/types/workspace";

const goalStates: Record<string, string> = {
  paused: "Dijeda",
  stopped: "Dihentikan",
  completed: "Selesai",
  blocked: "Terhambat",
  waiting: "Menunggu",
  waiting_assignment: "Menunggu penanggung jawab",
  completion_pending: "Memeriksa hasil",
  ready: "Siap",
};

export function WorkActivity({
  message,
  run,
  snapshot,
  open,
  retryRoute,
  busy,
}: {
  message: Message;
  run?: Run;
  snapshot: Snapshot;
  open: (tab: "goals" | "routine" | "files", id: string) => void;
  retryRoute: (route: Snapshot["routes"][number]) => void;
  busy: boolean;
}) {
  const route = snapshot.routes.find((r) => r.message_id === message.id);
  const tasks = snapshot.tasks.filter(
    (t) => t.request_message_id === message.id && t.source_agent_id,
  );
  const goals = snapshot.goals.filter(
    (goal) => goal.id === run?.goal_id || goal.source_message_ids.includes(message.id),
  );
  const routines = snapshot.routines.filter(
    (routine) => routine.source_message_id === message.id || routine.id === run?.routine_id,
  );
  return (
    <div className="w-full min-w-0 space-y-2 text-caption text-muted-foreground empty:hidden">
      {route?.state === "pending" && (
        <p className="flex items-center gap-1.5">
          <HugeiconsIcon
            icon={Loading03Icon}
            size={13}
            className="motion-safe:animate-spin"
            aria-hidden="true"
          />
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
      {route?.state === "rejected" && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => retryRoute(route)}>
          Coba pilih penjawab lagi
        </Button>
      )}
      {tasks.map((task) => (
        <ConversationEvent
          key={task.id}
          kind="handoff"
          icon={
            <HugeiconsIcon
              icon={UserGroupIcon}
              size={15}
              strokeWidth={1.5}
              className="shrink-0"
              aria-hidden="true"
            />
          }
          label="Meminta bantuan"
          name={`${snapshot.agents.find((a) => a.id === task.source_agent_id)?.name ?? "Agent"} → ${snapshot.agents.find((a) => a.id === task.agent_id)?.name ?? "anggota"}`}
          status={
            (
              {
                working: "Sedang bekerja",
                waiting_peer: "Menunggu anggota",
                waiting_user: "Menunggu kamu",
                completed: "Selesai",
                failed: "Gagal",
                cancelled: "Dihentikan",
                unknown: "Hasil belum diketahui",
              } as Record<string, string>
            )[task.state] ?? task.state
          }
        />
      ))}
      {goals.map((goal) => {
        const status =
          goalStates[goal.state === "active" ? goal.work_state : goal.state] ?? "Aktif";
        return (
          <ConversationEvent
            key={goal.id}
            kind="goal"
            icon={
              <HugeiconsIcon
                icon={Target02Icon}
                size={15}
                strokeWidth={1.5}
                className="shrink-0"
                aria-hidden="true"
              />
            }
            label="Goal dibuat"
            name={goal.title}
            status={status}
            accessibleName={`Goal: ${goal.title} · ${status}`}
            onClick={() => open("goals", goal.id)}
          />
        );
      })}
      {routines.map((routine) => {
        const name = routine.instruction.split(/\r?\n/, 1)[0].trim() || "Routine";
        return (
          <ConversationEvent
            key={routine.id}
            kind="routine"
            icon={
              <HugeiconsIcon
                icon={Clock01Icon}
                size={15}
                strokeWidth={1.5}
                className="shrink-0"
                aria-hidden="true"
              />
            }
            label="Routine dibuat"
            name={name}
            status={goalStates[routine.state] ?? "Terjadwal"}
            accessibleName={`Lihat Routine: ${name}`}
            onClick={() => open("routine", routine.id)}
          />
        );
      })}
      {!!run?.sources?.length && (
        <details className="group/sources w-fit max-w-full rounded-xl border border-border/40 bg-panel">
          <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 rounded-xl px-3 py-1.5 text-[13px] hover:bg-secondary [&::-webkit-details-marker]:hidden">
            <HugeiconsIcon icon={LinkSquare02Icon} size={13} strokeWidth={1.5} aria-hidden="true" />
            Sumber riset · {run.sources.length}
            <HugeiconsIcon
              icon={ArrowRight01Icon}
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
