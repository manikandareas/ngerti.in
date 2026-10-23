import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { WorkspaceState } from "@/components/workspace-state";
import { useResourceContext } from "@/features/library/components/resource-context";
import { useResourceSelection } from "@/features/library/hooks/use-library";
import { useScheduleCommands, useSchedules } from "@/features/schedules/hooks/use-schedules";
import type { Schedule } from "@/features/schedules/types";
import { recurrenceLabel, timeLabel } from "@/features/schedules/utils/presentation";
import { ScheduleForm } from "./schedule-form";
import { ScheduleHistory } from "./schedule-history";
import { ScheduleProposalCard } from "./schedule-proposal";

export function SchedulePanel({ threadId }: { threadId: string | null }) {
  const context = useResourceContext();
  const data = useSchedules();
  const [editing, setEditing] = useState<Schedule | null>(null);
  const [creating, setCreating] = useState(false);
  return (
    <div className="space-y-7">
      <Button
        onClick={() =>
          context.prepare(
            "Bantu aku menjadwalkan pekerjaan berikut. Tanyakan waktu dan pengulangan yang belum jelas, lalu tampilkan proposal beserta biaya dan izin sebelum aktivasi.\n\nPekerjaannya: ",
          )
        }
      >
        {" "}
        Rencanakan lewat chat
      </Button>
      <p className="text-sm text-muted-foreground">
        Buat melalui chat atau form. Tinjau instruksi, waktu, izin dan batas kerja sebelum
        mengaktifkan.
      </p>
      <Button
        onClick={() => {
          setCreating(!creating);
          setEditing(null);
        }}
      >
        {creating ? "Tutup form" : "Isi jadwal sendiri"}
      </Button>
      {creating || editing ? (
        <ScheduleForm
          key={editing ? `${editing.id}:${editing.revision}` : `new:${threadId}`}
          threadId={editing?.thread_id ?? threadId}
          schedule={editing ?? undefined}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      ) : null}
      {data.isError ? (
        <WorkspaceState
          kind="error"
          title="Jadwal belum tersinkron"
          description="Data terakhir tetap ditampilkan jika tersedia."
          onRetry={() => void data.refetch()}
        />
      ) : null}
      {data.data?.proposals.length ? (
        <section className="space-y-3" aria-label="Usulan jadwal">
          {data.data.proposals.map((p) => (
            <ScheduleProposalCard key={p.id} proposal={p} />
          ))}
        </section>
      ) : null}
      <section className="space-y-3">
        <h2 className="font-bold">Berikutnya · Upcoming</h2>
        {data.isPending ? (
          <WorkspaceState kind="loading" title="Membuka jadwal…" />
        ) : data.data?.schedules.some((s) => s.state !== "deleted") ? (
          data.data.schedules
            .filter((s) => s.state !== "deleted")
            .map((schedule) => (
              <ScheduleCard
                key={schedule.id}
                schedule={schedule}
                onEdit={() => {
                  setEditing(schedule);
                  setCreating(false);
                }}
              />
            ))
        ) : (
          <WorkspaceState
            kind="empty"
            title="Belum ada jadwal"
            description="Contoh: setiap Senin pukul 08.00 WITA, buat ringkasan dari halaman yang kamu pilih."
          />
        )}
      </section>
      <ScheduleHistory
        occurrences={data.data?.occurrences ?? []}
        schedules={data.data?.schedules ?? []}
      />
    </div>
  );
}

export function ScheduleCard({ schedule, onEdit }: { schedule: Schedule; onEdit: () => void }) {
  const context = useResourceContext();
  const selection = useResourceSelection(context.threadId);
  const command = useScheduleCommands();
  return (
    <article className="space-y-3 rounded-2xl border bg-card p-5 text-sm">
      <h3 className="font-bold wrap-anywhere">{schedule.spec.title}</h3>
      <p>
        {schedule.state === "paused"
          ? "Dijeda"
          : schedule.next_due
            ? "Aktif"
            : "Tidak ada waktu berikutnya"}{" "}
        · versi {schedule.revision}
      </p>
      <p>{recurrenceLabel(schedule.spec)}</p>
      {schedule.error ? (
        <p className="text-danger" role="status">
          {schedule.error}
        </p>
      ) : null}
      {schedule.next_due ? (
        <p>Berikutnya: {timeLabel(schedule.next_due, schedule.spec.timezone)}</p>
      ) : null}
      <p className="whitespace-pre-wrap wrap-anywhere text-muted-foreground">
        {schedule.spec.instruction}
      </p>
      {schedule.spec.goal ? (
        <p className="wrap-anywhere">
          Tujuan: {schedule.goal_title ?? "Tidak tersedia"} · target v{schedule.spec.goal.revision}
          {schedule.goal_state !== "active"
            ? " · eksekusi ditahan oleh tujuan"
            : schedule.goal_plan_revision !== schedule.spec.goal.revision
              ? " · target berubah, tinjau ulang jadwal"
              : ""}
        </p>
      ) : null}
      <Link
        to="/"
        search={{ thread: schedule.thread_id, view: "chat" }}
        className="inline-flex min-h-10 items-center underline"
      >
        Hasil ke: {schedule.thread_title}
      </Link>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={selection.select.isPending}
          onClick={() =>
            selection.select.mutate(
              { kind: "schedule", id: schedule.id, revision: schedule.revision },
              {
                onSuccess: () => {
                  context.open({ kind: "schedule", id: schedule.id, revision: schedule.revision });
                  context.discuss();
                },
              },
            )
          }
        >
          Bicarakan jadwal ini
        </Button>
        <Button variant="outline" onClick={onEdit}>
          Edit
        </Button>
        {([schedule.state === "active" ? "pause" : "resume", "run", "delete"] as const).map(
          (operation) => (
            <Button
              key={operation}
              variant="outline"
              disabled={
                command.pending ||
                ((schedule.workflow_version ?? 1) !== 1 && operation !== "delete")
              }
              onClick={() =>
                void command.propose(
                  schedule.thread_id,
                  operation,
                  undefined,
                  schedule.id,
                  schedule.revision,
                )
              }
            >
              {
                { pause: "Jeda", resume: "Lanjutkan", run: "Jalankan sekarang", delete: "Hapus" }[
                  operation
                ]
              }
            </Button>
          ),
        )}
      </div>
      {selection.select.isError ? (
        <p role="alert">Konteks jadwal belum tersimpan. Coba lagi.</p>
      ) : null}
      {command.error ? (
        <p role="alert" className="text-danger">
          {command.error}
        </p>
      ) : null}
    </article>
  );
}
