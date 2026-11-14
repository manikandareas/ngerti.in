import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useSettingsWorkspace } from "@/hooks/settings-workspace";
import { command, request } from "@/lib/api-client";
import type { AppConnection } from "@/types/work";
import type { Snapshot } from "@/types/workspace";

type AppTool = { slug: string; description?: string };

export function PluginAccess({
  connection,
  snapshot,
  changed,
}: {
  connection: AppConnection;
  snapshot: Snapshot;
  changed: () => void;
}) {
  const workspace = useSettingsWorkspace();
  const organizationOwned = connection.ownership === "organization";
  const agents = organizationOwned
    ? workspace.agents.filter((agent) => agent.organization_id && agent.actor_id === null)
    : snapshot.agents;
  const grantThread = organizationOwned ? null : snapshot.thread.id;
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const [editing, setEditing] = useState(connection);
  const grantsFor = (id: string) =>
    editing.grants.find((grant) => grant.thread_id === grantThread && grant.agent_id === id)
      ?.tools ?? [];
  const [selected, setSelected] = useState(() => grantsFor(agentId));
  const [query, setQuery] = useState("");
  const [tools, setTools] = useState<AppTool[]>([]);
  const [operation, setOperation] = useState<"search" | "save" | null>(null);
  const busy = operation !== null;
  const inFlight = useRef(false);

  async function act(kind: "search" | "save", operation: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setOperation(kind);
    try {
      await operation();
    } catch (failure) {
      toast.error("Could not update access", {
        description: failure instanceof Error ? failure.message : "Please try again.",
      });
    } finally {
      inFlight.current = false;
      setOperation(null);
    }
  }
  return (
    <section className="marketplace-access" aria-label={`Access to ${connection.toolkit}`}>
      <h3>{organizationOwned ? "Team agent access" : "Conversation access"}</h3>
      <p className="marketplace-availability-note">
        Choose the actions your agent can use in{" "}
        {snapshot.thread.name ?? snapshot.agents[0]?.name ?? "this conversation"}.
      </p>
      {(organizationOwned || snapshot.thread.type === "group") && (
        <>
          <Label htmlFor="plugin-agent">Agent with access</Label>
          <select
            id="plugin-agent"
            value={agentId}
            disabled={busy}
            onChange={(event) => {
              setAgentId(event.target.value);
              setSelected(grantsFor(event.target.value));
              setTools([]);
              setQuery("");
            }}
          >
            {agents
              .filter(
                (agent) => organizationOwned || snapshot.thread.member_agent_ids.includes(agent.id),
              )
              .map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
          </select>
        </>
      )}
      <div className="marketplace-access-search">
        <Input
          aria-label="Search app actions"
          placeholder="Describe an action…"
          value={query}
          disabled={busy}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Button
          variant="secondary"
          disabled={busy || !query.trim()}
          onClick={() =>
            void act("search", async () => {
              const result = await request<AppTool[] | { truncated: true; message: string }>(
                "/v1/apps/search",
                { connection_id: editing.id, query },
              );
              if (!Array.isArray(result)) throw new Error(result.message);
              setTools(result);
              if (!result.length)
                toast.info("No matching actions", {
                  description: "Try a more specific description.",
                });
            })
          }
        >
          {operation === "search" ? "Searching…" : "Search actions"}
        </Button>
      </div>
      {operation === "search" ? (
        <div className="marketplace-account-skeleton" role="status" aria-label="Searching actions">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-3/4" />
        </div>
      ) : (
        [...new Set([...selected, ...tools.map((tool) => tool.slug)])].map((slug) => (
          <label key={slug} className="marketplace-tool-option">
            <input
              type="checkbox"
              checked={selected.includes(slug)}
              disabled={busy}
              onChange={(event) =>
                setSelected((previous) =>
                  event.target.checked
                    ? [...previous, slug]
                    : previous.filter((value) => value !== slug),
                )
              }
            />
            <span>
              {tools.find((tool) => tool.slug === slug)?.description ??
                slug.toLowerCase().replaceAll("_", " ")}
            </span>
          </label>
        ))
      )}
      <Button
        className="self-start"
        disabled={busy || !agents.some((agent) => agent.id === agentId)}
        onClick={() =>
          void act("save", async () => {
            const grants = editing.grants.filter(
              (grant) => !(grant.agent_id === agentId && grant.thread_id === grantThread),
            );
            if (selected.length)
              grants.push({
                agent_id: agentId,
                thread_id: grantThread,
                tools: selected,
                resources:
                  editing.grants.find(
                    (grant) => grant.agent_id === agentId && grant.thread_id === grantThread,
                  )?.resources ?? {},
              });
            const result = await command<AppConnection>(
              `/v1/apps/connections/${editing.id}/assign`,
              { expected_revision: editing.revision, grants },
            );
            setEditing(result);
            toast.success("Access updated.");
            changed();
          })
        }
      >
        {operation === "save"
          ? "Saving…"
          : organizationOwned
            ? "Save agent access"
            : "Save conversation access"}
      </Button>
    </section>
  );
}
