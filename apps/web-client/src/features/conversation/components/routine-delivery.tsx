import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ApiError, command } from "@/lib/api-client";
import type { Routine } from "@/types/work";
import type { Snapshot } from "@/types/workspace";

const conversationOnly = "";

export function RoutineDelivery({
  routine,
  targets,
  refresh,
}: {
  routine: Routine;
  targets: NonNullable<Snapshot["routine_delivery_targets"]>;
  refresh: () => Promise<unknown>;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const current = routine.delivery_target?.id ?? conversationOnly;
  const terminal = routine.state === "completed" || routine.state === "stopped";

  async function save() {
    if (draft === null || draft === current || busy) return;
    setBusy(true);
    setError("");
    try {
      await command(`/v1/routines/${routine.id}/delivery`, {
        expected_revision: routine.revision,
        target_id: draft === conversationOnly ? null : draft,
      });
      await refresh();
      setDraft(null);
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === "CONFLICT") {
        setError("The Routine changed. Choose the destination again.");
        void refresh().catch(() => {});
      } else setError("Could not save the delivery destination.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Delivery" className="space-y-2">
      <h3 className="text-sm font-medium">Delivery</h3>
      <p className="text-sm text-muted-foreground">
        Completed updates appear in this conversation. You can also send them to a destination.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Delivery destination"
          className="max-w-full rounded-md border bg-background px-2.5 py-1.5 text-sm"
          value={draft ?? current}
          disabled={busy || terminal}
          onChange={(event) => {
            setDraft(event.target.value);
            setError("");
          }}
        >
          <option value={conversationOnly}>This conversation only</option>
          {routine.delivery_target && !targets.some(({ id }) => id === current) && (
            <option value={current} disabled>
              {routine.delivery_target.label} (unavailable)
            </option>
          )}
          {targets.map(({ id, label }) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="outline"
          disabled={draft === null || draft === current || busy || terminal}
          onClick={() => void save()}
        >
          Save destination
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
