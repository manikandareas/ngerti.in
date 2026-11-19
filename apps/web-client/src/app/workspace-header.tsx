import { SidebarLeftIcon, SidebarRightIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { OrganizationSwitcher } from "@/features/account/organization-switcher";
import { ConversationActionsMenu } from "@/features/conversation/components/conversation-actions-menu";
import { WorkspaceHeaderSlot } from "./desktop-shell";

type HeaderView =
  | { kind: "page"; title: "Settings" | "Marketplace" | "Board" }
  | {
      kind: "conversation";
      identity: ReactNode;
      model: ReactNode;
      newChat?: () => void;
      cloneProfile?: () => void;
      panelOpen: boolean;
      panelDisabled: boolean;
      togglePanel: () => void;
    };

export function WorkspaceHeader({
  sidebarOpen,
  toggleSidebar,
  view,
  mobile,
}: {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  view: HeaderView;
  mobile: boolean;
}) {
  return (
    <WorkspaceHeaderSlot>
      <div
        className="workspace-toolbar"
        data-screen={view.kind === "page"}
        data-sidebar-open={sidebarOpen}
      >
        <div className="workspace-toolbar-navigation">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                hidden={mobile && view.kind === "page"}
                variant="ghost"
                size="icon-sm"
                aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
                aria-expanded={sidebarOpen}
                aria-controls={view.kind === "page" ? undefined : "workspace-navigation"}
                onClick={toggleSidebar}
                className="workspace-toolbar-button"
              >
                <HugeiconsIcon icon={SidebarLeftIcon} size={18} strokeWidth={1.5} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Toggle sidebar</TooltipContent>
          </Tooltip>
          <OrganizationSwitcher compact />
        </div>
        <div className="workspace-toolbar-conversation">
          <div className="workspace-toolbar-identity">
            {view.kind === "page" ? <span className="truncate">{view.title}</span> : view.identity}
          </div>
          {view.kind === "conversation" && (
            <div className="workspace-toolbar-actions">
              {view.model}
              <ConversationActionsMenu newChat={view.newChat} cloneProfile={view.cloneProfile} />
              <span aria-hidden="true" className="workspace-toolbar-separator" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={view.panelOpen ? "Hide side panel" : "Show side panel"}
                    aria-expanded={view.panelOpen}
                    aria-controls="conversation-details"
                    disabled={view.panelDisabled}
                    onClick={view.togglePanel}
                    className="workspace-toolbar-button workspace-side-panel-toggle"
                  >
                    <HugeiconsIcon icon={SidebarRightIcon} size={18} strokeWidth={1.5} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Toggle side panel</TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>
      </div>
    </WorkspaceHeaderSlot>
  );
}
