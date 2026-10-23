import { useEffect, useRef } from "react";
import { GoalPanel } from "@/features/goals/components/goal-panel";
import { LibraryPanel } from "@/features/library/components/library-panel";
import { UsagePanel } from "@/features/quotas/components/usage-panel";
import { SchedulePanel } from "@/features/schedules/components/schedule-panel";
import { TaskPanel } from "@/features/tasks/components/task-panel";
import { Capabilities } from "@/features/workspace/components/capabilities";
import { workspaceDescriptions, workspaceLinks } from "@/features/workspace/config/navigation";
import type { WorkspaceView } from "@/features/workspace/types";

interface WorkspacePanelProps {
  view: Exclude<WorkspaceView, "chat">;
  onNavigate: (view: WorkspaceView) => void;
  threadId: string | null;
  onOpenAssistant: () => void;
}

export function WorkspacePanel({
  view,
  onNavigate,
  threadId,
  onOpenAssistant,
}: WorkspacePanelProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div className="mx-auto w-full max-w-[760px] px-5 py-6 min-[701px]:px-6 min-[701px]:py-6">
        <h1
          id="workspace-heading"
          ref={heading}
          tabIndex={-1}
          className="mb-3 text-2xl outline-none"
        >
          {workspaceLinks.find((item) => item.view === view)?.label}
        </h1>
        <p className="mb-8 max-w-prose text-sm text-muted-foreground">
          {workspaceDescriptions[view]}
        </p>
        <WorkspaceContent
          view={view}
          onNavigate={onNavigate}
          threadId={threadId}
          onOpenAssistant={onOpenAssistant}
        />
      </div>
    </div>
  );
}

function WorkspaceContent({ view, threadId }: WorkspacePanelProps) {
  switch (view) {
    case "goals":
      return <GoalPanel threadId={threadId} />;
    case "schedules":
      return <SchedulePanel threadId={threadId} />;
    case "files":
      return <LibraryPanel />;
    case "tasks":
      return <TaskPanel key={threadId} threadId={threadId} />;
    case "capabilities":
      return <Capabilities />;
    case "usage":
      return <UsagePanel />;
    case "settings":
      return null;
  }
}
