import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

const labels: Record<string, string> = {
  path: "File",
  file_path: "File",
  base64: "Isi file",
  content: "Isi",
  text: "Teks",
  command: "Perintah",
  arguments: "Rincian",
  tool: "Tindakan",
  connection_id: "Koneksi",
  to: "Kepada",
  recipients: "Penerima",
  subject: "Subjek",
  body: "Pesan",
  message: "Pesan",
  url: "Tautan",
  name: "Nama",
  title: "Judul",
  description: "Keterangan",
  amount: "Jumlah",
  currency: "Mata uang",
};
function labelFor(key: string) {
  return labels[key] ?? key.replaceAll("_", " ").replace(/^./, (value) => value.toUpperCase());
}
function readableFile(value: string) {
  if (value.length > 65_536) return "Konten file terlalu besar untuk pratinjau ini.";
  try {
    const bytes = Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return bytes.some(
      (byte) => (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) || byte === 127,
    )
      ? `File biner · ${bytes.length.toLocaleString("id-ID")} byte`
      : text;
  } catch {
    return "Konten file tidak dapat dipratinjau.";
  }
}
function DetailValue({
  value,
  field = "",
  depth = 0,
}: {
  value: unknown;
  field?: string;
  depth?: number;
}) {
  if (field === "base64" && typeof value === "string")
    return <p className="approval-detail-text">{readableFile(value)}</p>;
  if (value === null || value === undefined)
    return <span className="text-muted-foreground">—</span>;
  if (typeof value !== "object")
    return (
      <p className="approval-detail-text">
        {typeof value === "boolean" ? (value ? "Ya" : "Tidak") : String(value)}
      </p>
    );
  if (depth >= 4)
    return <pre className="approval-detail-text">{JSON.stringify(value, null, 2)}</pre>;
  if (Array.isArray(value))
    return (
      <ul className="approval-detail-list">
        {value.map((item, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: approval array positions are immutable and contain no local state.
          <li key={`${field}-${index}`}>
            <DetailValue value={item} depth={depth + 1} />
          </li>
        ))}
      </ul>
    );
  return (
    <dl className="approval-detail-fields">
      {Object.entries(value)
        .filter(([key]) => key !== "command_id")
        .map(([key, item]) => (
          <div key={key}>
            <dt>{labelFor(key)}</dt>
            <dd>
              <DetailValue value={item} field={key} depth={depth + 1} />
            </dd>
          </div>
        ))}
    </dl>
  );
}

/** Always-visible, bounded approval data with overflow-aware edge shadows. */
export function ApprovalDetails({ values }: { values: Record<string, unknown> }) {
  const hasValues = Object.keys(values).some((key) => key !== "command_id");
  const viewport = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ top: false, bottom: false });
  const update = useCallback(() => {
    const node = viewport.current;
    if (!node) return;
    const top = node.scrollTop > 1;
    const bottom = node.scrollTop + node.clientHeight < node.scrollHeight - 1;
    setEdges((previous) =>
      previous.top === top && previous.bottom === bottom ? previous : { top, bottom },
    );
  }, []);
  useEffect(() => {
    if (!hasValues) return;
    const node = viewport.current;
    if (!node) return;
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    if (node.firstElementChild) observer.observe(node.firstElementChild);
    return () => observer.disconnect();
  }, [update, hasValues]);
  if (!hasValues) return null;
  return (
    <div
      className="approval-details-frame"
      data-shadow-top={edges.top}
      data-shadow-bottom={edges.bottom}
    >
      <ScrollArea
        className="approval-details-scroll"
        viewportProps={{
          ref: viewport,
          tabIndex: 0,
          "aria-label": "Rincian tindakan",
          role: "region",
          onScroll: update,
        }}
      >
        <div className="approval-details-content">
          <DetailValue value={values} />
        </div>
      </ScrollArea>
      <div className="approval-details-shadow approval-details-shadow-top" aria-hidden="true" />
      <div className="approval-details-shadow approval-details-shadow-bottom" aria-hidden="true" />
    </div>
  );
}
