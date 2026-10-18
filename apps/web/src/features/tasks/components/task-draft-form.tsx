import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FileDraft } from "@/features/files/components/file-draft";

interface TaskDraftFormProps {
  taskId: string;
  draft: string;
  pending: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  structured?: boolean;
}

export function TaskDraftForm({
  taskId,
  draft,
  pending,
  onChange,
  onSave,
  onCancel,
  structured = false,
}: TaskDraftFormProps) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
      className="space-y-3"
    >
      <label className="block text-sm font-bold" htmlFor={`draft-${taskId}`}>
        Ubah isi draft
      </label>
      {structured ? (
        <FileDraft value={draft} onChange={onChange} taskId={taskId} />
      ) : (
        <Textarea
          id={`draft-${taskId}`}
          value={draft}
          onChange={(event) => onChange(event.target.value)}
          maxLength={24000}
          className="min-h-64"
        />
      )}
      <p className="text-xs text-muted-foreground">
        Menyimpan perubahan membuat versi baru. Persetujuan versi sebelumnya tidak berlaku.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending || !draft.trim()}>
          Simpan versi baru
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Batal edit
        </Button>
      </div>
    </form>
  );
}
