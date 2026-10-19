import { useAuth } from "@clerk/tanstack-react-start";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useGoalCommands } from "@/features/goals/hooks/use-goals";
import type { Goal, GoalSpec } from "@/features/goals/types";

export function GoalForm({
  threadId,
  goal,
  onClose,
}: {
  threadId: string | null;
  goal?: Goal;
  onClose: () => void;
}) {
  const { userId } = useAuth();
  const formId = useId();
  const command = useGoalCommands();
  const key = `goal-draft:${userId}:${goal?.id ?? threadId}:${goal?.revision ?? "new"}`;
  const [value, setValue] = useState<GoalSpec>(
    goal?.spec ?? {
      title: "",
      target: "",
      criteria: [],
      horizon: "",
      next_action: "",
      budget_cap: 360000,
    },
  );
  const [criteria, setCriteria] = useState(value.criteria.join("\n"));
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) ?? "null");
      if (saved && typeof saved.title === "string" && typeof saved.criteriaText === "string") {
        setValue(saved);
        setCriteria(saved.criteriaText);
      }
    } catch {
      /* Optional draft. */
    }
  }, [key]);
  function update(patch: Partial<GoalSpec>, text = criteria) {
    const next = { ...value, ...patch };
    setValue(next);
    setCriteria(text);
    try {
      sessionStorage.setItem(key, JSON.stringify({ ...next, criteriaText: text }));
    } catch {
      /* Keep in memory. */
    }
  }
  return (
    <form
      className="space-y-4 rounded-2xl border bg-card p-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!threadId) return;
        void command
          .propose(threadId, goal ? "update" : "create", goal?.id, goal?.revision, {
            ...value,
            criteria: criteria
              .split("\n")
              .map((c) => c.trim())
              .filter(Boolean),
          })
          .then((result) => {
            if (result) {
              try {
                sessionStorage.removeItem(key);
              } catch {
                /* Optional draft. */
              }
              onClose();
            }
          });
      }}
    >
      <h2 className="font-bold">{goal ? "Ubah target" : "Buat tujuan"}</h2>
      <label htmlFor={`${formId}-title`} className="block space-y-2 text-sm">
        <span>Nama tujuan</span>
        <Input
          id={`${formId}-title`}
          required
          maxLength={100}
          value={value.title}
          onChange={(e) => update({ title: e.target.value })}
        />
      </label>
      <label htmlFor={`${formId}-target`} className="block space-y-2 text-sm">
        <span>Target yang ingin dicapai</span>
        <Textarea
          id={`${formId}-target`}
          required
          maxLength={2000}
          value={value.target}
          onChange={(e) => update({ target: e.target.value })}
        />
      </label>
      <label htmlFor={`${formId}-criteria`} className="block space-y-2 text-sm">
        <span>Kriteria keberhasilan · satu per baris, maksimal 12</span>
        <Textarea
          id={`${formId}-criteria`}
          required
          maxLength={6000}
          className="min-h-28"
          value={criteria}
          onChange={(e) => update({}, e.target.value)}
        />
      </label>
      <label htmlFor={`${formId}-horizon`} className="block space-y-2 text-sm">
        <span>Horizon waktu (opsional)</span>
        <Input
          id={`${formId}-horizon`}
          maxLength={200}
          value={value.horizon}
          onChange={(e) => update({ horizon: e.target.value })}
          placeholder="Contoh: akhir bulan ini"
        />
      </label>
      <label htmlFor={`${formId}-next`} className="block space-y-2 text-sm">
        <span>Langkah berikutnya (opsional)</span>
        <Textarea
          id={`${formId}-next`}
          maxLength={1000}
          value={value.next_action}
          onChange={(e) => update({ next_action: e.target.value })}
        />
      </label>
      <label htmlFor={`${formId}-budget`} className="block space-y-2 text-sm">
        <span>Batas kerja seluruh Task tujuan · unit internal</span>
        <Input
          id={`${formId}-budget`}
          type="number"
          required
          min={30000}
          max={3000000}
          step={1}
          value={value.budget_cap}
          onChange={(e) => update({ budget_cap: Number(e.target.value) })}
        />
      </label>
      <p className="text-xs text-muted-foreground">
        Tujuan disimpan setelah preview ditinjau. Task dan Jadwal dijalankan melalui keputusan
        tersendiri. Batas kerja memakai unit token internal; bukan harga uang.
      </p>
      {goal ? (
        <p className="text-sm">
          Perubahan target, kriteria atau horizon memulai penilaian bukti baru. Riwayat tetap
          tersimpan; jadwal target lama perlu ditinjau ulang.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button disabled={command.pending || !threadId}>Tinjau tujuan</Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          Tutup form
        </Button>
      </div>
      {!threadId ? <p role="status">Pilih percakapan untuk menyimpan tujuan.</p> : null}
      {command.error ? (
        <p role="alert" className="text-sm text-danger">
          {command.error}
        </p>
      ) : null}
    </form>
  );
}
