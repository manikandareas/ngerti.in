import { ComputerIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useApiResource } from "@/hooks/use-api-resource";
import type { Machine } from "@/types/machine";
import type { Agent, Run } from "@/types/workspace";
import { MachineScreen } from "./machine-viewer";

/** One card shell for preparing, active and completed Computer activity. */
function ComputerActivityCard({
  runId,
  name,
  label,
  state,
  open,
  children,
}: {
  runId: string;
  name: string;
  label: string;
  state: "connecting" | "active" | "completed";
  open: () => void;
  children?: ReactNode;
}) {
  return (
    <section
      className="w-full max-w-[420px] rounded-2xl bg-composer p-3 ring-1 ring-inset ring-foreground/[0.06]"
      aria-label={`Computer · ${name}`}
      data-computer-activity={runId}
      data-computer-state={state}
    >
      <div className={`flex items-center gap-3 ${children ? "mb-3" : ""}`}>
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-foreground/[0.05]">
          <HugeiconsIcon icon={ComputerIcon} size={22} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium">Computer · {name}</p>
          <p role="status" className="text-[13px] text-muted-foreground">
            {label}
          </p>
        </div>
      </div>
      {children}
      {state === "active" && (
        <Button variant="secondary" className="mt-3 w-full rounded-full" onClick={open}>
          Open Computer
        </Button>
      )}
    </section>
  );
}
export function ComputerActivity({
  run,
  agent,
  open,
}: {
  run: Run;
  agent: Agent;
  open: () => void;
}) {
  const active = ["dispatching", "running", "cancel_requested"].includes(run.status);
  // Completed cards keep their identity without opening a viewer or loading a historical image.
  if (!active) {
    let label = "Activity finished";
    if (run.status === "cancelled") label = "Activity stopped";
    else if (run.status === "failed") label = "Activity failed";
    return (
      <ComputerActivityCard
        runId={run.id}
        name={agent.name}
        state="completed"
        label={label}
        open={open}
      />
    );
  }
  if (run.computer_activity?.phase === "preparing")
    return (
      <ComputerActivityCard
        runId={run.id}
        name={agent.name}
        state="connecting"
        label="Connecting computer…"
        open={open}
      />
    );
  return <ActiveComputer run={run} agent={agent} open={open} />;
}
function ActiveComputer({ run, agent, open }: { run: Run; agent: Agent; open: () => void }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 3000);
    return () => clearInterval(timer);
  }, []);
  const { data: machine } = useApiResource<Machine>("/v1/machine", tick);
  const sameMachine =
    machine?.id === run.computer_activity?.machine_id &&
    machine?.generation === run.computer_activity?.generation;
  const otherController =
    machine?.lease.holder === "human" ||
    (machine?.lease.holder === "agent" && machine.lease.run_id !== run.id);
  const ready =
    sameMachine &&
    machine?.state === "ready" &&
    run.computer_activity?.phase === "active" &&
    !otherController;
  let label = "Connecting computer…";
  if (otherController) {
    label = machine?.lease.holder === "human" ? "You have control" : "Waiting for computer";
  } else if (ready) {
    label = "Connected";
  }
  return (
    <ComputerActivityCard
      runId={run.id}
      name={agent.name}
      state={ready ? "active" : "connecting"}
      label={label}
      open={open}
    >
      {ready && (
        <MachineScreen
          surface={`conversation:${run.id}`}
          interactive={false}
          revision={machine.lease.revision}
          compact
        />
      )}
    </ComputerActivityCard>
  );
}
