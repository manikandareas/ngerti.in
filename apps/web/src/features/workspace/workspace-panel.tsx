import { ArrowLeft } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { UsagePanel } from "@/features/quotas/usage-panel";
import { Capabilities } from "./capabilities";
import { SettingsPanel } from "./settings-panel";
import { type WorkspaceView, workspaceLinks } from "./workspace-views";

export function WorkspacePanel({
  view,
  onNavigate,
}: {
  view: Exclude<WorkspaceView, "chat">;
  onNavigate: (view: WorkspaceView) => void;
}) {
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
          {view === "capabilities"
            ? "Kenali bantuan yang bisa kamu gunakan dan yang sedang disiapkan."
            : view === "usage"
              ? "Pantau penggunaanmu tanpa meninggalkan percakapan."
              : "Atur pengalamanmu bersama Gwen."}
        </p>
        {view === "capabilities" ? (
          <Capabilities />
        ) : view === "usage" ? (
          <UsagePanel />
        ) : (
          <SettingsPanel onNavigate={onNavigate} />
        )}
      </div>
    </div>
  );
}
