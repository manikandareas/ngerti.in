import { ArrowRight01Icon, Download04Icon, Share08Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { command, request } from "@/lib/api-client";
import { artifactUrl } from "@/lib/workspace-files";
import type { Artifact, Workspace } from "@/types/work";
import type { Agent, Snapshot, Thread } from "@/types/workspace";
import { savedFileTarget, useContentViewer } from "../lib/content-viewer";
import { FileTypeIcon } from "./file-type-icon";
import { PanelCard, PanelEmpty, PanelNavRow, PanelPageHeader } from "./panel-primitives";

export function FilesPanel({
  snapshot,
  threads,
  agents,
  selected,
  select,
  refresh,
  attach,
}: {
  snapshot: Snapshot;
  threads: Thread[];
  agents: Agent[];
  selected: string | null;
  select: (id: string | null) => void;
  refresh: () => Promise<unknown>;
  attach: (a: Artifact) => void;
}) {
  const active = snapshot.workspaces.filter(
    (w) =>
      w.state === "active" &&
      w.thread_id === snapshot.thread.id &&
      (w.scope === "group" || snapshot.thread.member_agent_ids.includes(w.agent_id ?? "")),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const viewer = useContentViewer();
  const [destinations, setDestinations] = useState<Workspace[] | null>(null);
  const [destination, setDestination] = useState("");
  const [shared, setShared] = useState("");
  const outputs = snapshot.artifacts.filter((item) => item.origin === "native_output");
  const artifact = snapshot.artifacts.find((a) => a.id === selected);
  async function act(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "File is not available yet.");
    } finally {
      setBusy(false);
    }
  }
  function open(item: Artifact) {
    if (item.workspace_id && active.some((w) => w.id === item.workspace_id))
      viewer?.open({ ...savedFileTarget(item, snapshot), info: () => select(item.id) });
    else
      setError(
        "The source folder is no longer connected. Check access or share the file to an active folder.",
      );
  }
  return (
    <div className="context-section min-w-0 space-y-3.5 pt-3.5">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {artifact ? (
        <>
          <PanelPageHeader
            title={artifact.name}
            back="Library"
            onBack={() => {
              select(null);
              setDestinations(null);
              setShared("");
            }}
          />
          <p className="text-caption text-muted-foreground">
            {artifact.media_type} · {artifact.size_bytes ?? "?"} byte
          </p>
          <PanelCard label="About this file">
            <dl className="divide-y divide-foreground/[0.05] break-all text-[13px] [&>div]:px-3.5 [&>div]:py-3 [&_dt]:mb-1">
              <div>
                <dt className="text-muted-foreground">Source</dt>
                <dd>
                  {(
                    {
                      upload: "Your attachment",
                      native_output: "Agent output",
                      shared_copy: "Shared file",
                      metadata: "File reference",
                    } as Record<string, string>
                  )[artifact.origin] ?? "Conversation file"}
                  {artifact.source_artifact_id ? " · shared copy" : ""}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Created by</dt>
                <dd>
                  {snapshot.agents.find((agent) => agent.id === artifact.created_by_agent_id)
                    ?.name ??
                    (artifact.run_id ? "Created in this conversation" : "Uploaded by you")}
                </dd>
              </div>
            </dl>
          </PanelCard>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" data-viewer-file={artifact.id} onClick={() => open(artifact)}>
              <FileTypeIcon name={artifact.name} mediaType={artifact.media_type} />
              Open {artifact.name}
            </Button>
            {active.some((w) => w.id === artifact.workspace_id) && (
              <Button variant="outline" size="sm" asChild>
                <a href={artifactUrl(artifact)} download={artifact.name}>
                  <HugeiconsIcon icon={Download04Icon} size={14} strokeWidth={1.5} />
                  Download {artifact.name}
                </a>
              </Button>
            )}
            {active.some((w) => w.id === artifact.workspace_id) && (
              <Button variant="ghost" size="sm" onClick={() => attach(artifact)}>
                Attach to message
              </Button>
            )}
          </div>
          <details
            className="group/share rounded-[12px] bg-composer ring-1 ring-inset ring-foreground/[0.06]"
            onToggle={(e) => {
              if (e.currentTarget.open && !destinations)
                void act(async () => {
                  setDestinations(
                    (await request<Workspace[]>("/v1/entities/workspace")).filter(
                      (w) => w.state === "active" && w.id !== artifact.workspace_id,
                    ),
                  );
                });
            }}
          >
            <summary className="flex min-h-[46px] cursor-pointer list-none items-center gap-2.5 px-3.5 py-[11px] text-[14px] [&::-webkit-details-marker]:hidden">
              <HugeiconsIcon
                icon={Share08Icon}
                size={15}
                strokeWidth={1.5}
                className="shrink-0 text-muted-foreground"
              />
              <span className="flex-1">Share a copy to another conversation</span>
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                size={15}
                strokeWidth={1.5}
                className="shrink-0 text-muted-foreground group-open/share:rotate-90"
              />
            </summary>
            <div className="space-y-3 px-3.5 pb-3.5">
              <Label htmlFor="share-destination">Destination folder</Label>
              <select
                id="share-destination"
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={destination}
                onChange={(e) => {
                  setDestination(e.target.value);
                  setShared("");
                }}
              >
                <option value="">Choose a folder…</option>
                {destinations?.map((w) => (
                  <option key={w.id} value={w.id}>
                    {threads.find((t) => t.id === w.thread_id)?.name ??
                      agents.find((a) => a.id === w.agent_id)?.name ??
                      "Conversation"}{" "}
                    ·{" "}
                    {w.scope === "group"
                      ? "Group"
                      : (agents.find((a) => a.id === w.agent_id)?.name ?? "Agent")}{" "}
                    · {w.name}
                  </option>
                ))}
              </select>
              <p className="text-caption text-muted-foreground">
                This saved copy is linked to the destination conversation. History and memory stay
                in the original conversation; machine working files remain shared.
              </p>
              <Button
                size="sm"
                disabled={!destination || busy}
                onClick={() =>
                  void act(async () => {
                    await command(`/v1/artifacts/${artifact.id}/share`, {
                      workspace_id: destination,
                    });
                    setShared("Copy shared.");
                  })
                }
              >
                Share this file
              </Button>
              {shared && (
                <p role="status" className="text-sm">
                  {shared}
                </p>
              )}
            </div>
          </details>
        </>
      ) : (
        <PanelCard label={<span className="text-[16px] font-semibold text-foreground">Files</span>}>
          {outputs.length ? (
            outputs.map((item) => (
              <PanelNavRow
                key={item.id}
                data-viewer-file={item.id}
                title={item.name}
                aria-label={`File ${item.name}`}
                hint={`${snapshot.agents.find((agent) => agent.id === (item.created_by_agent_id ?? item.agent_id))?.name ?? (item.agent_id === null ? "Group" : "Agent")}`}
                onClick={() => open(item)}
              >
                <FileTypeIcon name={item.name} mediaType={item.media_type} className="mx-1" />
              </PanelNavRow>
            ))
          ) : (
            <PanelEmpty>Files created by your agent will appear here.</PanelEmpty>
          )}
        </PanelCard>
      )}
    </div>
  );
}
