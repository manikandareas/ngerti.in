import { ArrowLeft, ArrowRight, History, X } from "lucide-react";
import { Tabs } from "radix-ui";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { usePersona } from "@/features/persona/hooks/use-persona";
import type { AssistantTab } from "@/features/persona/types";
import type { WorkspaceView } from "@/features/workspace/types";
import { AssistantActivity, AssistantUpcoming } from "./assistant-activity";
import { PersonaAvatar } from "./persona-avatar";
import { PersonaEditor } from "./persona-editor";
import { PersonaHistory } from "./persona-history";
import { PersonaProposalCard } from "./persona-proposal";

export function AssistantPanel({
  onClose,
  onNavigate,
  onDiscuss,
  initialTab = "identity",
}: {
  onClose: () => void;
  onNavigate: (view: WorkspaceView) => void;
  onDiscuss: (section: string, revision: number) => void;
  initialTab?: AssistantTab;
}) {
  const persona = usePersona();
  const [section, setSection] = useState<"overview" | "profile" | "soul" | "history">("overview");
  const profile = persona.data?.profile;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <PersonaAvatar profile={profile} />
          <div className="min-w-0">
            <h2 className="truncate font-bold">{profile?.name ?? "Asisten personalmu"}</h2>
            <p className="truncate text-xs text-muted-foreground">
              {profile?.tagline ?? "Profil dan aktivitas"}
            </p>
          </div>
        </div>
        <Button
          size="icon"
          className="size-11"
          variant="ghost"
          aria-label="Tutup panel asisten"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>
      <Tabs.Root defaultValue={initialTab} className="flex min-h-0 flex-1 flex-col">
        <Tabs.List aria-label="Panel asisten" className="flex shrink-0 gap-1 border-b px-3">
          {(
            [
              ["activity", "Aktivitas"],
              ["upcoming", "Mendatang"],
              ["identity", "Identitas"],
            ] as const
          ).map(([value, label]) => (
            <Tabs.Trigger
              key={value}
              value={value}
              className="min-h-12 flex-1 border-b-2 border-transparent px-2 text-sm text-muted-foreground outline-none transition-colors data-[state=active]:border-primary data-[state=active]:font-bold data-[state=active]:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
            >
              {label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="activity" className="min-h-0 flex-1 overflow-y-auto p-5 outline-none">
          <AssistantActivity onNavigate={onNavigate} />
        </Tabs.Content>
        <Tabs.Content value="upcoming" className="min-h-0 flex-1 overflow-y-auto p-5 outline-none">
          <AssistantUpcoming onNavigate={onNavigate} />
        </Tabs.Content>
        <Tabs.Content
          value="identity"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 outline-none"
        >
          {persona.isPending ? (
            <p role="status">Membuka identitas…</p>
          ) : !profile ? (
            <div role="alert">
              <p>Profil belum dapat dibuka. Coba muat kembali.</p>
              <Button className="mt-3" variant="outline" onClick={() => void persona.refetch()}>
                Coba lagi
              </Button>
            </div>
          ) : section === "overview" ? (
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-bold">Identitas</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Kenali asistenmu dan atur cara ia membantu. Berlaku di semua percakapanmu.
                </p>
              </div>
              <div className="divide-y border-y">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-4 py-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => setSection("profile")}
                >
                  <span>
                    <span className="block font-bold">Profil {profile.name}</span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      Nama, avatar, dan deskripsi singkat.
                    </span>
                  </span>
                  <ArrowRight className="size-4 shrink-0" />
                </button>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-4 py-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => setSection("soul")}
                >
                  <span>
                    <span className="block font-bold">Karakter {profile.name}</span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      Soul · cara berbicara dan membantu.
                    </span>
                  </span>
                  <ArrowRight className="size-4 shrink-0" />
                </button>
                <div className="py-5">
                  <p className="font-bold">Ingatan tentangmu</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Memory lintas percakapan sedang disiapkan. {profile.name} belum menyimpan
                    ingatan baru tentangmu.
                  </p>
                </div>
              </div>
              <Button variant="ghost" onClick={() => setSection("history")}>
                <History /> Riwayat perubahan
              </Button>
              {persona.data?.proposals
                .filter((p) => p.status === "proposed")
                .map((p) => (
                  <PersonaProposalCard key={p.id} proposal={p} activeRevision={profile.revision} />
                ))}
            </div>
          ) : (
            <div className="space-y-5">
              <Button variant="ghost" className="-ml-3" onClick={() => setSection("overview")}>
                <ArrowLeft /> Identitas
              </Button>
              {section === "history" ? (
                <PersonaHistory profile={profile} />
              ) : (
                <PersonaEditor
                  profile={profile}
                  section={section}
                  onDiscuss={() =>
                    onDiscuss(
                      section === "soul" ? "karakter asistenku" : "profil asistenku",
                      profile.revision,
                    )
                  }
                />
              )}
            </div>
          )}
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
