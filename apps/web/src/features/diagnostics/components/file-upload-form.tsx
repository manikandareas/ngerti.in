import { Upload } from "lucide-react";
import type { Ref } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface FileUploadFormProps {
  inputRef: Ref<HTMLInputElement>;
  file: File | null;
  uploading: boolean;
  onFileChange: (file: File | null) => void;
  onSelectExample: () => void;
  onUpload: () => void;
}

export function FileUploadForm({
  inputRef,
  file,
  uploading,
  onFileChange,
  onSelectExample,
  onUpload,
}: FileUploadFormProps) {
  return (
    <form
      className="grid items-center gap-2.5 py-6 min-[701px]:grid-cols-[1fr_auto] [&_label]:col-span-full [&_label]:text-xs [&_label]:font-bold [&_input]:min-w-0 [&_input]:text-xs"
      onSubmit={(event) => {
        event.preventDefault();
        onUpload();
      }}
    >
      <label htmlFor="diagnostic-upload">Pilih file · maksimum 5 MB</label>
      <Input
        id="diagnostic-upload"
        ref={inputRef}
        type="file"
        onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
      />
      <Button type="button" variant="outline" onClick={onSelectExample}>
        Gunakan file contoh
      </Button>
      {file ? (
        <span className="text-[13px] text-muted-foreground">Dipilih: {file.name}</span>
      ) : null}
      <Button type="submit" variant="outline" disabled={!file || uploading}>
        <Upload size={16} />
        {uploading ? "Mengunggah…" : "Upload file"}
      </Button>
    </form>
  );
}
