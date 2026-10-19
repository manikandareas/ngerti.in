import { Brain, CalendarClock, ListTodo, Monitor, Target } from "lucide-react";

const capabilities = [
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
          <Monitor className="size-5" /> Browser pribadi sudah tersedia
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Pilih Gunakan browser pribadi saat membuat Task. Buka Lihat komputer untuk melihat
          pekerjaan, ambil alih untuk login, lalu kembalikan kendali ke Gwen. Login dapat digunakan
          kembali oleh Task berikutnya; aksi klik dan ketik tetap meminta persetujuanmu.
        </p>
      </section>
      <section className="rounded-2xl border p-5">
        <h2 className="flex items-center gap-3">
          <ListTodo className="size-5" /> Task dan file sudah tersedia
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Minta Gwen menulis, merangkum, atau menyusun rencana di background. Ikuti progres dari
          menu Task, lanjutkan chat, lalu tinjau draft bila diperlukan. Lampirkan PDF, gambar, teks,
          CSV atau JSON dan buka kembali berkas hasil dari menu File & hasil. Aktifkan pengolahan
          Python pada Task untuk menghitung dan mengolah data tanpa akses internet.
        </p>
      </section>
      <section aria-labelledby="upcoming-heading">
        <div className="mb-8 rounded-2xl border p-5">
          <h2 className="flex items-center gap-3">
            <CalendarClock className="size-5" /> Jadwal sudah tersedia
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Minta Gwen membuat atau mengubah jadwal melalui chat, atau buka menu Jadwal. Tinjau
            waktu, instruksi dan batas kerja sebelum mengaktifkan. Hasil tetap tersimpan saat
            browser ditutup.
          </p>
        </div>
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
