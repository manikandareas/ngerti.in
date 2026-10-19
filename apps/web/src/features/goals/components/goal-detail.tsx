import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useGoal, useGoalCommands } from "@/features/goals/hooks/use-goals";
import {
  evidenceLabels,
  type Goal,
  type GoalOperation,
  goalOperationLabels,
  goalStateLabels,
} from "@/features/goals/types";
import { ProactivityScopeControl } from "@/features/proactivity/components/proactivity-scope";
import { taskStatus } from "@/features/tasks/constants";
import { GoalEvidenceForm } from "./goal-evidence-form";
import { GoalEvidenceSource } from "./goal-evidence-source";
import { GoalForm } from "./goal-form";

export function GoalDetailPanel({ id }: { id: string }) {
  const data = useGoal(id);
  const command = useGoalCommands();
  const [editing, setEditing] = useState<Goal | null>(null);
  const [evidence, setEvidence] = useState(false);
  const goal = data.data;
  if (!goal)
    return (
      <div role={data.isError ? "alert" : "status"}>
        <p>{data.isError ? "Tujuan belum dapat dibuka." : "Membuka tujuan…"}</p>
        {data.isError ? (
          <Button variant="outline" onClick={() => void data.refetch()}>
            Coba lagi
          </Button>
        ) : null}
      </div>
    );
  const editable = ["active", "paused"].includes(goal.state);
  const operations: GoalOperation[] = [
    goal.state === "active" ? "pause" : "resume",
    ...(editable ? ["complete" as const] : []),
    ...(goal.state !== "archived" ? ["archive" as const] : []),
  ];
  return (
    <section className="space-y-6" aria-label="Detail tujuan">
      <ProactivityScopeControl scope="goal" id={id} />
      {data.isError ? (
        <p role="alert">
          Sinkronisasi terganggu. Data terakhir ditampilkan; coba muat ulang sebelum mengubah.
        </p>
      ) : null}
      <div className="space-y-3 rounded-2xl border bg-card p-5">
        <p className="text-xs text-muted-foreground">
          {goalStateLabels[goal.state]} · target v{goal.plan_revision}
        </p>
        <h2 className="text-xl font-bold wrap-anywhere">{goal.spec.title}</h2>
        <p className="whitespace-pre-wrap wrap-anywhere text-sm">{goal.spec.target}</p>
        {goal.spec.horizon ? <p className="text-sm">Horizon: {goal.spec.horizon}</p> : null}
        <p className="font-medium">
          {goal.met} dari {goal.spec.criteria.length} kriteria terpenuhi
        </p>
        {goal.needs_review ? (
          <p role="status" className="text-sm text-danger">
            Sebagian sumber berubah atau tidak tersedia. Tinjau kembali bukti; penilaian tersebut
            tidak dihitung terpenuhi.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {editable ? (
            <Button
              variant="outline"
              onClick={() => {
                setEditing(goal);
                setEvidence(false);
              }}
            >
              Ubah target
            </Button>
          ) : null}
          {operations.map((op) => (
            <Button
              key={op}
              variant="outline"
              disabled={
                command.pending || (op === "complete" && goal.met !== goal.spec.criteria.length)
              }
              onClick={() => void command.propose(goal.thread_id, op, goal.id, goal.revision)}
            >
              {goalOperationLabels[op]}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Jeda menahan pekerjaan berikutnya dari jadwal terkait. Task yang sudah dibuat dapat
          dihentikan terpisah.
        </p>
        {command.error ? (
          <p role="alert" className="text-sm text-danger">
            {command.error}
          </p>
        ) : null}
      </div>
      {editing ? (
        <GoalForm goal={editing} threadId={editing.thread_id} onClose={() => setEditing(null)} />
      ) : null}
      <section className="space-y-3">
        <h3 className="font-bold">Kriteria dan bukti kemajuan</h3>
        <ol className="divide-y border-y">
          {goal.spec.criteria.map((criterion, index) => {
            const item = goal.evidence.find((e) => e.criterion === index);
            return (
              <li key={criterion} className="space-y-3 py-4 text-sm">
                <p className="font-medium wrap-anywhere">
                  {index + 1}. {criterion}
                </p>
                <p>
                  {item
                    ? item.available
                      ? evidenceLabels[item.state]
                      : "Bukti perlu ditinjau"
                    : "Belum ada bukti"}
                </p>
                {item ? (
                  <>
                    <p className="whitespace-pre-wrap wrap-anywhere text-muted-foreground">
                      {item.note}
                    </p>
                    {item.available ? <GoalEvidenceSource source={item.source} /> : null}
                  </>
                ) : null}
              </li>
            );
          })}
        </ol>
        {editable ? (
          <Button
            variant="outline"
            onClick={() => {
              setEvidence(!evidence);
              setEditing(null);
            }}
          >
            {evidence ? "Tutup form bukti" : "Catat bukti kemajuan"}
          </Button>
        ) : null}
      </section>
      {evidence && editable ? (
        <GoalEvidenceForm goal={goal} onClose={() => setEvidence(false)} />
      ) : null}
      <section className="space-y-3">
        <h3 className="font-bold">Langkah berikutnya</h3>
        <p className="whitespace-pre-wrap wrap-anywhere text-sm">
          {goal.spec.next_action ||
            "Belum ditentukan. Ubah target atau bicarakan langkah berikutnya melalui chat."}
        </p>
        <p className="text-xs text-muted-foreground">
          Pilih tujuan ini saat membuat Task atau Jadwal. Menyimpan langkah berikutnya tidak
          menjalankan pekerjaan.
        </p>
        <div className="flex flex-wrap gap-3">
          {(
            [
              ["chat", "Bicarakan"],
              ["tasks", "Buat Task"],
              ["schedules", "Atur Jadwal"],
            ] as const
          ).map(([view, label]) => (
            <Link
              key={view}
              to="/"
              search={{ thread: goal.thread_id, view }}
              className="inline-flex min-h-11 items-center underline"
            >
              {label}
            </Link>
          ))}
        </div>
      </section>
      <section className="space-y-2 text-sm">
        <h3 className="font-bold">Batas kerja tujuan</h3>
        <p>
          {goal.budget.used.toLocaleString("id-ID")} unit terpakai ·{" "}
          {(goal.budget.committed - goal.budget.used).toLocaleString("id-ID")} dicadangkan · batas{" "}
          {goal.spec.budget_cap.toLocaleString("id-ID")}.
        </p>
        <p className="text-xs text-muted-foreground">
          Mencakup seluruh Task tujuan lintas revisi. Evaluasi bukti di panel tidak memakai model.
          Permintaan melalui chat mengikuti penggunaan percakapan.
        </p>
      </section>
      <section className="space-y-3">
        <h3 className="font-bold">Pekerjaan terkait</h3>
        {!goal.tasks.length ? (
          <p className="text-sm text-muted-foreground">Belum ada Task untuk tujuan ini.</p>
        ) : (
          <ul className="divide-y border-y">
            {goal.tasks.map((t) => (
              <li key={t.id} className="space-y-1 py-3 text-sm">
                <p className="wrap-anywhere">{t.title}</p>
                <p className="text-xs text-muted-foreground">
                  {taskStatus[t.status as keyof typeof taskStatus] ?? t.status} · target v
                  {t.goal_revision}
                  {t.goal_revision !== goal.plan_revision ? " · target terdahulu" : ""}
                </p>
                <Link
                  className="inline-flex min-h-10 items-center underline"
                  to="/"
                  search={{ thread: t.thread_id, view: "tasks" }}
                >
                  Buka Task dan hasil
                </Link>
              </li>
            ))}
          </ul>
        )}
        {goal.schedules.map((s) => (
          <p key={s.id} className="text-sm wrap-anywhere">
            Jadwal: {s.spec.title} · {s.state}
            {goal.state !== "active"
              ? " · ditahan oleh tujuan"
              : s.spec.goal.revision !== goal.plan_revision
                ? " · perlu tinjau target baru"
                : ""}
          </p>
        ))}
      </section>
      <details className="text-sm">
        <summary className="cursor-pointer py-2">Riwayat target dan penilaian</summary>
        <div className="space-y-3">
          {goal.history.map((h) => (
            <div key={h.revision} className="rounded-xl border p-3">
              <p>
                Versi {h.revision} · target v{h.plan_revision} · {goalOperationLabels[h.operation]}
              </p>
              <p className="mt-1 text-xs">{new Date(h.created_at).toLocaleString("id-ID")}</p>
              {["create", "update"].includes(h.operation) ? (
                <p className="mt-2 whitespace-pre-wrap wrap-anywhere">
                  {h.spec.target}
                  {"\n"}
                  {h.spec.criteria.join("\n")}
                </p>
              ) : null}
            </div>
          ))}
          {goal.evidence_history.map((e) => (
            <p key={e.id} className="whitespace-pre-wrap wrap-anywhere">
              Target v{e.plan_revision}, kriteria {e.criterion + 1} · {evidenceLabels[e.state]} ·{" "}
              {e.note}
            </p>
          ))}
        </div>
      </details>
    </section>
  );
}
