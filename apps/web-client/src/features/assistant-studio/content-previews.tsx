import { useEffect, useState } from "react";
import { Answer } from "@/features/conversation/components/answer";
import { FileActionChip } from "@/features/conversation/components/file-action-chip";
import { TimelineActivity } from "@/features/conversation/components/timeline-activity";
import type { ConversationPart } from "@/types/workspace";
import { sampleFiles, samplePart, sources } from "./fixtures";
import { AssistantRow, type OpenSample, SampleAnswer } from "./preview-primitives";

const fence = String.fromCharCode(96).repeat(3);
const answerText: Record<string, string> = {
  plain: "Checklist impor sudah siap. Mulai dengan memeriksa header, harga, dan jumlah stok.",
  markdown:
    "Checklist ini membantu **staf operasional** menyiapkan katalog.\n\n1. Cocokkan kolom dengan template.\n2. Periksa harga dan jumlah stok.\n3. Buka pratinjau sebelum impor.\n\n> Simpan salinan sumber sebelum melakukan perubahan.\n\nBaca [dokumentasi Python csv](https://docs.python.org/3/library/csv.html), lalu buka [panduan-csv.md](ngertiin://file/studio-guide).",
  code:
    "Gunakan nama kolom berikut ketika membaca katalog:\n\n" +
    fence +
    "python\nimport csv\n\nwith open('contoh-produk.csv', newline='', encoding='utf-8') as file:\n    products = list(csv.DictReader(file))\n    print(f'{len(products)} produk')\n" +
    fence,
  table:
    "Tiga produk contoh siap diperiksa.\n\n| Produk | Harga satuan | Jumlah |\n| --- | ---: | ---: |\n| Buku Tulis Pelangi | Rp12.000 | 20 |\n| Sabun Melati | Rp8.500 | 15 |\n| Teh Pagi 100 gram | Rp15.000 | 10 |",
  streaming:
    "Saya sudah memeriksa struktur katalog. Ketiga kolom tersedia dan ketiga baris produk dapat dibaca. Selanjutnya, cocokkan harga dan stok dengan catatan sumber sebelum memulai impor.",
};

export function AnswerPreview({
  variant,
  group,
  open,
}: {
  variant: string;
  group: boolean;
  open: OpenSample;
}) {
  const full = answerText[variant] ?? answerText.plain;
  const [length, setLength] = useState(0);
  useEffect(() => {
    if (variant !== "streaming") return;
    const timer = setInterval(
      () =>
        setLength((value) => {
          const next = Math.min(full.length, value + 4);
          if (next === full.length) clearInterval(timer);
          return next;
        }),
      50,
    );
    return () => clearInterval(timer);
  }, [variant, full]);
  return (
    <AssistantRow group={group} open={open}>
      <SampleAnswer
        text={variant === "streaming" ? full.slice(0, length) : full}
        streaming={variant === "streaming" && length < full.length}
        group={group}
        open={open}
      />
    </AssistantRow>
  );
}

export function FilesPreview({
  variant,
  group,
  open,
}: {
  variant: string;
  group: boolean;
  open: OpenSample;
}) {
  const file = sampleFiles[variant === "csv" ? 1 : 0];
  const text =
    variant === "missing"
      ? "Buka [laporan-lama.md](ngertiin://file/studio-missing)."
      : variant === "attached"
        ? "Kedua file sudah diterbitkan sebagai lampiran percakapan."
        : variant === "inline"
          ? "File hasil: [panduan-csv.md](ngertiin://file/studio-guide) dan [contoh-produk.csv](ngertiin://file/studio-csv)."
          : `Silakan periksa [${file.name}](ngertiin://file/${file.id}).`;
  return (
    <AssistantRow group={group} open={open}>
      <SampleAnswer text={text} group={group} open={open} />
      {variant === "attached" && (
        <div className="flex flex-wrap gap-2">
          {sampleFiles.map((item) => (
            <FileActionChip
              key={item.id}
              name={item.name}
              mediaType={item.mediaType}
              open={() => open("files", item.id)}
            />
          ))}
        </div>
      )}
    </AssistantRow>
  );
}

export function SourcesPreview({
  variant,
  group,
  open,
}: {
  variant: string;
  group: boolean;
  open: OpenSample;
}) {
  return (
    <AssistantRow group={group} open={open}>
      <Answer
        sources={variant === "single" ? sources.slice(0, 1) : sources}
        text="Header dan delimiter sudah saya periksa berdasarkan [dokumentasi Python csv](https://docs.python.org/3/library/csv.html). Nilai angka tetap perlu divalidasi sebelum impor."
      />
    </AssistantRow>
  );
}

export function TimelinePreview({ variant, open }: { variant: string; open: OpenSample }) {
  const parts =
    variant === "batch"
      ? [
          samplePart("goal_created", 1),
          { ...samplePart("goal_created", 2), name: "Periksa kualitas data" },
        ]
      : [samplePart(variant as ConversationPart["kind"])];
  return <TimelineActivity parts={parts} open={open} />;
}
