import { Calendar03Icon, Plug01Icon, Target02Icon } from "@hugeicons/core-free-icons";
import { useEffect, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Artifact } from "@/types/work";
import type { Agent, Connection, Snapshot, Thread } from "@/types/workspace";
import { type AgentPage, AgentPanel } from "./agent-panel";
import { AppConnections } from "./app-connections";
import { BrowserSection } from "./browser-section";
import { FilesPanel } from "./files-panel";
import { GroupPanel } from "./group-panel";
import { AgentAvatar } from "./identity";
import { PanelCard, PanelNavRow, PanelPageHeader } from "./panel-primitives";
import { Responsibilities } from "./responsibilities";

export type PanelLocation = {
  tab: "detail" | "library" | "computer";
  id: string | null;
  page?: AgentPage | "apps" | "goals" | "routine";
};
export function ContextPanel({
  snapshot,
  agents,
  threads,
  connections,
  location,
  locate,
  refresh,
  report,
  compose,
  source,
  attach,
  manageProviders,
}: {
  snapshot: Snapshot;
  agents: Agent[];
  threads: Thread[];
  connections: Connection[];
  location: PanelLocation;
  locate: (location: PanelLocation) => void;
  refresh: () => Promise<unknown>;
  report: (error: string) => void;
  compose: (text: string) => void;
  source: (id?: string) => void;
  attach: (a: Artifact) => void;
  manageProviders: () => void;
}) {
  const agent = snapshot.agents[0];
  const page =
    location.page === "memory" || location.page === "skills" || location.page === "instructions"
      ? location.page
      : "overview";
  const appsOpen = location.page === "apps";
  const responsibility =
    location.page === "goals" || location.page === "routine" ? location.page : null;
  const selectedDetail =
    location.id !== null &&
    (location.tab === "library"
      ? snapshot.artifacts.some((item) => item.id === location.id)
      : responsibility === "goals"
        ? snapshot.goals.some((item) => item.id === location.id)
        : responsibility === "routine"
          ? snapshot.routines.some((item) => item.id === location.id)
          : snapshot.thread.type === "group" &&
            snapshot.agents.some((item) => item.id === location.id));
  const nested =
    (location.tab === "detail" &&
      (appsOpen ||
        responsibility !== null ||
        (snapshot.thread.type === "dm" && page !== "overview"))) ||
    selectedDetail;
  const container = useRef<HTMLDivElement>(null);
  const opener = useRef<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: nested page and item navigation must move focus to the new back button.
  useEffect(() => {
    if (nested) container.current?.querySelector<HTMLButtonElement>("[data-panel-back]")?.focus();
    else if (opener.current) {
      Array.from(container.current?.querySelectorAll<HTMLButtonElement>("[data-panel-nav]") ?? [])
        .find((button) => button.dataset.panelNav === opener.current)
        ?.focus();
    }
  }, [nested, location.page, location.id]);
  const openFile = (id: string) => locate({ tab: "library", id });
  const openDetail = () => {
    locate({ tab: "detail", id: null });
  };
  return (
    <Tabs
      ref={container}
      onClickCapture={(event) => {
        if (!nested && event.target instanceof Element)
          opener.current =
            event.target.closest<HTMLElement>("[data-panel-nav]")?.dataset.panelNav ?? null;
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
      <div hidden={nested}>
        <div className="context-hero mt-3.5 flex flex-col items-center px-5 text-center">
          {snapshot.thread.type === "group" ? (
            <div className="mt-0.5 flex -space-x-3">
              {snapshot.agents.slice(0, 3).map((member) => (
                <AgentAvatar
                  showActivityLabel={false}
                  key={member.id}
                  agent={member}
                  className="size-[52px] rounded-2xl"
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
              className="size-20 rounded-[24px] text-3xl"
            />
          )}
          <h2
            className={
              snapshot.thread.type === "group"
                ? "mt-2.5 max-w-full break-words px-1.5 text-[18px] font-semibold"
                : "mt-2 max-w-full break-words px-1.5 text-[17px] font-medium leading-6"
            }
          >
            {snapshot.thread.name ?? agent?.name ?? "Percakapan"}
          </h2>
        </div>
        <TabsList className="context-tabs" aria-label="Detail sesuai konteks">
          <TabsTrigger value="detail">Detail</TabsTrigger>
          <TabsTrigger value="library">Library</TabsTrigger>
          <TabsTrigger value="computer">Computer</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="detail">
        {responsibility ? (
          <>
            {!selectedDetail && (
              <div className="pt-3.5">
                <PanelPageHeader
                  title={responsibility === "goals" ? "Goals" : "Routine"}
                  onBack={openDetail}
                />
              </div>
            )}
            <Responsibilities
              kind={responsibility}
              refresh={refresh}
              snapshot={snapshot}
              selected={location.id}
              select={(id) => locate({ tab: "detail", page: responsibility, id })}
              compose={compose}
              openFile={openFile}
              openGoal={(id) => locate({ tab: "detail", page: "goals", id })}
              source={source}
            />
          </>
        ) : appsOpen ? (
          <AppConnections snapshot={snapshot} onBack={openDetail} />
        ) : agent && snapshot.thread.type === "dm" ? (
          <AgentPanel
            key={agent.id}
            page={page}
            navigate={(page) => locate({ tab: "detail", id: null, page })}
            agent={agent}
            threadId={snapshot.thread.id}
            cursor={snapshot.cursor}
            connections={connections}
            refresh={refresh}
            report={report}
            manageProviders={manageProviders}
          />
        ) : (
          <GroupPanel
            key={location.id ?? "members"}
            initialMember={location.id}
            selectMember={(id) => locate({ tab: "detail", id })}
            snapshot={snapshot}
            agents={agents}
            refresh={refresh}
            compose={compose}
          />
        )}
        {!appsOpen &&
          !responsibility &&
          location.id === null &&
          (snapshot.thread.type === "group" || page === "overview") && (
            <>
              <PanelCard label="Tanggung jawab">
                <PanelNavRow
                  title="Goals"
                  value={snapshot.goals.length || undefined}
                  icon={Target02Icon}
                  onClick={() => locate({ tab: "detail", id: null, page: "goals" })}
                />
                <PanelNavRow
                  title="Routine"
                  value={snapshot.routines.length || undefined}
                  icon={Calendar03Icon}
                  onClick={() => locate({ tab: "detail", id: null, page: "routine" })}
                />
              </PanelCard>
              <PanelCard label="Akses">
                <PanelNavRow
                  title="Koneksi aplikasi"
                  icon={Plug01Icon}
                  onClick={() => locate({ tab: "detail", id: null, page: "apps" })}
                />
              </PanelCard>
            </>
          )}
      </TabsContent>
      <TabsContent value="library">
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
        <BrowserSection
          agents={snapshot.agents}
          threadId={snapshot.thread.id}
          cursor={snapshot.cursor}
        />
      </TabsContent>
    </Tabs>
  );
}
