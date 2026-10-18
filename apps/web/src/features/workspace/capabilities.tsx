import { Brain, CalendarClock, FolderOpen, ListTodo, Monitor, Target } from "lucide-react";

const capabilities = [
  {
    name: "Hasil",
    icon: FolderOpen,
    description: "Temukan file dan hasil pekerjaan untuk dibuka kembali atau diunduh.",
  },
  {
    name: "Jadwal",
    icon: CalendarClock,
    description: "Atur pekerjaan sekali atau berulang, termasuk saat kamu sedang offline.",
  },
  {
    name: "Goals",
    icon: Target,
    description: "Simpan tujuan dan lihat perkembangannya dari hasil pekerjaan yang nyata.",
  },
  {
    name: "Persona & memory",
    icon: Brain,
    description: "Tinjau dan koreksi preferensi yang digunakan Gwen lintas percakapan.",
  },
  {
    name: "Komputer",
    icon: Monitor,
    description:
      "Lihat komputer pada pekerjaan yang berjalan, ambil alih, lalu kembalikan kendali ke Gwen.",
  },
];

export function Capabilities() {
  return (
    <div className="space-y-8">
      <section className="rounded-2xl bg-secondary p-5">
        <p className="font-bold">Kamu sudah bisa mulai dari chat.</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Minta bantuan menulis, membandingkan pilihan, atau menyusun rencana. Main chat dan side
          chat bisa kamu buka kembali kapan saja.
        </p>
      </section>
      <section className="rounded-2xl border p-5">
        <h2 className="flex items-center gap-3">
          <ListTodo className="size-5" /> Task teks sudah tersedia
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Minta Gwen menulis, merangkum, atau menyusun rencana di background. Ikuti progres dari
          menu Task, lanjutkan chat, lalu tinjau draft bila diperlukan.
        </p>
      </section>
      <section aria-labelledby="upcoming-heading">
        <h2 id="upcoming-heading">Berikutnya untuk Gwen</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Kemampuan di bawah sedang disiapkan dan belum bisa digunakan.
        </p>
        <ul className="mt-4 divide-y border-y">
          {capabilities.map(({ name, icon: Icon, description }) => (
            <li key={name} className="flex gap-4 py-5">
              <Icon className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h3 className="text-sm">{name}</h3>
                  <span className="text-xs text-muted-foreground">Belum tersedia</span>
                </div>
                <p className="mt-2 max-w-prose text-sm text-muted-foreground">{description}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
