import { ChatBotIcon, Settings01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function WorkspaceRail({
  settings,
  onConversation,
  onSettings,
}: {
  settings: boolean;
  onConversation: () => void;
  onSettings: () => void;
}) {
  return (
    <nav className="workspace-rail" aria-label="Navigasi utama">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="workspace-rail-item"
            aria-label="Percakapan"
            aria-current={!settings ? "page" : undefined}
            onClick={onConversation}
          >
            <HugeiconsIcon icon={ChatBotIcon} className="size-5" strokeWidth={1.5} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          Percakapan
        </TooltipContent>
      </Tooltip>
      <div className="workspace-rail-bottom">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="workspace-rail-item"
              aria-label="Pengaturan"
              aria-current={settings ? "page" : undefined}
              onClick={onSettings}
            >
              <HugeiconsIcon icon={Settings01Icon} className="size-5" strokeWidth={1.5} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            Pengaturan
          </TooltipContent>
        </Tooltip>
      </div>
    </nav>
  );
}
