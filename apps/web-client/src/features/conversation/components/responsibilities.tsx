import { Button } from "@/components/ui/button";
import type { Snapshot } from "@/types/workspace";

const labels: Record<string, string> = {
  active: "Aktif",
  paused: "Dijeda",
  stopped: "Dihentikan",
  completed: "Selesai",
  blocked: "Terhambat",
  waiting: "Menunggu",
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
}: {
  kind: "goals" | "routine";
  snapshot: Snapshot;
  selected: string | null;
  select: (id: string | null) => void;
  compose: (text: string) => void;
  openFile: (id: string) => void;
  openGoal: (id: string) => void;
  source: (id?: string) => void;
}) {
  const goal = kind === "goals" ? snapshot.goals.find((g) => g.id === selected) : null;
  const routine = kind === "routine" ? snapshot.routines.find((r) => r.id === selected) : null;
  const responsible = snapshot.agents.find((a) => a.id === (goal?.agent_id ?? routine?.agent_id));
  const address =
    snapshot.thread.type === "group" && responsible?.handle ? `@${responsible.handle} ` : "";
  if (goal)
    return (
      <div className="context-section space-y-5">
        <Button variant="ghost" size="sm" onClick={() => select(null)}>
          ← Goals
        </Button>
        <div>
          <h3 className="font-medium">{goal.title}</h3>
          <p className="mt-1 text-caption text-muted-foreground">
            {labels[goal.state]} · {labels[goal.work_state] ?? goal.work_state} ·{" "}
            {snapshot.agents.find((a) => a.id === goal.agent_id)?.name}
          </p>
        </div>
        <p className="whitespace-pre-wrap text-sm">{goal.objective || goal.title}</p>
        <section className="space-y-2">
          <h4 className="text-caption font-medium text-muted-foreground">Progres dan hambatan</h4>
          <p className="whitespace-pre-wrap text-sm">
            {goal.progress || "Progres akan muncul setelah agent melaporkan pekerjaannya."}
          </p>
          {goal.continuation_at && (
            <p className="text-caption">Lanjutan: {time(goal.continuation_at)}</p>
          )}
        </section>
        <section className="space-y-2">
          <h4 className="text-caption font-medium text-muted-foreground">Hasil dan bukti</h4>
          {goal.evidence_artifact_ids.length ? (
            goal.evidence_artifact_ids.map((id) => (
              <Button
                key={id}
                variant="ghost"
                className="h-auto w-full justify-start whitespace-normal text-left"
                onClick={() => openFile(id)}
              >
                {snapshot.artifacts.find((a) => a.id === id)?.name ?? "Buka bukti hasil"} →
              </Button>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Belum ada bukti hasil.</p>
          )}
        </section>
        <Button variant="outline" size="sm" onClick={() => source(goal.source_message_ids[0])}>
          Lihat percakapan asal
        </Button>
        <p className="text-caption text-muted-foreground">
          Stop run menghentikan satu eksekusi. Pause/stop goal juga menghentikan kelanjutannya.
        </p>
        {goal.state !== "completed" && goal.state !== "stopped" && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                compose(
                  `${address}${goal.state === "paused" ? "Lanjutkan" : "Jeda"} goal "${goal.title}" (ID ${goal.id}).`,
                )
              }
            >
              {goal.state === "paused" ? "Lanjutkan goal melalui chat" : "Jeda goal melalui chat"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                compose(
                  `${address}Hentikan goal "${goal.title}" (ID ${goal.id}) beserta kelanjutan dan Routine terkait.`,
                )
              }
            >
              Hentikan goal melalui chat
            </Button>
          </div>
        )}
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
      <div className="context-section space-y-5">
        <Button variant="ghost" size="sm" onClick={() => select(null)}>
          ← Routine
        </Button>
        <h3 className="font-medium">{routine.instruction}</h3>
        <p className="text-caption">{labels[routine.state] ?? routine.state}</p>
        <dl className="space-y-3 text-sm">
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
        <section className="space-y-3">
          <h4 className="text-caption font-medium text-muted-foreground">Hasil sebelumnya</h4>
          {occurrences.length ? (
            occurrences.map((o) => {
              const run = snapshot.runs.find((r) => r.id === o.run_id);
              const answer = snapshot.messages.find(
                (m) => m.run_id === o.run_id && m.author === "agent",
              );
              return (
                <div key={o.id} className="border-b pb-3 text-sm">
                  <p className="text-caption text-muted-foreground">
                    {time(o.scheduled_for, routine.timezone)} · {run?.status ?? "Menunggu"}
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
            <p className="text-sm text-muted-foreground">Belum ada pelaksanaan.</p>
          )}
        </section>
        <Button
          variant="outline"
          size="sm"
          onClick={() => source(routine.source_message_id ?? undefined)}
        >
          Lihat percakapan asal
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            compose(`${address}Ubah Routine "${routine.instruction}" (ID ${routine.id}): `)
          }
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
          detail: g.progress || labels[g.work_state],
        }))
      : snapshot.routines.map((r) => ({
          id: r.id,
          title: r.instruction,
          state: labels[r.state],
          detail: r.next_run_at
            ? `${time(r.next_run_at, r.timezone)} · ${r.timezone}`
            : "Tidak dijadwalkan",
        }));
  return (
    <div className="context-section space-y-3">
      <p className="text-caption text-muted-foreground">
        {kind === "goals"
          ? "Tanggung jawab dicatat dari percakapan. Progres dan bukti mengikuti pekerjaan agent."
          : "Jadwal dan pemeriksaan dibuat dari kebutuhan yang kamu ceritakan. Backend dan host harness perlu tetap hidup."}
      </p>
      {items.length ? (
        items.map((item) => (
          <Button
            key={item.id}
            aria-label={item.title}
            variant="ghost"
            className="h-auto min-h-16 w-full justify-start border-b px-1 py-3 text-left whitespace-normal"
            onClick={() => select(item.id)}
          >
            <span className="min-w-0">
              <span className="block font-medium">{item.title}</span>
              <span className="mt-1 block text-caption text-muted-foreground">
                {item.state} · {item.detail}
              </span>
            </span>
          </Button>
        ))
      ) : (
        <p className="py-8 text-sm text-muted-foreground">
          {kind === "goals"
            ? "Belum ada tanggung jawab. Ceritakan pekerjaan yang ingin kamu urus bersama."
            : "Belum ada Routine. Minta jadwal atau pemeriksaan berkala lewat percakapan."}
        </p>
      )}
    </div>
  );
}
