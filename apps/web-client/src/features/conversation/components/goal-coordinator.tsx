import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError, command } from "@/lib/api-client";
import type { Goal } from "@/types/work";
import type { Snapshot } from "@/types/workspace";

export function GoalCoordinator({
  goal,
  snapshot,
  refresh,
}: {
  goal: Goal;
  snapshot: Snapshot;
  refresh: () => Promise<unknown>;
}) {
  const members = snapshot.agents.filter((agent) =>
    snapshot.thread.member_agent_ids.includes(agent.id),
  );
  const [draft, setDraft] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Goal | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const current = confirmed && confirmed.revision >= goal.revision ? confirmed : goal;
  const assigned = members.find((member) => member.id === current.coordinator_agent_id);
  const selected = members.some(({ id }) => id === draft) ? draft : null;
  const editable = ["active", "paused"].includes(current.state) && members.length > 0;

  async function assign() {
    if (!selected || assigned?.id === selected || busy) return;
    setBusy(true);
    setError("");
    try {
      setConfirmed(
        await command<Goal>(`/v1/goals/${goal.id}/assignment`, {
          agent_id: selected,
          expected_revision: current.revision,
        }),
      );
      setDraft(null);
    } catch (failure) {
      setError(
        failure instanceof ApiError && failure.code === "CONFLICT"
          ? "The Goal changed. Choose a coordinator again."
          : failure instanceof Error
            ? failure.message
            : "Could not assign the coordinator.",
      );
    } finally {
      setBusy(false);
      void refresh().catch(() => {});
    }
  }

  return (
    <section aria-label="Goal coordinator" className="space-y-2">
      <h3 className="text-sm font-medium">Coordinator</h3>
      {editable ? (
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={selected ?? assigned?.id ?? ""}
            onValueChange={(value) => {
              setDraft(value);
              setError("");
            }}
            disabled={busy}
          >
            <SelectTrigger aria-label="Coordinator">
              <SelectValue placeholder="Choose an agent" />
            </SelectTrigger>
            <SelectContent>
              {members.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  {member.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            disabled={!selected || selected === assigned?.id || busy}
            onClick={() => void assign()}
          >
            Assign
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{assigned?.name ?? "Unassigned"}</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
