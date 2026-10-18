import { useId } from "react";
import { Textarea } from "@/components/ui/textarea";
import { TaskOutputDownload } from "@/features/tasks/components/task-output-download";
import { readFileDraft } from "../types";

export function FileDraft({
  value,
  onChange,
  taskId,
}: {
  value: string;
  onChange?: (value: string) => void;
  taskId?: string;
}) {
  const id = useId();
  const draft = readFileDraft(value);
  if (!draft)
    return (
      <p className="text-sm text-muted-foreground">
        Berkas belum lengkap. Bagian draft yang diterima tetap tersimpan.
      </p>
    );
  return (
    <div className="space-y-4">
      {onChange ? (
        <label htmlFor={id} className="block space-y-2 text-sm">
          Ringkasan
          <Textarea
            id={id}
            value={draft.summary}
            onChange={(event) =>
              onChange(JSON.stringify({ ...draft, summary: event.target.value }))
            }
          />
        </label>
      ) : (
        <p className="text-sm">{draft.summary}</p>
      )}
      {draft.files.map((file, index) => (
        <div key={file.filename} className="space-y-2 rounded-xl border p-3">
          <p className="text-sm font-bold wrap-anywhere">{file.filename}</p>
          {onChange && !file.staged_output_id ? (
            <Textarea
              aria-label={`Isi ${file.filename}`}
              value={file.content ?? ""}
              className="min-h-52 font-mono text-sm"
              onChange={(event) =>
                onChange(
                  JSON.stringify({
                    ...draft,
                    files: draft.files.map((v, n) =>
                      n === index ? { ...v, content: event.target.value } : v,
                    ),
                  }),
                )
              }
            />
          ) : (
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-sm">
              {file.content ?? file.preview}
            </pre>
          )}
          {file.staged_output_id && taskId ? (
            <>
              <p className="text-xs text-muted-foreground">
                Cuplikan awal berkas. Unduh untuk memeriksa seluruh isi. Isi hasil komputasi tetap;
                ringkasan dapat diedit.
              </p>
              <TaskOutputDownload
                taskId={taskId}
                outputId={file.staged_output_id}
                filename={file.filename}
              />
            </>
          ) : null}
        </div>
      ))}
    </div>
  );
}
