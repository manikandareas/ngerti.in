import { Globe, Monitor } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useApiResource } from "@/hooks/use-api-resource";
import { command } from "@/lib/api-client";
import type { BrowserObservation, BrowserProfile, BrowserSession } from "@/types/work";
import type { Agent } from "@/types/workspace";
import { type BrowserView, BrowserViewer } from "./browser-viewer";
import { AgentAvatar } from "./identity";
import { PanelCard, PanelEmpty, PanelPageHeader } from "./panel-primitives";

export function BrowserSection({
  agents,
  threadId,
  cursor,
  onBack,
}: {
  agents: Agent[];
  threadId: string;
  cursor: number;
  onBack: () => void;
}) {
  const [selectedAgent, setSelectedAgent] = useState(agents[0]?.id ?? "");
  const agentId = agents.find((a) => a.id === selectedAgent)?.id ?? agents[0]?.id ?? "";
  const [target, setTarget] = useState<BrowserView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const profiles = useApiResource<{ profile: BrowserProfile; sessions: BrowserSession[] }[]>(
    `/v1/browser/profiles?agent_id=${agentId}&thread_id=${threadId}`,
    cursor,
  );
  const selected = agents.find((item) => item.id === agentId);
  const primary =
    profiles.data?.find((item) => item.sessions.at(-1)?.state === "ready") ?? profiles.data?.[0];
  const lastSession = primary?.sessions.at(-1);
  const observation = useApiResource<BrowserObservation>(
    lastSession?.state === "ready" && !lastSession.active_run_id && !target
      ? `/v1/browser/sessions/${lastSession.id}?${new URLSearchParams({ agent_id: agentId, thread_id: threadId })}`
      : null,
    lastSession?.revision ?? 0,
  );
  const image =
    observation.data?.session.id === lastSession?.id &&
    observation.data?.session.generation === lastSession?.generation
      ? observation.data?.content.find(
          (item) =>
            item.type === "image" &&
            ["image/png", "image/jpeg", "image/webp"].includes(item.mimeType),
        )
      : null;
  function watch(profile: BrowserProfile, session?: BrowserSession) {
    setTarget({
      profileId: profile.id,
      agentId,
      threadId,
      ...(session?.state === "ready" ? { session } : {}),
    });
  }
  const sessionLabels: Record<string, string> = {
    ready: "Sesi tersedia",
    detached: "Tampilan belum terhubung",
    closed: "Sesi ditutup",
    unknown: "Status sesi belum diketahui",
  };
  return (
    <div className="context-section pt-3.5">
      <PanelPageHeader
        title="Browser percakapan"
        back="File"
        onBack={onBack}
        intro="Lihat browser yang digunakan agent dalam konteks ini. Login tersimpan pada profil browser tersebut."
      />
      <div className="space-y-3">
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

        {(error || profiles.error) && (
          <p role="alert" className="text-sm text-destructive">
            {error || profiles.error}
          </p>
        )}
        <div>
          <button
            type="button"
            aria-label={`Lihat tampilan browser ${selected?.name ?? "agent"}`}
            disabled={!primary}
            onClick={() => {
              if (primary) watch(primary.profile, lastSession);
            }}
            className="group/screen relative mt-2.5 flex aspect-[16/10] w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-xl bg-composer ring-1 ring-inset ring-foreground/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
          >
            {image?.type === "image" ? (
              <img
                src={`data:${image.mimeType};base64,${image.data}`}
                alt="Pratinjau dari sesi browser yang sama"
                className="absolute inset-0 size-full object-cover"
              />
            ) : (
              <>
                <span className="opacity-60">
                  <AgentAvatar
                    agent={selected}
                    state={lastSession?.active_run_id ? "working" : "sleeping"}
                    className={lastSession?.active_run_id ? "size-[52px]" : "size-11"}
                  />
                </span>
                <span className="max-w-[80%] text-center text-[13px] font-medium">
                  {!primary
                    ? "Browser belum disiapkan"
                    : lastSession?.active_run_id
                      ? "Agent sedang menggunakan browser"
                      : lastSession
                        ? (sessionLabels[lastSession.state] ?? "Pratinjau belum tersedia")
                        : "Browser belum dibuka"}
                </span>
              </>
            )}
            {primary && (
              <span
                aria-hidden="true"
                className="absolute bottom-2.5 right-2.5 flex h-7 items-center gap-1.5 rounded-full border border-foreground/10 bg-panel/80 px-2.5 text-[12px] opacity-0 backdrop-blur-sm transition-opacity group-hover/screen:opacity-100 group-focus-within/screen:opacity-100 touch:opacity-100"
              >
                <Monitor size={13} strokeWidth={1.5} />
                Lihat
              </span>
            )}
          </button>
          <p className="mt-3 text-center text-[13px] text-muted-foreground">
            {image
              ? "Pratinjau sesi browser yang sama"
              : "Buka tampilan untuk melihat browser agent"}
          </p>
        </div>
        <PanelCard label="Profil browser">
          {profiles.data?.map(({ profile, sessions }) => (
            <div
              key={profile.id}
              className="flex min-h-[46px] items-center gap-2.5 px-3.5 py-[11px]"
            >
              <Globe
                size={16}
                strokeWidth={1.5}
                className="shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{profile.name}</p>
                <p className="text-caption text-muted-foreground">
                  {sessions.at(-1)
                    ? (sessionLabels[sessions.at(-1)?.state ?? "unknown"] ??
                      "Status belum diketahui")
                    : "Belum dibuka"}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => watch(profile, sessions.at(-1))}>
                Lihat browser
              </Button>
            </div>
          ))}
          {profiles.data?.length === 0 && (
            <PanelEmpty>Agent belum memiliki browser untuk percakapan ini.</PanelEmpty>
          )}
        </PanelCard>
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
    </div>
  );
}
