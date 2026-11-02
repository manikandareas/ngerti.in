import {
  BrainIcon,
  Delete02Icon,
  File02Icon,
  FlashIcon,
  PencilEdit01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AgentModelRow, ConnectionSettings } from "@/features/conversation/components/settings";
import { command, request } from "@/lib/api-client";
import type { Agent, Connection, Memory, Skills } from "@/types/workspace";
import { PanelCard, PanelEmpty, PanelNavRow, PanelPageHeader } from "./panel-primitives";

export type AgentPage = "overview" | "memory" | "skills" | "instructions";

export function AgentPanel({
  agent,
  threadId,
  cursor,
  connections,
  refresh,
  report,
  manageProviders,
  configurationOpen,
  setConfigurationOpen,
  page,
  navigate,
}: {
  agent: Agent;
  threadId: string;
  cursor: number;
  connections: Connection[];
  refresh: () => Promise<unknown>;
  report: (error: string) => void;
  manageProviders: () => void;
  configurationOpen: boolean;
  setConfigurationOpen: (open: boolean) => void;
  page: AgentPage;
  navigate: (page: AgentPage) => void;
}) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [skills, setSkills] = useState<Skills | null>(null);
  const [editing, setEditing] = useState<Memory | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [more, setMore] = useState<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: committed events invalidate scoped learning projections.
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ agent_id: agent.id, thread_id: threadId });
    Promise.all([
      request<{ memories: Memory[]; next_after: string | null }>(
        `/v1/learning/memories?${query}`,
        undefined,
        undefined,
        controller.signal,
      ),
      request<Skills>(`/v1/learning/skills?${query}`, undefined, undefined, controller.signal),
    ])
      .then(([memory, inventory]) => {
        if (!controller.signal.aborted) {
          setMemories(memory.memories);
          setMore(memory.next_after);
          setSkills(inventory);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) report(error.message);
      });
    return () => controller.abort();
  }, [agent.id, threadId, cursor, report]);
  async function save(memory: Memory, remove = false) {
    setBusy(true);
    try {
      await command(`/v1/learning/memories/${remove ? "delete" : "write"}`, {
        context: { agent_id: agent.id, thread_id: threadId },
        memory_id: memory.id,
        expected_revision: memory.revision,
        ...(remove ? {} : { visibility: memory.visibility, text }),
      });
      setEditing(null);
      setNotice(remove ? "Memory dihapus." : "Memory diperbarui.");
      await refresh();
    } catch (error) {
      report(error instanceof Error ? error.message : "Perubahan gagal");
    } finally {
      setBusy(false);
    }
  }
  function back() {
    setConfigurationOpen(false);
    navigate("overview");
  }
  const nativeCount = (skills?.harness.length ?? 0) + (skills?.native_catalog.length ?? 0);
  return (
    <div className="agent-profile-content min-w-0 pb-1 pt-3.5">
      {configurationOpen ? (
        <>
          <PanelPageHeader title="Koneksi & model" onBack={back} />
          <ConnectionSettings
            agent={agent}
            connections={connections}
            refresh={refresh}
            report={report}
            manageProviders={manageProviders}
          />
        </>
      ) : page === "instructions" ? (
        <>
          <PanelPageHeader
            title="Arahan kerja"
            onBack={back}
            intro="Ubah nama, peran, dan cara kerja melalui percakapan."
          />
          <PanelCard label="Peran">
            <p className="whitespace-pre-wrap px-3.5 py-3 text-[13px] leading-[1.5]">
              {agent.soul || "Ceritakan bantuan yang kamu butuhkan di chat."}
            </p>
          </PanelCard>
          <PanelCard label="Arahan tambahan">
            <p className="whitespace-pre-wrap px-3.5 py-3 text-[13px] leading-[1.5]">
              {agent.instructions || "Belum ada arahan tambahan."}
            </p>
          </PanelCard>
        </>
      ) : page === "memory" ? (
        <>
          <PanelPageHeader
            title="Memory"
            onBack={back}
            intro="Hal yang diingat dari percakapan ini. Koreksi atau hapus bila perlu."
          />
          {notice && (
            <p role="status" className="mb-3 px-1 text-[13px] text-link">
              {notice}
            </p>
          )}
          <PanelCard>
            {memories.length === 0 && (
              <PanelEmpty>Belum ada memory dalam percakapan ini.</PanelEmpty>
            )}
            {memories.map((memory) => (
              <div key={memory.id} className="profile-memory space-y-2 px-3.5 py-3">
                {editing?.id === memory.id ? (
                  <>
                    <Label htmlFor="memory-edit">Koreksi memory</Label>
                    <Textarea
                      id="memory-edit"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                    />
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        disabled={busy || !text.trim()}
                        onClick={() => void save(editing)}
                      >
                        Simpan
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                        Batal
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="whitespace-pre-wrap text-[13px] leading-[1.5]">{memory.text}</p>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1.5 px-2 text-[12px] text-muted-foreground"
                        onClick={() => {
                          setEditing(memory);
                          setText(memory.text);
                        }}
                      >
                        <HugeiconsIcon icon={PencilEdit01Icon} size={12} strokeWidth={1.5} />
                        Koreksi
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1.5 px-2 text-[12px] text-muted-foreground"
                        disabled={busy}
                        onClick={() => void save(memory, true)}
                      >
                        <HugeiconsIcon icon={Delete02Icon} size={12} strokeWidth={1.5} />
                        Hapus memory
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </PanelCard>
          {more && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 text-[13px] text-muted-foreground"
              onClick={async () => {
                try {
                  const query = new URLSearchParams({
                    agent_id: agent.id,
                    thread_id: threadId,
                    after: more,
                  });
                  const next = await request<{ memories: Memory[]; next_after: string | null }>(
                    `/v1/learning/memories?${query}`,
                  );
                  setMemories((current) => [...current, ...next.memories]);
                  setMore(next.next_after);
                } catch (error) {
                  report(String(error));
                }
              }}
            >
              Memory sebelumnya
            </Button>
          )}
        </>
      ) : page === "skills" ? (
        <>
          <PanelPageHeader
            title="Skills"
            onBack={back}
            intro="Skills aplikasi dapat dibuat dan diperbaiki melalui chat. Skills bawaan harness hanya dibaca."
          />
          <PanelCard label="Skills aplikasi">
            {skills?.application.map((skill) => (
              <div key={skill.id} className="flex items-center gap-2.5 px-3.5 py-3">
                <HugeiconsIcon
                  icon={FlashIcon}
                  size={15}
                  strokeWidth={1.5}
                  className="shrink-0 text-muted-foreground"
                />
                <span className="min-w-0 flex-1 text-[14px]">{skill.name}</span>
                <Badge variant="secondary" className="shrink-0 text-[11px] font-normal">
                  Aplikasi
                </Badge>
              </div>
            ))}
            {!skills?.application.length && (
              <PanelEmpty>Belum ada paket skill aplikasi.</PanelEmpty>
            )}
          </PanelCard>
          <PanelCard label="Bawaan harness">
            {skills?.harness.map((skill) => (
              <div key={skill.key} className="px-3.5 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[14px]">{skill.name}</p>
                  <Badge variant="outline" className="shrink-0 text-[11px] font-normal">
                    Harness · hanya baca
                  </Badge>
                </div>
                <p className="mt-1 text-[13px] leading-[1.35] text-muted-foreground">
                  {skill.description}
                </p>
              </div>
            ))}
            {skills?.native_catalog.map((skill) => (
              <div key={skill.key} className="px-3.5 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[14px]">{skill.name}</p>
                  <Badge variant="outline" className="shrink-0 text-[11px] font-normal">
                    Native · hanya baca
                  </Badge>
                </div>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  {skill.enabled ? "Aktif" : "Nonaktif"}
                </p>
              </div>
            ))}
            {!nativeCount && <PanelEmpty>Belum ada skills bawaan yang tersedia.</PanelEmpty>}
          </PanelCard>
          {skills && (
            <p className="px-1 pt-3 text-[12px] leading-[1.4] text-muted-foreground">
              Harness: {skills.harness_state} · Native: {skills.native_state}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="mx-1 mb-3.5 whitespace-pre-wrap text-center text-[13px] leading-[1.5] text-muted-foreground">
            {agent.soul || "Ceritakan bantuan yang kamu butuhkan di chat."}
          </p>
          <PanelCard>
            <AgentModelRow
              agent={agent}
              connections={connections}
              refresh={refresh}
              report={report}
              manageProviders={manageProviders}
            />
            <PanelNavRow
              title="Arahan kerja"
              icon={File02Icon}
              onClick={() => navigate("instructions")}
            />
          </PanelCard>
          <PanelCard label="Yang dipelajari">
            <PanelNavRow
              title="Memory"
              value={memories.length || undefined}
              icon={BrainIcon}
              onClick={() => navigate("memory")}
            />
            <PanelNavRow
              title="Skills"
              value={(skills?.application.length ?? 0) + nativeCount || undefined}
              icon={FlashIcon}
              onClick={() => navigate("skills")}
            />
          </PanelCard>
        </>
      )}
    </div>
  );
}
