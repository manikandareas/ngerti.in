import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Artifact } from "@/types/work";
import type { Agent, Connection, Snapshot, Thread } from "@/types/workspace";
import { AgentPanel } from "./agent-panel";
import { AppConnections } from "./app-connections";
import { BrowserSection } from "./browser-section";
import { FilesPanel } from "./files-panel";
import { GroupPanel } from "./group-panel";
import { AgentAvatar } from "./identity";
import { Responsibilities } from "./responsibilities";

export type PanelLocation = { tab: "agent" | "files" | "goals" | "routine"; id: string | null };
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
  const openFile = (id: string) => locate({ tab: "files", id });
  return (
    <Tabs
      value={location.tab}
      onValueChange={(tab) => locate({ tab: tab as PanelLocation["tab"], id: null })}
      className="context-panel gap-2 pb-5"
      id="conversation-details"
    >
      <div className="profile-identity flex flex-col items-center gap-3.5 [padding:12px_20px_20px]">
        <AgentAvatar
          agent={agent}
          group={snapshot.thread.type === "group"}
          className="size-20 rounded-2xl text-3xl"
        />
        <h2 className="max-w-full break-words text-center">
          {snapshot.thread.name ?? agent?.name ?? "Percakapan"}
        </h2>
      </div>
      <TabsList className="context-tabs" aria-label="Detail sesuai konteks">
        <TabsTrigger value="agent">
          {snapshot.thread.type === "group" ? "Anggota" : "Agent"}
        </TabsTrigger>
        <TabsTrigger value="files">File</TabsTrigger>
        <TabsTrigger value="goals">Goals</TabsTrigger>
        <TabsTrigger value="routine">Routine</TabsTrigger>
      </TabsList>
      <TabsContent value="agent">
        {agent && snapshot.thread.type === "dm" ? (
          <AgentPanel
            key={agent.id}
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
            snapshot={snapshot}
            agents={agents}
            refresh={refresh}
            compose={compose}
          />
        )}
        <AppConnections snapshot={snapshot} />
      </TabsContent>
      <TabsContent value="files">
        <FilesPanel
          snapshot={snapshot}
          threads={threads}
          agents={agents}
          selected={location.id}
          select={(id) => locate({ tab: "files", id })}
          refresh={refresh}
          attach={attach}
        />
        {agent && (
          <BrowserSection
            agents={snapshot.agents}
            threadId={snapshot.thread.id}
            cursor={snapshot.cursor}
          />
        )}
      </TabsContent>
      {(["goals", "routine"] as const).map((kind) => (
        <TabsContent key={kind} value={kind}>
          <Responsibilities
            kind={kind}
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
