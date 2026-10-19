import { useId, useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useMemoryCommands, useMemoryHistory } from "@/features/memory/hooks/use-memory";
import type { MemoryEntry as Entry } from "@/features/memory/types";

const kinds = { fact: "Fakta", preference: "Preferensi", observation: "Pengamatan" };

export function MemoryEntry({
  entry,
  onMessage,
}: {
  entry: Entry;
  onMessage: (value: string) => void;
}) {
  const command = useMemoryCommands();
  const formId = useId();
  const [draft, setDraft] = useState<{ text: string; base: number } | null>(null);
  const [change, setChange] = useState<"correction" | "change">("correction");
  const [showHistory, setShowHistory] = useState(false);
  const [forgetOpen, setForgetOpen] = useState(false);
  const [forgetBase, setForgetBase] = useState(entry.revision);
  const history = useMemoryHistory(entry.id, showHistory);
  const stale = draft !== null && draft.base !== entry.revision;

  async function save() {
    if (!draft) return;
    const result = await command.send(`/${entry.id}/edit`, {
      expected_revision: draft.base,
      statement: draft.text.trim(),
      kind: entry.kind,
      change,
    });
    if (result) {
      setDraft(null);
      onMessage("Perubahan ingatan tersimpan.");
    }
  }

  async function forget() {
    const result = await command.send(`/${entry.id}/forget`, { expected_revision: forgetBase });
    if (result) {
      setForgetOpen(false);
      setDraft(null);
      onMessage(
        "Ingatan tidak lagi digunakan. Pembersihan salinan pencarian diproses di latar belakang.",
      );
    }
  }

  return (
    <article className="space-y-3 py-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{kinds[entry.kind]}</Badge>
        {entry.status === "candidate" ? (
          <Badge variant="outline">Perlu ditinjau</Badge>
        ) : !entry.usable ? (
          <Badge variant="outline">Sumber tidak tersedia</Badge>
        ) : null}
        <span className="text-xs text-muted-foreground">Versi {entry.revision}</span>
      </div>
      {draft ? (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label htmlFor={formId} className="block text-sm font-medium">
            Isi ingatan
          </label>
          <Textarea
            id={formId}
            value={draft.text}
            required
            minLength={3}
            maxLength={500}
            rows={4}
            onChange={(event) => setDraft({ ...draft, text: event.target.value })}
            disabled={command.pending}
          />
          <label htmlFor={`${formId}-change`} className="block text-sm font-medium">
            Jenis perubahan
          </label>
          <Select
            value={change}
            onValueChange={(value) => setChange(value as typeof change)}
            disabled={command.pending}
          >
            <SelectTrigger id={`${formId}-change`} className="w-full min-h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="correction">Koreksi informasi yang salah</SelectItem>
              <SelectItem value="change">Informasi saya sudah berubah</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {change === "change"
              ? "Versi sebelumnya tetap dicatat sebagai informasi historis."
              : "Versi yang salah tidak lagi dipakai sebagai fakta."}
          </p>
          {stale ? (
            <p role="alert" className="text-sm text-destructive">
              Ingatan berubah di tempat lain. Salin draftmu bila diperlukan, lalu buka versi
              terbaru.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              disabled={command.pending || stale || draft.text.trim().length < 3}
            >
              {command.pending ? "Menyimpan…" : "Simpan perubahan"}
            </Button>
            <Button
              variant="outline"
              type="button"
              disabled={command.pending}
              onClick={() => setDraft(null)}
            >
              Batal
            </Button>
          </div>
        </form>
      ) : (
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{entry.statement}</p>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer rounded py-2 text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Lihat sumber
        </summary>
        <div className="space-y-3 pt-2">
          {entry.evidence.map((source) => (
            <div key={source.id} className="border-l-2 pl-3">
              <p className="text-xs text-muted-foreground">
                {source.source_label ??
                  {
                    message: "Pesan percakapan",
                    file: "File",
                    result: "Hasil tersimpan",
                    editor: "Koreksi langsung olehmu",
                  }[source.source_kind]}{" "}
                · {new Date(source.created_at).toLocaleDateString("id-ID")}
              </p>
              {source.anchor ? (
                <blockquote className="mt-1 whitespace-pre-wrap break-words">
                  {source.anchor}
                </blockquote>
              ) : null}
              {!source.available ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Sumber ini sudah tidak tersedia.
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </details>
      <div className="flex flex-wrap gap-2">
        {!draft ? (
          <Button
            size="sm"
            className="min-h-11"
            variant="outline"
            onClick={() => {
              setDraft({ text: entry.statement, base: entry.revision });
              onMessage("");
            }}
          >
            Edit
          </Button>
        ) : null}
        <Button
          size="sm"
          className="min-h-11"
          variant="ghost"
          onClick={() => setShowHistory(!showHistory)}
          aria-expanded={showHistory}
        >
          Riwayat
        </Button>
        <AlertDialog
          open={forgetOpen}
          onOpenChange={(open) => {
            setForgetOpen(open);
            if (open) setForgetBase(entry.revision);
          }}
        >
          <AlertDialogTrigger asChild>
            <Button size="sm" className="min-h-11 text-destructive" variant="ghost">
              Lupakan
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Lupakan ingatan ini?</AlertDialogTitle>
              <AlertDialogDescription>
                Ingatan ini tidak lagi digunakan dan tidak akan diaktifkan kembali dari sumber
                lamanya. Pesan dan file asli tetap ada.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {command.error ? (
              <p role="alert" className="text-sm text-destructive">
                {command.error}
              </p>
            ) : null}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={command.pending}>Batal</AlertDialogCancel>
              <Button
                variant="destructive"
                disabled={command.pending}
                onClick={() => void forget()}
              >
                {command.pending ? "Melupakan…" : "Lupakan ingatan"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {!forgetOpen && command.error ? (
        <p role="alert" className="text-sm text-destructive">
          {command.error}
        </p>
      ) : null}
      {showHistory ? (
        <div className="space-y-3 rounded-lg border p-3 text-sm">
          {history.isPending ? <p role="status">Memuat riwayat…</p> : null}
          {history.isError ? (
            <div role="alert">
              <p>Riwayat belum dapat dimuat.</p>
              <Button size="sm" variant="outline" onClick={() => void history.refetch()}>
                Coba lagi
              </Button>
            </div>
          ) : null}
          {history.data?.revisions.map((row) => (
            <div key={row.id}>
              <p className="text-xs text-muted-foreground">
                Versi {row.revision} ·{" "}
                {row.status === "historical"
                  ? "Sebelumnya berlaku"
                  : row.status === "corrected"
                    ? "Dikoreksi"
                    : row.status === "active"
                      ? "Aktif"
                      : "Tidak aktif"}
              </p>
              <p className="mt-1 break-words">{row.statement ?? "Isi telah dilupakan."}</p>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}
