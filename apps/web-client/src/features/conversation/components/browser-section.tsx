import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useApiResource } from "@/hooks/use-api-resource";
import { command } from "@/lib/api-client";
import type { BrowserProfile, BrowserSession } from "@/types/work";
import type { Agent } from "@/types/workspace";
import { type BrowserView, BrowserViewer } from "./browser-viewer";

export function BrowserSection({
  agents,
  threadId,
  cursor,
}: {
  agents: Agent[];
  threadId: string;
  cursor: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState(agents[0]?.id ?? "");
  const agentId = agents.find((a) => a.id === selectedAgent)?.id ?? agents[0]?.id ?? "";
  const [target, setTarget] = useState<BrowserView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const profiles = useApiResource<{ profile: BrowserProfile; sessions: BrowserSession[] }[]>(
    expanded ? `/v1/browser/profiles?agent_id=${agentId}&thread_id=${threadId}` : null,
    cursor,
  );
  return (
    <details
      className="context-section border-t pt-4"
      onToggle={(e) => setExpanded(e.currentTarget.open)}
    >
      <summary className="cursor-pointer text-sm font-medium">Browser percakapan</summary>
      <div className="mt-3 space-y-3">
        {agents.length > 1 && (
          <label className="block space-y-2 text-sm">
            Browser anggota
            <select
              aria-label="Browser anggota"
              className="h-9 w-full rounded-md border bg-background px-2"
              value={agentId}
              onChange={(e) => {
                setSelectedAgent(e.target.value);
                setTarget(null);
              }}
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="text-caption text-muted-foreground">
          Lihat browser yang digunakan agent dalam konteks ini. Login tersimpan pada profil browser
          tersebut.
        </p>
        {(error || profiles.error) && (
          <p role="alert" className="text-sm text-destructive">
            {error || profiles.error}
          </p>
        )}
        {profiles.data?.map(({ profile, sessions }) => (
          <div key={profile.id} className="flex items-center justify-between gap-2 border-b py-2">
            <div className="min-w-0">
              <p className="truncate text-sm">{profile.name}</p>
              <p className="text-caption text-muted-foreground">
                {sessions.at(-1)?.state ?? "Belum dibuka"}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTarget({ profileId: profile.id, agentId, threadId })}
            >
              Lihat browser
            </Button>
          </div>
        ))}
        {profiles.data?.length === 0 && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={async () => {
              if (busy) return;
              setBusy(true);
              setError("");
              try {
                await command("/v1/browser/profiles", {
                  name: "Browser percakapan",
                  grants: [{ agent_id: agentId, thread_id: threadId, actions: true }],
                });
                profiles.retry();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Browser belum tersedia.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Aktifkan browser percakapan
          </Button>
        )}
        <BrowserViewer target={target} close={() => setTarget(null)} />
      </div>
    </details>
  );
}
