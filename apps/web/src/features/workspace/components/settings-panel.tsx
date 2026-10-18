import { UserButton } from "@clerk/tanstack-react-start";
import { ChevronRight } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import type { WorkspaceView } from "@/features/workspace/types";

export function SettingsPanel({ onNavigate }: { onNavigate: (view: WorkspaceView) => void }) {
  return (
    <div className="divide-y border-y">
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
        <h2>Persona & memory</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Pengaturan preferensi dan memory lintas percakapan belum tersedia. Kamu tetap bisa memberi
          arahan dalam chat yang sedang dibuka.
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-4"
          onClick={() => onNavigate("capabilities")}
        >
          Lihat kemampuan Gwen <ChevronRight />
        </Button>
      </section>
    </div>
  );
}
