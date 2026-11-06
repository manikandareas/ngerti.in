import { ComputerActivity } from "@/features/conversation/components/computer-activity";
import { useApiResource } from "@/hooks/use-api-resource";
import type { Machine } from "@/types/machine";
import { sampleRun, sampleTime, tobi } from "./fixtures";
import { AssistantRow, type OpenSample } from "./preview-primitives";

export function ComputerPreview({
  variant,
  group,
  open,
}: {
  variant: string;
  group: boolean;
  open: OpenSample;
}) {
  const { data: machine } = useApiResource<Machine>(variant === "active" ? "/v1/machine" : null, 0);
  const run = sampleRun({
    status: variant === "completed" ? "succeeded" : "running",
    computer_activity: {
      machine_id: machine?.id ?? "studio-machine",
      generation: machine?.generation ?? 1,
      phase: variant === "preparing" ? "preparing" : "active",
      started_at: sampleTime,
    },
  });
  return (
    <div className="w-full max-w-[420px] space-y-3">
      <AssistantRow group={group} open={open}>
        <ComputerActivity run={run} agent={tobi} open={() => {}} />
      </AssistantRow>
      {variant === "active" && (
        <p className="text-xs text-muted-foreground">
          Live preview menggunakan machine lokal yang terhubung. Studio tidak mengambil kontrol atau
          menjalankan agent.
        </p>
      )}
    </div>
  );
}
