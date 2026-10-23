import { ContextPanel } from "@/features/workspace/components/context-panel";
import { useResourceContext } from "./resource-context";
import { ResourceDetailPanel } from "./resource-detail";

export function ResourceSurface({
  mobile,
  discussing = false,
  discussionRequest = 0,
  overlay = false,
}: {
  mobile: boolean;
  discussing?: boolean;
  discussionRequest?: number;
  overlay?: boolean;
}) {
  const context = useResourceContext();
  if (!context.opened) return null;
  return (
    <ContextPanel
      title="Pilihan percakapan"
      discussing={discussing}
      discussionRequest={discussionRequest}
      mobile={mobile}
      overlay={overlay}
      onClose={() => context.open(null)}
    >
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <ResourceDetailPanel key={JSON.stringify(context.opened)} refValue={context.opened} />
      </div>
    </ContextPanel>
  );
}
