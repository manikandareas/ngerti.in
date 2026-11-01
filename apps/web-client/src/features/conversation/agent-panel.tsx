import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { command, request } from "./api";
import { ConnectionSettings } from "./settings";
import type { Agent, Connection, Memory, Skills } from "./types";

export function AgentPanel({
  agent,
  threadId,
  cursor,
  connections,
  refresh,
  report,
}: {
  agent: Agent;
  threadId: string;
  cursor: number;
  connections: Connection[];
  refresh: () => Promise<unknown>;
  report: (error: string) => void;
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
  return (
    <div className="space-y-6 py-5">
      <section className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-card bg-accent text-xl">
            {agent.avatar ?? agent.name[0]}
          </span>
          <div>
            <h2 className="font-medium">{agent.name}</h2>
            <p className="text-caption text-muted-foreground">
              {agent.harness} · {agent.model_id ?? "Default model"}
            </p>
          </div>
        </div>
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
          {agent.soul || "Ceritakan bantuan yang kamu butuhkan di chat."}
        </p>
        <details>
          <summary className="cursor-pointer text-sm">Arahan kerja</summary>
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
            {agent.instructions || "Belum ada arahan tambahan."}
          </p>
        </details>
        <p className="text-caption text-muted-foreground">
          Ubah nama, peran, dan cara kerja melalui percakapan.
        </p>
        <Badge variant="outline">Profil revision {agent.revision}</Badge>
      </section>
      <section className="space-y-3 border-t pt-5">
        <h3 className="font-medium">Memory</h3>
        {notice && (
          <p role="status" className="text-sm text-link">
            {notice}
          </p>
        )}
        {memories.length === 0 && (
          <p className="text-sm text-muted-foreground">Belum ada memory dalam percakapan ini.</p>
        )}
        {memories.map((memory) => (
          <div key={memory.id} className="space-y-2 rounded-lg border p-3">
            {editing?.id === memory.id ? (
              <>
                <Label htmlFor="memory-edit">Koreksi memory</Label>
                <Textarea id="memory-edit" value={text} onChange={(e) => setText(e.target.value)} />
                <div className="flex gap-2">
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
                <p className="whitespace-pre-wrap text-sm">{memory.text}</p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing(memory);
                      setText(memory.text);
                    }}
                  >
                    Koreksi
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void save(memory, true)}
                  >
                    Hapus memory
                  </Button>
                </div>
              </>
            )}
          </div>
        ))}
        {more && (
          <Button
            variant="outline"
            size="sm"
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
      </section>
      <section className="space-y-3 border-t pt-5">
        <h3 className="font-medium">Skills</h3>
        <p className="text-caption text-muted-foreground">
          Skills aplikasi dapat dibuat dan diperbaiki melalui chat. Skills bawaan harness hanya
          dibaca.
        </p>
        {skills && (
          <>
            <p className="text-caption text-muted-foreground">
              Harness: {skills.harness_state} · Native: {skills.native_state}
            </p>
            {skills.harness.map((skill) => (
              <div key={skill.key} className="text-sm">
                <Badge variant="outline">Harness · hanya baca</Badge>
                <p className="mt-1">{skill.name}</p>
                <p className="text-caption text-muted-foreground">{skill.description}</p>
              </div>
            ))}
            {skills.native_catalog.map((skill) => (
              <div key={skill.key} className="text-sm">
                <Badge variant="outline">Native · hanya baca</Badge>
                <p>
                  {skill.name} · {skill.enabled ? "Aktif" : "Nonaktif"}
                </p>
              </div>
            ))}
            {skills.application.map((skill) => (
              <div key={skill.id} className="text-sm">
                <Badge variant="secondary">Aplikasi · dapat diperbaiki</Badge>
                <p>{skill.name}</p>
              </div>
            ))}
            {!skills.application.length && (
              <p className="text-sm text-muted-foreground">Belum ada paket skill aplikasi.</p>
            )}
          </>
        )}
      </section>
      <details className="border-t pt-5">
        <summary className="cursor-pointer font-medium">Koneksi & model</summary>
        <div className="mt-4">
          <ConnectionSettings
            agent={agent}
            connections={connections}
            refresh={refresh}
            report={report}
          />
        </div>
      </details>
    </div>
  );
}
