import { ComputerIcon, RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useApiResource } from "@/hooks/use-api-resource";
import { ApiError, request } from "@/lib/api-client";
import { isPageVisible, subscribePageVisibility } from "@/lib/page-visibility";
import type { Machine } from "@/types/machine";
import type { Agent } from "@/types/workspace";
import { MachineScreen } from "./machine-viewer";

export function MachineSection({ agents, cursor }: { agents: Agent[]; cursor: number }) {
  const [tick, setTick] = useState(0);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [controlled, setControlled] = useState<Machine | null>(null);
  const [error, setError] = useState("");
  const resource = useApiResource<Machine>("/v1/machine", cursor + tick);
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const update = () => {
      clearInterval(timer);
      if (isPageVisible()) {
        setTick((value) => value + 1);
        timer = setInterval(() => setTick((value) => value + 1), 3000);
      }
    };
    const unsubscribe = subscribePageVisibility(update);
    update();
    return () => {
      clearInterval(timer);
      unsubscribe();
    };
  }, []);
  const machine =
    controlled &&
    (!resource.data ||
      (controlled.id === resource.data.id && controlled.revision > resource.data.revision))
      ? controlled
      : resource.data;
  const human = machine?.lease.holder === "human";
  const uncertain = machine?.lease.state === "unknown";
  const activeAgent = agents.find((agent) => agent.id === machine?.lease.agent_id);
  const label = uncertain
    ? "Control needs reconnection"
    : human
      ? "You have control"
      : machine?.lease.holder === "agent"
        ? `${activeAgent?.name ?? "An agent"} has control`
        : "Ready for your agents";
  async function control(operation: "acquire" | "release" | "reconcile") {
    if (!machine || busy) return;
    setBusy(true);
    setError("");
    try {
      const confirmed = await request<Machine>("/v1/machine/control", {
        command_id: crypto.randomUUID(),
        operation,
        expected_revision: machine.lease.revision,
      });
      setControlled(confirmed);
      resource.retry();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? ({
              CONFLICT: "Control changed. Reconnect and try again.",
              RECONCILIATION_REQUIRED:
                "Desktop control needs reconnection before work can continue.",
              MACHINE_UNAVAILABLE: "The desktop is offline. Reconnect the local machine.",
              MACHINE_INPUT_BUSY: "An interaction is finishing. Try again shortly.",
            }[e.code] ?? "Control could not be changed. Reconnect and try again.")
          : "Control could not be changed. Reconnect and try again.",
      );
      resource.retry();
    } finally {
      setBusy(false);
    }
  }
  function close() {
    setOpen(false);
    if (human && !uncertain) void control("release");
  }
  return (
    <div className="context-section space-y-3 pt-3.5">
      {machine?.state === "ready" && (
        <MachineScreen
          surface="side-panel"
          interactive={false}
          revision={machine.lease.revision}
          compact
        />
      )}
      <button
        type="button"
        aria-label="View desktop"
        disabled={machine?.state !== "ready"}
        onClick={() => setOpen(true)}
        className="flex h-9 w-full items-center justify-center gap-2 rounded-control bg-composer px-3 ring-1 ring-inset ring-foreground/[0.06] hover:bg-control-hover focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-default"
      >
        <HugeiconsIcon
          icon={ComputerIcon}
          size={18}
          strokeWidth={1.25}
          className="text-muted-foreground"
        />
        <span className="text-[13px] font-medium">
          {machine?.state === "ready"
            ? "Open computer"
            : machine?.state === "unconfigured"
              ? "Desktop not set up"
              : "Desktop unavailable"}
        </span>
      </button>
      <p role="status" className="text-center text-[13px] text-muted-foreground">
        {machine?.state === "ready" ? label : "Your computer is unavailable. Try reconnecting."}
      </p>
      {(error || resource.error) && (
        <p role="alert" className="text-sm text-destructive">
          {error || "Desktop status is unavailable. Reconnect and try again."}
        </p>
      )}
      {machine?.state !== "ready" && (
        <Button variant="outline" size="sm" onClick={resource.retry}>
          <HugeiconsIcon icon={RefreshIcon} size={14} />
          Reconnect
        </Button>
      )}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) close();
        }}
      >
        <DialogContent className="flex max-h-[96dvh] flex-col gap-3 rounded-2xl p-4 sm:max-w-[min(96vw,1400px)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-7 text-[15px] font-medium">
              <HugeiconsIcon icon={ComputerIcon} size={17} strokeWidth={1.5} />
              Computer
            </DialogTitle>
            <DialogDescription className="sr-only">
              Your private workspace computer.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span role="status" className="text-[13px] text-muted-foreground">
              {label}
            </span>
            <Button
              size="sm"
              variant={human ? "outline" : "default"}
              disabled={busy || machine?.state !== "ready"}
              onClick={() => void control(uncertain ? "reconcile" : human ? "release" : "acquire")}
            >
              {busy
                ? "Changing control…"
                : uncertain
                  ? "Reconnect control"
                  : human
                    ? "Return control"
                    : "Take control"}
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {open && machine?.state === "ready" && (
            <MachineScreen
              interactive={human && !uncertain}
              revision={human ? machine.lease.revision : 0}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
