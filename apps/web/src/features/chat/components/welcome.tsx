import { Lightbulb, Pencil, Sparkles } from "lucide-react";
import { Mascot } from "@/components/mascot/mascot";
import { Button } from "@/components/ui/button";

const suggestions = [
  {
    icon: Pencil,
    label: "Tulis pesan singkat",
    prompt:
      "Bantu aku menulis pesan singkat untuk menjadwalkan ulang pertemuan besok. Gunakan bahasa yang sopan.",
  },
  {
    icon: Lightbulb,
    label: "Bandingkan pilihan",
    prompt:
      "Bandingkan daftar harian dan blok waktu untuk mengatur pekerjaan. Beri contoh kapan masing-masing cocok.",
  },
  {
    icon: Sparkles,
    label: "Susun rencana",
    prompt: "Bantu aku menyusun rencana 30 menit untuk merapikan pekerjaan hari ini.",
  },
];

export function Welcome({
  choose,
  hasDraft,
}: {
  choose: (text: string) => void;
  hasDraft: boolean;
}) {
  return (
    <section className="mx-auto flex w-full flex-col items-center text-center min-[701px]:pb-12">
      <Mascot className="mb-5 size-20 min-[701px]:size-28" face="happy" />
      <h1 className="text-2xl font-extrabold min-[701px]:text-[28px]">
        Mulai dari satu hal kecil.
      </h1>
      <p className="mt-3 max-w-sm text-sm text-muted-foreground">
        {hasDraft
          ? "Lanjutkan idemu di bawah. Kirim saat kamu sudah siap."
          : "Pilih contoh untuk diedit, atau tulis permintaanmu sendiri."}
      </p>
      <div className="mt-6 flex flex-col items-center justify-center gap-2 min-[701px]:flex-row min-[701px]:flex-wrap">
        {suggestions.map(({ icon: Icon, label, prompt }) => (
          <Button
            key={label}
            variant="outline"
            className="min-h-11 h-auto max-w-full rounded-full bg-card px-4 py-2 text-xs whitespace-normal"
            disabled={hasDraft}
            onClick={() => choose(prompt)}
          >
            <Icon className="size-3.5" />
            {label}
          </Button>
        ))}
      </div>
      <p className="mt-5 text-xs text-muted-foreground">
        Percakapanmu bisa dibuka kembali dari riwayat chat.
      </p>
    </section>
  );
}
