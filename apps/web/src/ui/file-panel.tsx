import { useAuth } from "@clerk/tanstack-react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { api, type StoredObject } from "../lib/api";

export function FilePanel() {
  const { getToken } = useAuth();
  const client = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const files = useQuery({
    queryKey: ["files"],
    queryFn: async () => api<StoredObject[]>("/dev/objects", await getToken()),
    refetchInterval: 5000,
  });
  const upload = useMutation({
    mutationFn: async () => {
      if (!file || file.size === 0 || file.size > 5 * 1024 * 1024)
        throw new Error("Pilih file berukuran 1 byte sampai 5 MB.");
      const body = new FormData();
      body.append("file", file);
      return api("/dev/objects", await getToken(), { method: "POST", body });
    },
    onSuccess: () => {
      setFile(null);
      if (input.current) input.current.value = "";
      client.invalidateQueries({ queryKey: ["files"] });
    },
  });
  const remove = useMutation({
    mutationFn: async (id: string) =>
      api(`/dev/objects/${id}`, await getToken(), { method: "DELETE" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["files"] }),
  });
  const download = useMutation({
    mutationFn: async (id: string) => {
      const result = await api<{ url: string }>(`/dev/objects/${id}/download`, await getToken());
      window.location.assign(result.url);
    },
  });
  const error = upload.error || remove.error || download.error || files.error;
  return (
    <section className="diagnostic-panel">
      <div className="section-heading">
        <h2>
          <FileText size={18} />
          File milik akunmu
        </h2>
      </div>
      <p className="subtle">
        Coba upload, unduh dengan signed URL, lalu hapus. File dan artifact hanya terlihat oleh
        pemiliknya.
      </p>
      <form
        className="upload-controls"
        onSubmit={(event) => {
          event.preventDefault();
          upload.mutate();
        }}
      >
        <label htmlFor="diagnostic-upload">Pilih file · maksimum 5 MB</label>
        <input
          id="diagnostic-upload"
          ref={input}
          type="file"
          onChange={(event) => setFile(event.target.files?.[0] || null)}
        />
        <button
          type="button"
          className="button secondary"
          onClick={() => {
            if (input.current) input.current.value = "";
            setFile(
              new File(
                ["Ngertiin task #02: manual browser upload.\nDisposable development data.\n"],
                "foundation-example.txt",
                { type: "text/plain" },
              ),
            );
          }}
        >
          Gunakan file contoh
        </button>
        {file ? <span className="subtle">Dipilih: {file.name}</span> : null}
        <button type="submit" className="button secondary" disabled={!file || upload.isPending}>
          <Upload size={16} />
          {upload.isPending ? "Mengunggah…" : "Upload file"}
        </button>
      </form>
      {error ? (
        <p className="notice error" role="alert">
          {error.message}
        </p>
      ) : null}
      <div className="file-list" aria-live="polite">
        {files.data?.length ? (
          files.data.map((item) => (
            <article className="file-row" key={item.id}>
              <FileText size={20} />
              <div className="file-info">
                <strong title={item.filename}>{item.filename}</strong>
                <span>
                  {item.size < 1024 ? `${item.size} B` : `${(item.size / 1024).toFixed(1)} KB`}
                </span>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label={`Unduh ${item.filename}`}
                disabled={download.isPending}
                onClick={() => download.mutate(item.id)}
              >
                <Download size={17} />
              </button>
              <button
                className="icon-button danger"
                type="button"
                aria-label={`Hapus ${item.filename}`}
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm(`Hapus ${item.filename}?`)) remove.mutate(item.id);
                }}
              >
                <Trash2 size={17} />
              </button>
            </article>
          ))
        ) : (
          <p className="empty-note">
            File yang kamu upload dan hasil pekerjaan akan muncul di sini.
          </p>
        )}
      </div>
    </section>
  );
}
