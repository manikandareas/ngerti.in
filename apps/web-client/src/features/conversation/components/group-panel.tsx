import { useState } from "react";
import { Button } from "@/components/ui/button";
import { command } from "@/lib/api-client";
import type { Agent, Snapshot, Thread } from "@/types/workspace";
import { AgentAvatar } from "./identity";

export function GroupPanel({
  snapshot,
  agents,
  refresh,
  compose,
  initialMember,
}: {
  snapshot: Snapshot;
  agents: Agent[];
  refresh: () => Promise<unknown>;
  compose: (text: string) => void;
  initialMember?: string | null;
}) {
  const [member, setMember] = useState<string | null>(initialMember ?? null);
  const [selected, setSelected] = useState(snapshot.thread.member_agent_ids);
  const [expectedRevision, setExpectedRevision] = useState(snapshot.thread.revision);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const profile = snapshot.agents.find((a) => a.id === member);
  if (profile)
    return (
      <div className="context-section space-y-4">
        <Button
          variant="ghost"
          size="sm"
          aria-label="Kembali ke anggota"
          onClick={() => setMember(null)}
        >
          ← Kembali ke anggota
        </Button>
        <AgentAvatar agent={profile} />
        <h3 className="font-medium">{profile.name}</h3>
        <p className="text-sm">{profile.soul || "Anggota grup"}</p>
        <p className="text-caption text-muted-foreground">
          Profil ringkas dalam grup. Memory, riwayat, dan file DM tetap berada di percakapan privat.
        </p>
      </div>
    );
  return (
    <div className="context-section space-y-6">
      <section className="space-y-2">
        <h3 className="text-caption font-medium text-muted-foreground">
          Tujuan dan arahan bersama
        </h3>
        <p className="whitespace-pre-wrap text-sm">
          {snapshot.thread.shared_instructions ||
            "Ceritakan apa yang ingin dikerjakan bersama di percakapan."}
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => compose("Bantu perbarui tujuan dan arahan bersama grup ini: ")}
        >
          Ubah melalui percakapan
        </Button>
      </section>
      <section className="space-y-1">
        <h3 className="mb-2 text-caption font-medium text-muted-foreground">
          Anggota · {snapshot.agents.length}
        </h3>
        {snapshot.agents.map((a) => (
          <Button
            key={a.id}
            variant="ghost"
            className="h-auto min-h-12 w-full justify-start gap-3 px-1 text-left"
            aria-label={`Profil anggota ${a.name}`}
            onClick={() => setMember(a.id)}
          >
            <AgentAvatar agent={a} />
            <span className="truncate">{a.name}</span>
          </Button>
        ))}
      </section>
      <details
        onToggle={(e) => {
          if (e.currentTarget.open) {
            setSelected(snapshot.thread.member_agent_ids);
            setExpectedRevision(snapshot.thread.revision);
          }
        }}
      >
        <summary className="cursor-pointer text-sm font-medium">Kelola anggota</summary>
        <form
          className="mt-3 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            setError("");
            try {
              const saved = await command<Thread>(`/v1/groups/${snapshot.thread.id}/membership`, {
                expected_revision: expectedRevision,
                member_agent_ids: selected,
              });
              setExpectedRevision(saved.revision);
              await refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Perubahan gagal");
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={busy}>
            {agents.map((a) => (
              <label key={a.id} className="flex min-h-10 items-center gap-2">
                <input
                  type="checkbox"
                  aria-label={`Anggota ${a.name}`}
                  checked={selected.includes(a.id)}
                  onChange={(e) =>
                    setSelected((v) =>
                      e.target.checked ? [...v, a.id] : v.filter((id) => id !== a.id),
                    )
                  }
                />
                <span className="truncate">{a.name}</span>
              </label>
            ))}
          </fieldset>
          <p className="text-caption text-muted-foreground">
            Perubahan akses berlaku untuk pekerjaan berikutnya. Resource privat anggota tidak ikut
            dibagikan.
          </p>
          {error && (
            <div>
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelected(snapshot.thread.member_agent_ids);
                  setExpectedRevision(snapshot.thread.revision);
                  setError("");
                }}
              >
                Muat anggota terbaru
              </Button>
            </div>
          )}
          <Button size="sm" disabled={busy || !selected.length}>
            Simpan anggota
          </Button>
        </form>
      </details>
    </div>
  );
}
