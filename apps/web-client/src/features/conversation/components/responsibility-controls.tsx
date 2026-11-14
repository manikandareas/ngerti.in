import { Loading03Icon, PauseIcon, PlayIcon, StopIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { routineName } from "@/features/conversation/lib/routine-name";
import { ApiError, durableCommand } from "@/lib/api-client";
import { scopedStorageKey } from "@/lib/client-scope";
import type { Goal, Routine } from "@/types/work";

const stateLabels: Record<string, string> = {
  active: "Active",
  paused: "Paused",
  stopped: "Stopped",
  completed: "Completed",
};

type ControlState = "active" | "paused" | "stopped";
type PendingControl = { state: ControlState; expected_revision?: number };
type ResponsibilityControlsProps = {
  refresh: () => Promise<unknown>;
  blocked?: boolean;
  actions?: ReactNode;
} & ({ kind: "goal"; item: Goal } | { kind: "routine"; item: Routine });
function savedControl(slot: string): PendingControl | null {
  try {
    const saved = localStorage.getItem(scopedStorageKey(`ngertiin:pending:${slot}`));
    return saved ? (JSON.parse(saved) as { body: PendingControl }).body : null;
  } catch {
    return null;
  }
}

// Source TriggersPage/AutomationPanel controls, using Ngertiin's gated durable command receipts.
export function ResponsibilityControls({
  item,
  kind,
  refresh,
  blocked = false,
  actions,
}: ResponsibilityControlsProps) {
  const slot = `responsibility:${kind}:${item.id}`;
  const [pending, setPending] = useState(() => savedControl(slot));
  const [confirmed, setConfirmed] = useState<Goal | Routine | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const lock = useRef(false);
  const current = confirmed && confirmed.revision >= item.revision ? confirmed : item;
  const terminal = current.state === "stopped" || current.state === "completed";
  const name = kind === "goal" ? item.title : routineName(item);
  async function apply(state: ControlState) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const body = pending ?? {
      state,
      ...(kind === "routine" ? { expected_revision: current.revision } : {}),
    };
    setPending(body);
    try {
      const result = await durableCommand<Goal | Routine>(
        slot,
        `/v1/${kind === "goal" ? "goals" : "routines"}/${item.id}/control`,
        body,
      );
      setConfirmed(result);
      setPending(null);
      setNotice(
        `${kind === "goal" ? "Goal" : "Routine"} ${stateLabels[result.state]?.toLowerCase() ?? "updated"}.`,
      );
      await refresh();
    } catch (failure) {
      if (
        failure instanceof ApiError &&
        [
          "CONFLICT",
          "INVALID_REQUEST",
          "SCOPE_DENIED",
          "UNAUTHORIZED",
          "NOT_FOUND",
          "STALE_DISPATCH",
        ].includes(failure.code)
      ) {
        localStorage.removeItem(scopedStorageKey(`ngertiin:pending:${slot}`));
        setPending(null);
        setError(
          failure.code === "CONFLICT"
            ? "The status has changed. Refresh it before making another change."
            : failure.message,
        );
        void refresh().catch(() => {});
      } else {
        setPending(savedControl(slot));
        setError(failure instanceof Error ? failure.message : "This change is not confirmed yet.");
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      {kind === "routine" ? (
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-medium">{stateLabels[current.state] ?? current.state}</p>
          </div>
          {!terminal && (
            <Switch
              aria-label={`Routine ${name}`}
              checked={current.state === "active"}
              disabled={busy || pending !== null || (blocked && current.state !== "active")}
              title={
                blocked && current.state !== "active" ? "Resume the linked goal first." : undefined
              }
              onCheckedChange={(enabled) => void apply(enabled ? "active" : "paused")}
              className="mt-0.5 shrink-0"
            />
          )}
        </div>
      ) : (
        !terminal && (
          <div className="flex flex-wrap gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={busy || pending !== null}
              onClick={() => void apply(current.state === "paused" ? "active" : "paused")}
            >
              {busy ? (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  size={13}
                  className="motion-safe:animate-spin"
                />
              ) : current.state === "paused" ? (
                <HugeiconsIcon icon={PlayIcon} size={13} strokeWidth={1.5} />
              ) : (
                <HugeiconsIcon icon={PauseIcon} size={13} strokeWidth={1.5} />
              )}
              {current.state === "paused" ? "Resume goal" : "Pause goal"}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={busy || pending !== null}
              onClick={() => void apply("stopped")}
            >
              <HugeiconsIcon icon={StopIcon} size={12} strokeWidth={1.5} />
              Stop goal
            </Button>
          </div>
        )
      )}
      {kind === "routine" && (
        <div className="flex flex-wrap gap-2 pt-2">
          {actions}
          {!terminal && (
            <Button
              variant="destructive"
              className="flex-1"
              disabled={busy || pending !== null}
              onClick={() => void apply("stopped")}
            >
              <HugeiconsIcon icon={StopIcon} size={12} strokeWidth={1.5} />
              Stop routine
            </Button>
          )}
        </div>
      )}

      {busy && (
        <p role="status" className="mt-2 text-[12px] text-muted-foreground">
          Saving changes…
        </p>
      )}
      {notice && (
        <p role="status" className="sr-only">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[12px] leading-[18px] text-destructive">
          {error}
        </p>
      )}
      {error && !pending && !busy && (
        <Button
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() =>
            void refresh()
              .then(() => setError(""))
              .catch((failure) =>
                setError(failure instanceof Error ? failure.message : "Could not load the status."),
              )
          }
        >
          Refresh status
        </Button>
      )}
      {pending && !busy && (
        <div className="mt-2 space-y-1">
          <p className="text-[12px] leading-[18px] text-muted-foreground">
            This change is not confirmed yet. Check it before changing the status again.
          </p>
          <Button variant="outline" size="sm" onClick={() => void apply(pending.state)}>
            Check change
          </Button>
        </div>
      )}
    </div>
  );
}
