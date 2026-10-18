import { ArrowLeft } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { UsagePanel } from "@/features/quotas/components/usage-panel";
import { TaskPanel } from "@/features/tasks/components/task-panel";
import { Capabilities } from "@/features/workspace/components/capabilities";
import { SettingsPanel } from "@/features/workspace/components/settings-panel";
import { workspaceDescriptions, workspaceLinks } from "@/features/workspace/config/navigation";
import type { WorkspaceView } from "@/features/workspace/types";

interface WorkspacePanelProps {
  view: Exclude<WorkspaceView, "chat">;
  onNavigate: (view: WorkspaceView) => void;
  threadId: string | null;
}

export function WorkspacePanel({ view, onNavigate, threadId }: WorkspacePanelProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div className="mx-auto w-full max-w-[760px] px-5 py-6 min-[701px]:px-10 min-[701px]:py-10">
        <Button
          type="button"
          variant="ghost"
          className="mb-6 -ml-3"
          onClick={() => onNavigate("chat")}
        >
          <ArrowLeft /> Kembali ke chat
        </Button>
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
        <WorkspaceContent view={view} onNavigate={onNavigate} threadId={threadId} />
      </div>
    </div>
  );
}

function WorkspaceContent({ view, onNavigate, threadId }: WorkspacePanelProps) {
  switch (view) {
    case "tasks":
      return <TaskPanel key={threadId} threadId={threadId} />;
    case "capabilities":
      return <Capabilities />;
    case "usage":
      return <UsagePanel />;
    case "settings":
      return <SettingsPanel onNavigate={onNavigate} />;
  }
}
