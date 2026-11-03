import {
  BubbleChatIcon,
  Calendar03Icon,
  File02Icon,
  Target02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import type { Snapshot } from "@/types/workspace";
import { PanelCard, PanelEmpty, PanelNavRow, PanelPageHeader } from "./panel-primitives";
import { ResponsibilityControls } from "./responsibility-controls";

const labels: Record<string, string> = {
  active: "Aktif",
  paused: "Dijeda",
  stopped: "Dihentikan",
  completed: "Selesai",
  blocked: "Terhambat",
  waiting: "Menunggu",
  waiting_assignment: "Menunggu penanggung jawab",
  routing: "Memilih pelaksana",
  queued: "Menunggu giliran",
  running: "Sedang bekerja",
  unknown: "Hasil belum diketahui",
  cancelled: "Dihentikan",
  failed: "Terhambat",
  ready: "Siap",
  completion_pending: "Memeriksa hasil",
};
export function time(value: string | null, timezone?: string) {
  return value
    ? new Intl.DateTimeFormat("id-ID", {
        dateStyle: "medium",
        timeStyle: "short",
        ...(timezone ? { timeZone: timezone } : {}),
      }).format(new Date(value))
    : "—";
}
export function Responsibilities({
  kind,
  snapshot,
  selected,
  select,
  compose,
  openFile,
  openGoal,
  source,
  refresh,
}: {
  kind: "goals" | "routine";
  snapshot: Snapshot;
  selected: string | null;
  select: (id: string | null) => void;
  compose: (text: string) => void;
  openFile: (id: string) => void;
  openGoal: (id: string) => void;
  source: (id?: string) => void;
  refresh: () => Promise<unknown>;
}) {
  const goal = kind === "goals" ? snapshot.goals.find((g) => g.id === selected) : null;
  const routine = kind === "routine" ? snapshot.routines.find((r) => r.id === selected) : null;
  const responsibleId = goal
    ? (goal.coordinator_agent_id ?? goal.agent_id)
    : routine?.execution_target?.type === "agent"
      ? routine.execution_target.agent_id
      : routine?.agent_id;
  const responsible = snapshot.agents.find((a) => a.id === responsibleId);
  const address =
    snapshot.thread.type === "group" && responsible?.handle ? `@${responsible.handle} ` : "";
  if (goal)
    return (
      <div className="context-section space-y-3.5 pt-3.5">
        <PanelPageHeader title={goal.title} back="Goals" onBack={() => select(null)} />
        <div>
          <p className="mt-1 text-caption text-muted-foreground">
            {labels[goal.state]} ·{" "}
            {goal.state === "active" ? `${labels[goal.work_state] ?? goal.work_state} · ` : ""}
            {goal.scope === "group" ? "Milik grup · " : ""}
            {responsible ? `Koordinator: ${responsible.name}` : "Menunggu penanggung jawab"}
          </p>
        </div>
        <PanelCard label="Tujuan">
          <p className="whitespace-pre-wrap px-3.5 py-3 text-[13px] leading-[1.5]">
            {goal.objective || goal.title}
          </p>
        </PanelCard>
        <PanelCard label="Progres dan hambatan">
          <div className="space-y-2 px-3.5 py-3">
            <p className="whitespace-pre-wrap text-sm">
              {goal.progress || "Progres akan muncul setelah agent melaporkan pekerjaannya."}
            </p>
            {goal.continuation_at && (
              <p className="text-caption">Lanjutan: {time(goal.continuation_at)}</p>
            )}
          </div>
        </PanelCard>
        {goal.scope === "group" && (
          <PanelCard label="Kontributor">
            <p className="px-3.5 py-3 text-[13px]">
              {[
                ...new Set(
                  snapshot.artifacts
                    .filter((file) => goal.evidence_artifact_ids.includes(file.id))
                    .map(
                      (file) =>
                        snapshot.agents.find((agent) => agent.id === file.created_by_agent_id)
                          ?.name,
                    )
                    .filter(Boolean),
                ),
              ].join(", ") || "Hasil dari anggota akan tercatat di sini."}
            </p>
          </PanelCard>
        )}
        <PanelCard label="Hasil dan bukti">
          {goal.evidence_artifact_ids.length ? (
            goal.evidence_artifact_ids.map((id) => (
              <PanelNavRow
                key={id}
                icon={File02Icon}
                title={snapshot.artifacts.find((a) => a.id === id)?.name ?? "Buka bukti hasil"}
                onClick={() => openFile(id)}
              />
            ))
          ) : (
            <PanelEmpty>Belum ada bukti hasil.</PanelEmpty>
          )}
        </PanelCard>
        <Button variant="outline" size="sm" onClick={() => source(goal.source_message_ids[0])}>
          <HugeiconsIcon icon={BubbleChatIcon} size={13} strokeWidth={1.5} />
          Lihat percakapan asal
        </Button>
        <p className="text-caption text-muted-foreground">
          Stop run menghentikan satu eksekusi. Pause/stop goal juga menghentikan kelanjutannya.
        </p>
        <ResponsibilityControls item={goal} kind="goal" refresh={refresh} />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => compose(`${address}Bantu perbarui goal "${goal.title}": `)}
        >
          Ubah goal melalui chat
        </Button>
      </div>
    );
  if (routine) {
    const schedule = routine.schedule;
    const description =
      schedule.type === "once"
        ? `Sekali · ${time(schedule.at, routine.timezone)}`
        : schedule.type === "calendar"
          ? `Hari ${schedule.weekdays.map((d) => ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"][d]).join(", ")} · ${schedule.local_time}`
          : `${schedule.type === "heartbeat" ? "Pemeriksaan berkala" : "Berulang"} · setiap ${schedule.every_ms / 1000} detik`;
    const occurrences = snapshot.occurrences
      .filter((o) => o.routine_id === routine.id)
      .slice(-5)
      .reverse();
    return (
      <div className="context-section space-y-3.5 pt-3.5">
        <PanelPageHeader title={routine.instruction} back="Routine" onBack={() => select(null)} />
        <ResponsibilityControls
          item={routine}
          kind="routine"
          refresh={refresh}
          blocked={
            !!routine.goal_id &&
            snapshot.goals.find((item) => item.id === routine.goal_id)?.state !== "active"
          }
        />
        <PanelCard label="Penanggung jawab">
          <div className="space-y-1 px-3.5 py-3 text-[13px]">
            <p>
              {routine.scope === "group" ? "Milik grup · " : ""}
              {routine.execution_target?.type === "auto"
                ? "Pelaksana dipilih otomatis"
                : (responsible?.name ?? "Menunggu penanggung jawab")}
            </p>
            {routine.assignment_state !== "ready" && (
              <p className="text-muted-foreground">
                {labels[routine.assignment_state] ?? "Pelaksanaan membutuhkan perhatian."}
              </p>
            )}
          </div>
        </PanelCard>
        <PanelCard label="Jadwal">
          <dl className="divide-y divide-foreground/[0.05] text-[13px] [&>div]:px-3.5 [&>div]:py-3 [&_dt]:mb-1">
            <div>
              <dt className="text-muted-foreground">Jadwal</dt>
              <dd>{description}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Timezone</dt>
              <dd>{routine.timezone}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Berikutnya</dt>
              <dd>{time(routine.next_run_at, routine.timezone)}</dd>
            </div>
          </dl>
        </PanelCard>
        {routine.goal_id && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (routine.goal_id) openGoal(routine.goal_id);
            }}
          >
            Terkait goal:{" "}
            {snapshot.goals.find((g) => g.id === routine.goal_id)?.title ?? "Lihat konteks"}
          </Button>
        )}
        <PanelCard label="Hasil sebelumnya">
          {occurrences.length ? (
            occurrences.map((o) => {
              const run = snapshot.runs.find((r) => r.id === o.run_id);
              const answer = snapshot.messages.find(
                (m) => m.run_id === o.run_id && m.author === "agent",
              );
              return (
                <div key={o.id} className="px-3.5 py-3 text-[13px] leading-[1.5]">
                  <p className="text-caption text-muted-foreground">
                    {time(o.scheduled_for, routine.timezone)} ·{" "}
                    {labels[o.state] ?? labels[run?.status ?? ""] ?? "Menunggu"}
                    {o.selected_agent_id
                      ? ` · ${snapshot.agents.find((agent) => agent.id === o.selected_agent_id)?.name ?? "Anggota"}`
                      : ""}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">
                    {answer?.text ||
                      (run?.publication === "quiet"
                        ? "Tidak ada perubahan yang perlu dikabarkan."
                        : "Hasil belum tersedia.")}
                  </p>
                  {snapshot.artifacts
                    .filter((a) => a.run_id === o.run_id)
                    .map((a) => (
                      <Button key={a.id} variant="ghost" size="sm" onClick={() => openFile(a.id)}>
                        {a.name}
                      </Button>
                    ))}
                </div>
              );
            })
          ) : (
            <PanelEmpty>Belum ada pelaksanaan.</PanelEmpty>
          )}
        </PanelCard>
        <Button
          variant="outline"
          size="sm"
          onClick={() => source(routine.source_message_id ?? undefined)}
        >
          <HugeiconsIcon icon={BubbleChatIcon} size={13} strokeWidth={1.5} />
          Lihat percakapan asal
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => compose(`${address}Ubah Routine "${routine.instruction}": `)}
        >
          Ubah atau batalkan melalui chat
        </Button>
      </div>
    );
  }
  const items =
    kind === "goals"
      ? snapshot.goals.map((g) => ({
          id: g.id,
          title: g.title,
          state: labels[g.state],
          detail: `${g.scope === "group" ? "Milik grup · " : ""}${g.progress || labels[g.work_state]}`,
          resource: g,
        }))
      : snapshot.routines.map((r) => ({
          id: r.id,
          title: r.instruction,
          state: labels[r.state],
          resource: r,
          detail: r.next_run_at
            ? `${time(r.next_run_at, r.timezone)} · ${r.timezone}`
            : "Tidak dijadwalkan",
        }));
  return (
    <div className="context-section pt-3.5">
      <p className="mx-1 mb-3.5 text-[13px] leading-[1.5] text-muted-foreground">
        {kind === "goals"
          ? "Tanggung jawab dicatat dari percakapan. Progres dan bukti mengikuti pekerjaan agent."
          : "Jadwal dan pemeriksaan dibuat dari kebutuhan yang kamu ceritakan. Backend dan host harness perlu tetap hidup."}
      </p>
      <PanelCard>
        {items.length ? (
          items.map((item) => {
            const routineItem = "instruction" in item.resource ? item.resource : null;
            return routineItem ? (
              <ResponsibilityControls
                key={item.id}
                item={routineItem}
                kind="routine"
                refresh={refresh}
                compact
                blocked={
                  !!routineItem.goal_id &&
                  snapshot.goals.find((goal) => goal.id === routineItem.goal_id)?.state !== "active"
                }
              >
                {(disabled) => (
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label={item.title}
                    onClick={() => select(item.id)}
                    className="block w-full text-left hover:text-link"
                  >
                    <span className="block break-words text-[14px] font-medium leading-snug">
                      {item.title}
                    </span>
                    <span className="mt-0.5 block text-[13px] leading-[1.35] text-muted-foreground">
                      {item.detail}
                    </span>
                  </button>
                )}
              </ResponsibilityControls>
            ) : (
              <PanelNavRow
                key={item.id}
                title={item.title}
                aria-label={item.title}
                icon={kind === "goals" ? Target02Icon : Calendar03Icon}
                hint={
                  <span className="line-clamp-2">
                    {item.state} · {item.detail}
                  </span>
                }
                onClick={() => select(item.id)}
              />
            );
          })
        ) : (
          <PanelEmpty>
            {kind === "goals"
              ? "Belum ada tanggung jawab. Ceritakan pekerjaan yang ingin kamu urus bersama."
              : "Belum ada Routine. Minta jadwal atau pemeriksaan berkala lewat percakapan."}
          </PanelEmpty>
        )}
      </PanelCard>
    </div>
  );
}
