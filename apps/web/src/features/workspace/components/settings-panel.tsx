import { UserButton } from "@clerk/tanstack-react-start";
import { ChevronRight } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { BrowserSettings } from "@/features/computer/components/browser-settings";
import type { WorkspaceView } from "@/features/workspace/types";

export function SettingsPanel({
  onNavigate,
  onOpenAssistant,
}: {
  onNavigate: (view: WorkspaceView) => void;
  onOpenAssistant: () => void;
}) {
  return (
    <div className="divide-y border-y">
      <BrowserSettings />
      <section className="flex items-center justify-between gap-5 py-6">
        <div>
          <h2>Akun</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Kelola profil, keamanan akun, atau keluar.
          </p>
        </div>
        <div className="shrink-0">
          <UserButton />
        </div>
      </section>
      <section className="flex items-center justify-between gap-5 py-6">
        <div>
          <h2>Tampilan</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Pilih mode terang atau gelap pada perangkat ini.
          </p>
        </div>
        <ThemeToggle />
      </section>
      <section className="py-6">
        <h2>Penggunaan</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Lihat sisa pesan dan waktu kuota tersedia kembali.
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-4"
          onClick={() => onNavigate("usage")}
        >
          Lihat penggunaan <ChevronRight />
        </Button>
      </section>
      <section className="py-6">
        <h2>Identitas asisten</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Ubah profil dan cara asistenmu membantu melalui panel Identitas. Memory lintas percakapan
          sedang disiapkan.
        </p>
        <Button type="button" variant="outline" className="mt-4" onClick={onOpenAssistant}>
          Buka identitas <ChevronRight />
        </Button>
      </section>
    </div>
  );
}
