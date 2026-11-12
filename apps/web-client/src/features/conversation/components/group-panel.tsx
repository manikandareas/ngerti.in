import type { JSX } from "react";
import type { Snapshot } from "@/types/workspace";
import { AgentAvatar } from "./identity";
import { PanelCard, PanelPageHeader } from "./panel-primitives";

type GroupPanelProps = {
  snapshot: Snapshot;
  initialMember?: string | null;
  selectMember: (id: string | null) => void;
};

export function GroupPanel({
  snapshot,
  initialMember,
  selectMember,
}: GroupPanelProps): JSX.Element | null {
  const profile = snapshot.agents.find((agent) => agent.id === initialMember);
  if (!profile) return null;
  return (
    <div className="context-section pt-3.5">
      <PanelPageHeader
        title={profile.name}
        back="Details"
        onBack={() => {
          selectMember(null);
        }}
      />
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <AgentAvatar
          showActivityLabel={false}
          agent={profile}
          animated
          interactive
          followPointer
          className="size-20 rounded-[24px] text-3xl"
        />
        <p className="text-[13px] leading-[1.5] text-muted-foreground">
          {profile.soul || "Group member"}
        </p>
      </div>
      <PanelCard>
        <p className="px-3.5 py-3 text-[13px] leading-[1.5] text-muted-foreground">
          This is a group profile. Direct-message history, memory, and files stay private.
        </p>
      </PanelCard>
    </div>
  );
}
