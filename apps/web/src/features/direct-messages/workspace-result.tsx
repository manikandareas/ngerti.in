const labels: Record<string, string> = {
  project: "Proyek",
  root: "Folder proyek",
  hashes: "Versi file",
  checkpoints: "Checkpoint",
  worktrees: "Ruang kerja tugas",
  instructions: "Petunjuk proyek",
  path: "File",
  content: "Isi",
  diff: "Perubahan kode",
  diagnostics: "Diagnostik",
  message: "Keterangan",
  error: "Kesalahan",
  status: "Status",
  reason: "Keterangan",
  hash: "Versi",
  short_hash: "Versi singkat",
  active: "Aktif",
  removed: "Dihapus",
  restored: "Dipulihkan",
  skipped: "Dilewati",
};

/** Keep every returned field inspectable without exposing a raw JSON response. */
export function WorkspaceResult({ value }: { value: unknown }) {
  if (value === null || value === undefined)
    return <span className="text-muted-foreground">—</span>;
  if (typeof value === "boolean") return <span>{value ? "Ya" : "Tidak"}</span>;
  if (typeof value !== "object")
    return (
      <p className="max-h-80 overflow-auto whitespace-pre-wrap break-all font-mono text-xs leading-relaxed">
        {String(value)}
      </p>
    );
  if (Array.isArray(value))
    return value.length ? (
      <ul className="space-y-3">
        {value.map((item, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: Immutable response rows have no local state or stable domain ID.
          <li key={index} className="rounded-lg bg-muted/50 p-3">
            <WorkspaceResult value={item} />
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-xs text-muted-foreground">Belum ada hasil.</p>
    );
  return (
    <dl className="space-y-3">
      {Object.entries(value).map(([key, item]) => (
        <div key={key} className="min-w-0 border-b border-border/60 pb-3 last:border-0">
          <dt className="mb-1 text-xs font-medium text-muted-foreground">
            {labels[key] ?? key.replaceAll("_", " ")}
          </dt>
          <dd className="min-w-0">
            <WorkspaceResult value={item} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
