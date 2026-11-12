import { Cancel01Icon, Folder01Icon, PencilEdit01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Artifact } from "@/types/work";
import type { Agent, Snapshot, Thread } from "@/types/workspace";
import { savedFileTarget, useContentViewer } from "../lib/content-viewer";
import { DetailOverview } from "./detail-overview";
import { EditGroup } from "./edit-group";
import { FilesPanel } from "./files-panel";
import { GroupPanel } from "./group-panel";
import { AgentAvatar } from "./identity";
import { LibraryMemory } from "./library-memory";
import { MachineSection } from "./machine-section";
import { PanelHeaderSlot } from "./panel-primitives";
import { Responsibilities } from "./responsibilities";

const WorkingFiles = lazy(() =>
  import("./working-files").then((module) => ({ default: module.WorkingFiles })),
);

export type PanelLocation = {
  tab: "detail" | "library" | "computer";
  id: string | null;
  page?: "goals" | "routine";
  workingFiles?: boolean;
};
export function ContextPanel({
  snapshot,
  agents,
  threads,
  location,
  locate,
  refresh,
  compose,
  source,
  attach,
  onClose,
  closeLabel,
}: {
  onClose: () => void;
  closeLabel: string;
  snapshot: Snapshot;
  agents: Agent[];
  threads: Thread[];
  location: PanelLocation;
  locate: (location: PanelLocation) => void;
  refresh: () => Promise<unknown>;
  compose: (text: string) => void;
  source: (id?: string) => void;
  attach: (a: Artifact) => void;
}) {
  const [headerSlot, setHeaderSlot] = useState<HTMLDivElement | null>(null);
  const [editGroupOpen, setEditGroupOpen] = useState(false);
  const editGroupButton = useRef<HTMLButtonElement>(null);
  const agent = snapshot.agents[0];
  const filesOpen = location.workingFiles === true;
  const responsibility =
    location.page === "goals" || location.page === "routine" ? location.page : null;
  const selectedDetail =
    location.id !== null &&
    (location.tab === "library"
      ? snapshot.artifacts.some((item) => item.id === location.id)
      : !responsibility &&
        snapshot.thread.type === "group" &&
        snapshot.agents.some((item) => item.id === location.id));
  const nested = filesOpen || selectedDetail;
  const container = useRef<HTMLDivElement>(null);
  const opener = useRef<string | null>(null);
  const returningFromFiles = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: nested navigation restores focus to the originating menu.
  useEffect(() => {
    if (!filesOpen && returningFromFiles.current)
      container.current?.querySelector<HTMLButtonElement>("[data-working-files-open]")?.focus();
    else if (nested)
      container.current?.querySelector<HTMLButtonElement>("[data-panel-back]")?.focus();
    else if (opener.current) {
      Array.from(container.current?.querySelectorAll<HTMLButtonElement>("[data-panel-nav]") ?? [])
        .find((button) => button.dataset.panelNav === opener.current)
        ?.focus();
    }
    returningFromFiles.current = filesOpen;
  }, [nested, filesOpen, location.page, location.id, headerSlot]);
  const viewer = useContentViewer();
  const openFile = (id: string) => {
    const artifact = snapshot.artifacts.find((item) => item.id === id);
    if (!artifact) return;
    try {
      viewer?.open({
        ...savedFileTarget(artifact, snapshot),
        info: () => locate({ tab: "library", id }),
      });
    } catch {
      locate({ tab: "library", id });
    }
  };
  const closeFiles = () => locate({ ...location, workingFiles: false });
  const groupPanel = snapshot.thread.type === "group" && (
    <GroupPanel
      key={location.id ?? "members"}
      initialMember={location.id}
      selectMember={(id) => locate({ tab: "detail", id })}
      snapshot={snapshot}
    />
  );
  return (
    <PanelHeaderSlot.Provider value={headerSlot}>
      <Tabs
        ref={container}
        onClickCapture={(event) => {
          if (!nested && event.target instanceof Element) {
            const name = event.target.closest<HTMLElement>("[data-panel-nav]")?.dataset.panelNav;
            if (name) opener.current = name;
          }
        }}
        onKeyDown={(event) => {
          if (event.key !== "Escape" || event.defaultPrevented || !nested) return;
          if (event.target instanceof Node && !event.currentTarget.contains(event.target)) return;
          if (filesOpen) {
            closeFiles();
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          locate({
            tab: location.tab,
            id: null,
            ...(responsibility && location.id ? { page: responsibility } : {}),
          });
          event.preventDefault();
          event.stopPropagation();
        }}
        value={location.tab}
        onValueChange={(tab) => {
          locate({ tab: tab as PanelLocation["tab"], id: null });
        }}
        className="context-panel gap-2 pb-5"
        id="conversation-details"
        data-working-files={filesOpen}
      >
        <header className="details-toolbar flex min-h-14 shrink-0 items-center gap-2.5 px-3 py-3">
          <div ref={setHeaderSlot} className="flex min-w-0 flex-1 items-center gap-2.5" />
          {!filesOpen && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  data-working-files-open=""
                  aria-label="Working files"
                  onClick={() => locate({ ...location, workingFiles: true })}
                >
                  <HugeiconsIcon icon={Folder01Icon} size={18} strokeWidth={1.5} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={6}>
                Working files
              </TooltipContent>
            </Tooltip>
          )}
          <Button
            size="icon-sm"
            variant="ghost"
            data-panel-close=""
            aria-label={closeLabel}
            onClick={onClose}
            className="shrink-0"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={1.5} />
          </Button>
        </header>
        {filesOpen && viewer && (
          <Suspense
            fallback={
              <p role="status" className="px-4 py-6 text-sm text-muted-foreground">
                Loading working files…
              </p>
            }
          >
            <WorkingFiles
              browser={viewer.fileBrowser}
              onBack={closeFiles}
              back={
                location.tab === "library"
                  ? "Library"
                  : location.tab === "computer"
                    ? "Computer"
                    : "Details"
              }
            />
          </Suspense>
        )}
        <div hidden={nested}>
          <div className="context-hero mt-3.5 flex flex-col items-center px-5 text-center">
            {snapshot.thread.type === "group" ? (
              <div className="relative mt-0.5">
                <div className="flex -space-x-3">
                  {snapshot.agents.slice(0, 3).map((member) => (
                    <button
                      key={member.id}
                      type="button"
                      data-panel-nav={`member:${member.id}`}
                      aria-label={`Member profile ${member.name}`}
                      className="relative rounded-[20px] focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-ring"
                      onClick={() => locate({ tab: "detail", id: member.id })}
                    >
                      <AgentAvatar
                        showActivityLabel={false}
                        agent={member}
                        className="size-16 rounded-[20px]"
                      />
                    </button>
                  ))}
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      ref={editGroupButton}
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Edit group"
                      onClick={() => setEditGroupOpen(true)}
                      className="absolute left-full top-1/2 ml-2 -translate-y-1/2 rounded-full text-muted-foreground"
                    >
                      <HugeiconsIcon icon={PencilEdit01Icon} size={17} strokeWidth={1.5} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" sideOffset={6}>
                    Edit group
                  </TooltipContent>
                </Tooltip>
              </div>
            ) : (
              <AgentAvatar
                showActivityLabel={false}
                agent={agent}
                animated
                interactive
                followPointer
                className="size-24 rounded-[28px] text-4xl"
              />
            )}
            <h2
              className={
                snapshot.thread.type === "group"
                  ? "mt-2.5 max-w-full break-words px-1.5 text-[20px] font-semibold"
                  : "mt-2 max-w-full break-words px-1.5 text-[20px] font-medium leading-7"
              }
            >
              {snapshot.thread.name ?? agent?.name ?? "Conversation"}
            </h2>
          </div>
          <TabsList className="context-tabs" aria-label="Conversation details">
            <TabsTrigger value="detail">Details</TabsTrigger>
            <TabsTrigger value="library">Library</TabsTrigger>
            <TabsTrigger value="computer">Computer</TabsTrigger>
          </TabsList>
        </div>
        <PanelHeaderSlot.Provider value={filesOpen ? null : headerSlot}>
          <TabsContent value="detail" hidden={filesOpen || undefined}>
            {snapshot.thread.type === "group" && location.id && !responsibility ? (
              groupPanel
            ) : (
              <>
                <DetailOverview
                  snapshot={snapshot}
                  open={(page, id) => locate({ tab: "detail", page, id })}
                />
                {groupPanel}
              </>
            )}
          </TabsContent>
          <TabsContent value="library" hidden={filesOpen || undefined}>
            <div hidden={selectedDetail}>
              <LibraryMemory snapshot={snapshot} />
            </div>
            <FilesPanel
              snapshot={snapshot}
              threads={threads}
              agents={agents}
              selected={location.id}
              select={(id) => locate({ tab: "library", id })}
              refresh={refresh}
              attach={attach}
            />
          </TabsContent>
          <TabsContent value="computer" hidden={filesOpen || undefined}>
            {!filesOpen && <MachineSection agents={snapshot.agents} cursor={snapshot.cursor} />}
          </TabsContent>
        </PanelHeaderSlot.Provider>
        {!filesOpen && responsibility && location.id && (
          <Responsibilities
            key={location.id}
            kind={responsibility}
            snapshot={snapshot}
            selected={location.id}
            onClose={() => locate({ tab: "detail", id: null })}
            refresh={refresh}
            compose={compose}
            openFile={openFile}
            openGoal={(id) => locate({ tab: "detail", page: "goals", id })}
            source={source}
            restoreFocus={() => {
              container.current
                ?.querySelector<HTMLButtonElement>(
                  `[data-panel-nav="${responsibility === "goals" ? "goal" : "routine"}:${location.id}"]`,
                )
                ?.focus();
            }}
          />
        )}
      </Tabs>
      {snapshot.thread.type === "group" && editGroupOpen && (
        <EditGroup
          thread={snapshot.thread}
          agents={agents}
          onOpenChange={setEditGroupOpen}
          refresh={refresh}
          returnFocus={() => editGroupButton.current?.focus()}
        />
      )}
    </PanelHeaderSlot.Provider>
  );
}
