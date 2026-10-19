import { Button } from "@/components/ui/button";
import { usePersona, usePersonaCommands } from "@/features/persona/hooks/use-persona";
import type { PersonaProposal } from "@/features/persona/types";
import { PersonaChanges } from "./persona-changes";

export function PersonaProposalCard({
  proposal,
  activeRevision,
}: {
  proposal: PersonaProposal;
  activeRevision: number;
}) {
  const { pending, error, send } = usePersonaCommands();
  const expired = Date.parse(proposal.expires_at) <= Date.now();
  const stale = proposal.expected_revision !== activeRevision;
  const status = {
    approved: "Sudah diterapkan",
    rejected: "Usulan ditolak",
    expired: "Usulan kedaluwarsa",
    proposed: "Menunggu keputusanmu",
  }[proposal.status];
  return (
    <article
      className="space-y-4 rounded-xl border bg-card p-4 text-sm"
      aria-label="Usulan karakter Gwen"
    >
      <div>
        <h3 className="font-bold">Tinjau perubahan profil & karakter</h3>
        <p className="mt-1 text-muted-foreground">{status}</p>
      </div>
      {proposal.status === "proposed" ? (
        <PersonaChanges before={proposal.before_content} after={proposal.content} />
      ) : (
        <details>
          <summary className="cursor-pointer">Lihat perubahan yang ditinjau</summary>
          <div className="mt-3">
            <PersonaChanges before={proposal.before_content} after={proposal.content} />
          </div>
        </details>
      )}
      {proposal.status === "proposed" ? (
        <>
          <p className="text-xs text-muted-foreground">
            Berlaku di semua percakapanmu setelah diterapkan. Pekerjaan yang sudah berjalan tetap
            memakai karakter sebelumnya.
          </p>
          {stale || expired ? (
            <p role="status" className="text-warning-foreground">
              {expired ? "Usulan ini sudah kedaluwarsa." : "Profil aktif sudah berubah."} Minta
              usulan baru agar perubahan sesuai versi terbaru.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={pending || stale || expired}
              onClick={() =>
                void send(`/proposals/${proposal.id}/decision`, { approved: true }, false)
              }
            >
              {pending ? "Menyimpan…" : "Terapkan perubahan"}
            </Button>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() =>
                void send(`/proposals/${proposal.id}/decision`, { approved: false }, false)
              }
            >
              Tolak
            </Button>
          </div>
        </>
      ) : null}
      {error ? (
        <p role="alert" className="text-danger">
          {error}
        </p>
      ) : null}
    </article>
  );
}

export function ThreadPersonaProposals({ threadId }: { threadId: string }) {
  const persona = usePersona();
  const proposals =
    persona.data?.proposals
      .filter((p) => p.thread_id === threadId && p.source === "chat")
      .slice(0, 5) ?? [];
  if (!persona.data || !proposals.length) return null;
  return (
    <section aria-label="Perubahan karakter" className="mt-6 space-y-3">
      {proposals.map((p) => (
        <PersonaProposalCard
          key={p.id}
          proposal={p}
          activeRevision={persona.data.profile.revision}
        />
      ))}
    </section>
  );
}
