import { Globe, Plug } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Artifact } from "@/types/work";
import type { Agent, Connection, Snapshot, Thread } from "@/types/workspace";
import { type AgentPage, AgentPanel } from "./agent-panel";
import { AppConnections } from "./app-connections";
import { AgentActivityStatus } from "./avatar-activity";
import { BrowserSection } from "./browser-section";
import { FilesPanel } from "./files-panel";
import { GroupPanel } from "./group-panel";
import { AgentAvatar } from "./identity";
import { PanelCard, PanelNavRow } from "./panel-primitives";
import { Responsibilities } from "./responsibilities";

export type PanelLocation = {
  tab: "agent" | "files" | "goals" | "routine";
  id: string | null;
  page?: "apps" | "browser";
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
  configurationOpen,
  setConfigurationOpen,
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
  configurationOpen: boolean;
  setConfigurationOpen: (open: boolean) => void;
}) {
  const agent = snapshot.agents[0];
  const [page, setPage] = useState<AgentPage>("overview");
  const appsOpen = location.page === "apps";
  const selectedDetail =
    location.id !== null &&
    (location.tab === "files"
      ? snapshot.artifacts.some((item) => item.id === location.id)
      : location.tab === "goals"
        ? snapshot.goals.some((item) => item.id === location.id)
        : location.tab === "routine"
          ? snapshot.routines.some((item) => item.id === location.id)
          : snapshot.thread.type === "group" &&
            snapshot.agents.some((item) => item.id === location.id));
  const nested =
    (location.tab === "agent" &&
      (appsOpen ||
        (snapshot.thread.type === "dm" && (page !== "overview" || configurationOpen)))) ||
    selectedDetail ||
    location.page === "browser";
  const container = useRef<HTMLDivElement>(null);
  const opener = useRef<string | null>(null);
  useEffect(() => {
    if (nested) container.current?.querySelector<HTMLButtonElement>("[data-panel-back]")?.focus();
    else if (opener.current) {
      Array.from(container.current?.querySelectorAll<HTMLButtonElement>("[data-panel-nav]") ?? [])
        .find((button) => button.dataset.panelNav === opener.current)
        ?.focus();
    }
  }, [nested]);
  const openFile = (id: string) => locate({ tab: "files", id });
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
        setPage("overview");
        setConfigurationOpen(false);
        locate({ tab: location.tab, id: null });
        event.preventDefault();
        event.stopPropagation();
      }}
      value={location.tab}
      onValueChange={(tab) => {
        setPage("overview");
        setConfigurationOpen(false);
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
                  key={member.id}
                  agent={member}
                  className="size-[52px] rounded-2xl ring-[3px] ring-background"
                />
              ))}
            </div>
          ) : (
            <AgentAvatar
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
          {snapshot.thread.type === "dm" && <AgentActivityStatus agentId={agent?.id} />}
        </div>
        <TabsList className="context-tabs mt-[15px]" aria-label="Detail sesuai konteks">
          <TabsTrigger value="agent">
            {snapshot.thread.type === "group" ? "Anggota" : "Agent"}
          </TabsTrigger>
          <TabsTrigger value="files">File</TabsTrigger>
          <TabsTrigger value="goals">Goals</TabsTrigger>
          <TabsTrigger value="routine">Routine</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="agent">
        {appsOpen ? (
          <AppConnections
            snapshot={snapshot}
            onBack={() => {
              setPage("overview");
              setConfigurationOpen(false);
              locate({ tab: "agent", id: null });
            }}
          />
        ) : agent && snapshot.thread.type === "dm" ? (
          <AgentPanel
            key={agent.id}
            page={page}
            navigate={setPage}
            agent={agent}
            threadId={snapshot.thread.id}
            cursor={snapshot.cursor}
            connections={connections}
            refresh={refresh}
            report={report}
            manageProviders={manageProviders}
            configurationOpen={configurationOpen}
            setConfigurationOpen={setConfigurationOpen}
          />
        ) : (
          <GroupPanel
            key={location.id ?? "members"}
            initialMember={location.id}
            selectMember={(id) => locate({ tab: "agent", id })}
            snapshot={snapshot}
            agents={agents}
            refresh={refresh}
            compose={compose}
          />
        )}
        {!appsOpen &&
          location.id === null &&
          (snapshot.thread.type === "group" || (page === "overview" && !configurationOpen)) && (
            <PanelCard label="Akses">
              <PanelNavRow
                title="Koneksi aplikasi"
                icon={Plug}
                onClick={() => locate({ tab: "agent", id: null, page: "apps" })}
              />
            </PanelCard>
          )}
      </TabsContent>
      <TabsContent value="files">
        {location.page === "browser" ? (
          <BrowserSection
            agents={snapshot.agents}
            threadId={snapshot.thread.id}
            cursor={snapshot.cursor}
            onBack={() => locate({ tab: "files", id: null })}
          />
        ) : (
          <>
            <FilesPanel
              snapshot={snapshot}
              threads={threads}
              agents={agents}
              selected={location.id}
              select={(id) => locate({ tab: "files", id })}
              refresh={refresh}
              attach={attach}
            />
            {agent && !location.id && (
              <PanelCard label="Browser">
                <PanelNavRow
                  title="Browser percakapan"
                  icon={Globe}
                  onClick={() => locate({ tab: "files", id: null, page: "browser" })}
                />
              </PanelCard>
            )}
          </>
        )}
      </TabsContent>
      {(["goals", "routine"] as const).map((kind) => (
        <TabsContent key={kind} value={kind}>
          <Responsibilities
            kind={kind}
            refresh={refresh}
            snapshot={snapshot}
            selected={location.id}
            select={(id) => locate({ tab: kind, id })}
            compose={compose}
            openFile={openFile}
            openGoal={(id) => locate({ tab: "goals", id })}
            source={source}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
