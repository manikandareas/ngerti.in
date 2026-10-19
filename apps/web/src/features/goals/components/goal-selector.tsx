import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGoals } from "@/features/goals/hooks/use-goals";
import type { GoalRef } from "@/features/goals/types";

export function GoalSelector({
  value,
  onChange,
  disabled = false,
  id,
}: {
  value?: GoalRef | null;
  onChange: (goal: GoalRef | null) => void;
  disabled?: boolean;
  id: string;
}) {
  const data = useGoals();
  const goals = data.data?.goals.filter((g) => g.state === "active") ?? [];
  const selected = value ? `${value.id}:${value.revision}` : "none";
  const stale =
    value && !goals.some((g) => g.id === value.id && g.plan_revision === value.revision);
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm">
        Tujuan terkait (opsional)
      </label>
      <Select
        value={selected}
        disabled={disabled || data.isPending}
        onValueChange={(next) => {
          const [goalId, revision] = next.split(":");
          onChange(next === "none" ? null : { id: goalId, revision: Number(revision) });
        }}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Tanpa tujuan</SelectItem>
          {stale ? (
            <SelectItem value={selected} disabled>
              Target lama atau dijeda · tinjau pilihan
            </SelectItem>
          ) : null}
          {goals.map((g) => (
            <SelectItem key={g.id} value={`${g.id}:${g.plan_revision}`}>
              {g.spec.title} · target v{g.plan_revision}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {data.isError ? (
        <p role="alert" className="text-sm">
          Tujuan belum dapat dimuat.{" "}
          <button type="button" className="underline" onClick={() => void data.refetch()}>
            Coba lagi
          </button>
        </p>
      ) : null}
      {value ? (
        <p className="text-xs text-muted-foreground">
          Memakai target yang dipilih dan sisa batas kerja tujuan. Perubahan target memerlukan
          peninjauan ulang.
        </p>
      ) : null}
    </div>
  );
}
