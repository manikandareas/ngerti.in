import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Artifact } from "@/types/work";
import type { Agent, Snapshot, Thread } from "@/types/workspace";
import { savedFileTarget, useContentViewer } from "../lib/content-viewer";
import { AppConnections } from "./app-connections";
import { DetailOverview } from "./detail-overview";
import { FilesPanel } from "./files-panel";
import { GroupPanel } from "./group-panel";
import { AgentAvatar } from "./identity";
import { LibraryMemory } from "./library-memory";
import { MachineSection } from "./machine-section";
import { PanelHeaderSlot } from "./panel-primitives";
import { Responsibilities } from "./responsibilities";

export type PanelLocation = {
  tab: "detail" | "library" | "computer";
  id: string | null;
  page?: "apps" | "goals" | "routine";
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
  const agent = snapshot.agents[0];
  const appsOpen = location.page === "apps";
  const responsibility =
    location.page === "goals" || location.page === "routine" ? location.page : null;
  const selectedDetail =
    location.id !== null &&
    (location.tab === "library"
      ? snapshot.artifacts.some((item) => item.id === location.id)
      : !responsibility &&
        snapshot.thread.type === "group" &&
        snapshot.agents.some((item) => item.id === location.id));
  const nested = (location.tab === "detail" && appsOpen) || selectedDetail;
  const container = useRef<HTMLDivElement>(null);
  const opener = useRef<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: nested navigation restores focus to the originating menu.
  useEffect(() => {
    if (nested) container.current?.querySelector<HTMLButtonElement>("[data-panel-back]")?.focus();
    else if (opener.current) {
      Array.from(container.current?.querySelectorAll<HTMLButtonElement>("[data-panel-nav]") ?? [])
        .find((button) => button.dataset.panelNav === opener.current)
        ?.focus();
    }
  }, [nested, location.page, location.id, headerSlot]);
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
  const openDetail = () => {
    locate({ tab: "detail", id: null });
  };
  const groupPanel = snapshot.thread.type === "group" && (
    <GroupPanel
      key={location.id ?? "members"}
      initialMember={location.id}
      selectMember={(id) => locate({ tab: "detail", id })}
      snapshot={snapshot}
      agents={agents}
      refresh={refresh}
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
      >
        <header className="details-toolbar flex min-h-14 shrink-0 items-center gap-2.5 px-3 py-3">
          <div ref={setHeaderSlot} className="flex min-w-0 flex-1 items-center gap-2.5" />
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
        <div hidden={nested}>
          <div className="context-hero mt-3.5 flex flex-col items-center px-5 text-center">
            {snapshot.thread.type === "group" ? (
              <div className="mt-0.5 flex -space-x-3">
                {snapshot.agents.slice(0, 3).map((member) => (
                  <AgentAvatar
                    showActivityLabel={false}
                    key={member.id}
                    agent={member}
                    className="size-16 rounded-[20px]"
                  />
                ))}
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
        <TabsContent value="detail">
          {appsOpen ? (
            <AppConnections snapshot={snapshot} onBack={openDetail} />
          ) : snapshot.thread.type === "group" && location.id && !responsibility ? (
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
        <TabsContent value="library">
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
        <TabsContent value="computer">
          <MachineSection agents={snapshot.agents} cursor={snapshot.cursor} />
        </TabsContent>
        {responsibility && location.id && (
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
    </PanelHeaderSlot.Provider>
  );
}
