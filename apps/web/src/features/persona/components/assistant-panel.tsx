import {
  ArrowLeft,
  Clock3,
  Fingerprint,
  Heart,
  History,
  List,
  Pencil,
  ShieldCheck,
  X,
  Zap,
} from "lucide-react";
import { Tabs } from "radix-ui";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useOnline } from "@/features/chat/hooks/use-online";
import { MemoryPanel } from "@/features/memory/components/memory-panel";
import { usePersona } from "@/features/persona/hooks/use-persona";
import type { AssistantTab } from "@/features/persona/types";
import type { WorkspaceView } from "@/features/workspace/types";
import { AssistantActivity, AssistantUpcoming } from "./assistant-activity";
import { AssistantApprovals } from "./assistant-approvals";
import { PersonaAvatar } from "./persona-avatar";
import { PersonaEditor } from "./persona-editor";
import { PersonaHistory } from "./persona-history";
import { PersonaProposalCard } from "./persona-proposal";

export function AssistantPanel({
  onClose,
  threadId,
  onNavigate,
  onDiscuss,
  initialTab = "activity",
}: {
  threadId: string | null;
  onClose: () => void;
  onNavigate: (view: WorkspaceView) => void;
  onDiscuss: (section: string, revision: number) => void;
  initialTab?: AssistantTab;
}) {
  const persona = usePersona();
  const online = useOnline();
  const [tab, setTab] = useState(initialTab);
  const [section, setSection] = useState<"overview" | "profile" | "soul" | "history" | "memory">(
    "overview",
  );
  const profile = persona.data?.profile;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative shrink-0 px-4 pb-7 pt-10 max-[700px]:pb-4 max-[700px]:pt-3">
        <button
          type="button"
          className="absolute right-4 top-3 flex size-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
          aria-label="Tutup panel asisten"
          onClick={onClose}
        >
          <X className="size-5" />
        </button>
        <div className="flex flex-col items-center">
          <div className="relative [&>span[aria-hidden]]:size-36 max-[700px]:[&>span[aria-hidden]]:size-28">
            <PersonaAvatar profile={profile} />
            <button
              type="button"
              aria-label="Edit profil asisten"
              onClick={() => {
                setTab("identity");
                setSection("profile");
              }}
              className="absolute bottom-2 right-1 flex size-9 items-center justify-center rounded-full bg-muted ring-4 ring-background hover:bg-accent"
            >
              <Pencil className="size-4" />
            </button>
          </div>
          <h2 className="text-2xl font-semibold">{profile?.name ?? "Gwen"}</h2>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Zap
              className={`size-4 ${online && !persona.isError ? "text-success-foreground" : "text-muted-foreground"}`}
            />
            {!online
              ? "Offline"
              : persona.isError
                ? "Belum tersambung"
                : persona.isPending
                  ? "Menyambungkan…"
                  : "Connected"}
          </p>
        </div>
      </div>
      <Tabs.Root
        value={tab}
        onValueChange={(value) => setTab(value as AssistantTab)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <Tabs.List
          aria-label="Panel asisten"
          className="mx-4 flex h-10 shrink-0 rounded-full bg-muted/60 p-1"
        >
          {(
            [
              ["activity", "Aktivitas", List],
              ["approvals", "Persetujuan", ShieldCheck],
              ["upcoming", "Jadwal", Clock3],
              ["identity", "Identitas", Fingerprint],
            ] as const
          ).map(([value, label, Icon]) => (
            <Tabs.Trigger
              key={value}
              value={value}
              aria-label={label}
              title={label}
              className="flex min-w-0 flex-1 items-center justify-center rounded-full text-muted-foreground outline-none data-[state=active]:bg-foreground/10 data-[state=active]:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon className="size-[18px]" strokeWidth={1.7} />
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="activity" className="min-h-0 flex-1 overflow-y-auto p-5 outline-none">
          <AssistantActivity onNavigate={onNavigate} />
        </Tabs.Content>
        <Tabs.Content value="approvals" className="min-h-0 flex-1 overflow-y-auto p-5 outline-none">
          <AssistantApprovals threadId={threadId} />
        </Tabs.Content>
        <Tabs.Content value="upcoming" className="min-h-0 flex-1 overflow-y-auto p-5 outline-none">
          <AssistantUpcoming onNavigate={onNavigate} />
        </Tabs.Content>
        <Tabs.Content
          value="identity"
          className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-5 outline-none"
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
              <div className="rounded-3xl bg-muted/60 p-4">
                <h4 className="mb-2 text-sm font-medium">{profile.name}</h4>
                <button
                  type="button"
                  onClick={() => setSection("profile")}
                  className="flex min-h-10 w-full items-center justify-center gap-2 rounded-full bg-foreground/10 text-sm hover:bg-foreground/15"
                >
                  <Pencil className="size-4" />
                  Edit
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {(
                  [
                    ["soul", "SOUL"],
                    ["memory", "MEMORY"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSection(value)}
                    className={`flex aspect-[1.1] flex-col rounded-3xl p-4 text-left ${value === "soul" ? "bg-danger-subtle bg-[radial-gradient(ellipse_at_bottom_left,var(--color-danger-subtle),transparent_75%)] text-danger" : "bg-secondary bg-[radial-gradient(ellipse_at_bottom_left,var(--color-primary),transparent_90%)] text-foreground"}`}
                  >
                    <span className="text-sm font-medium">{label}</span>
                    <span className="mt-1 text-[10px] tracking-wide opacity-75">
                      ACCESS WITH CARE
                    </span>
                    <Heart className="mt-auto size-5 self-end" fill="currentColor" />
                  </button>
                ))}
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
              {section === "memory" ? (
                <MemoryPanel />
              ) : section === "history" ? (
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
