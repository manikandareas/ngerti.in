import { LoaderCircle, Pause, Play, Square } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ApiError, durableCommand } from "@/lib/api-client";
import type { Goal, Routine } from "@/types/work";

const stateLabels: Record<string, string> = {
  active: "Aktif",
  paused: "Dijeda",
  stopped: "Dihentikan",
  completed: "Selesai",
};

type ControlState = "active" | "paused" | "stopped";
type PendingControl = { state: ControlState; expected_revision?: number };
function savedControl(slot: string): PendingControl | null {
  try {
    const saved = localStorage.getItem(`ngertiin:pending:${slot}`);
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
  compact = false,
  blocked = false,
  children,
}: {
  item: Goal | Routine;
  kind: "goal" | "routine";
  refresh: () => Promise<unknown>;
  compact?: boolean;
  blocked?: boolean;
  children?: ReactNode | ((disabled: boolean) => ReactNode);
}) {
  const slot = `responsibility:${kind}:${item.id}`;
  const [pending, setPending] = useState(() => savedControl(slot));
  const [confirmed, setConfirmed] = useState<Goal | Routine | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const lock = useRef(false);
  const current = confirmed && confirmed.revision >= item.revision ? confirmed : item;
  const terminal = current.state === "stopped" || current.state === "completed";
  const name = kind === "goal" ? (item as Goal).title : (item as Routine).instruction;
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
        `${kind === "goal" ? "Goal" : "Routine"} ${stateLabels[result.state]?.toLowerCase() ?? "diperbarui"}.`,
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
        localStorage.removeItem(`ngertiin:pending:${slot}`);
        setPending(null);
        setError(
          failure.code === "CONFLICT"
            ? "Status sudah berubah. Muat status terbaru sebelum mengubahnya lagi."
            : failure.message,
        );
        void refresh().catch(() => {});
      } else {
        setPending(savedControl(slot));
        setError(failure instanceof Error ? failure.message : "Perubahan belum terkonfirmasi.");
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className={compact ? "px-3.5 py-3.5" : "space-y-2"}>
      {kind === "routine" ? (
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {(typeof children === "function" ? children(busy) : children) ?? (
              <p className="text-[14px] font-medium">
                {stateLabels[current.state] ?? current.state}
              </p>
            )}
          </div>
          {!terminal && (
            <Switch
              aria-label={`Routine ${name}`}
              checked={current.state === "active"}
              disabled={busy || pending !== null || (blocked && current.state !== "active")}
              title={
                blocked && current.state !== "active"
                  ? "Lanjutkan goal terkait terlebih dahulu."
                  : undefined
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
                <LoaderCircle size={13} className="motion-safe:animate-spin" />
              ) : current.state === "paused" ? (
                <Play size={13} strokeWidth={1.5} />
              ) : (
                <Pause size={13} strokeWidth={1.5} />
              )}
              {current.state === "paused" ? "Lanjutkan goal" : "Jeda goal"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy || pending !== null}
              onClick={() => void apply("stopped")}
            >
              <Square size={12} strokeWidth={1.5} />
              Hentikan goal
            </Button>
          </div>
        )
      )}
      {kind === "routine" && !compact && !terminal && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          disabled={busy || pending !== null}
          onClick={() => void apply("stopped")}
        >
          <Square size={12} strokeWidth={1.5} />
          Hentikan Routine
        </Button>
      )}
      {busy && (
        <p role="status" className="mt-2 text-[12px] text-muted-foreground">
          Menyimpan perubahan…
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
                setError(failure instanceof Error ? failure.message : "Status belum dapat dimuat."),
              )
          }
        >
          Muat status terbaru
        </Button>
      )}
      {pending && !busy && (
        <div className="mt-2 space-y-1">
          <p className="text-[12px] leading-[18px] text-muted-foreground">
            Perubahan belum terkonfirmasi. Periksa operasi yang sama sebelum mengubah status lagi.
          </p>
          <Button variant="outline" size="sm" onClick={() => void apply(pending.state)}>
            Periksa perubahan
          </Button>
        </div>
      )}
    </div>
  );
}
