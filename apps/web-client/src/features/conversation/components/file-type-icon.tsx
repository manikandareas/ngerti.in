import { File02Icon, Image01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

export function FileTypeIcon({
  name,
  mediaType,
  className,
}: {
  name: string;
  mediaType?: string;
  className?: string;
}) {
  const extension = /\.([a-z0-9]{1,8})$/i.exec(name)?.[1].toLowerCase();
  const type =
    mediaType === "application/pdf" || extension === "pdf"
      ? "PDF"
      : ["csv", "xlsx", "xls", "tsv"].includes(extension ?? "")
        ? extension?.toUpperCase()
        : ["doc", "docx"].includes(extension ?? "")
          ? "DOC"
          : ["md", "txt", "json"].includes(extension ?? "")
            ? extension?.toUpperCase()
            : null;
  if (!type)
    return (
      <HugeiconsIcon
        icon={mediaType?.startsWith("image/") ? Image01Icon : File02Icon}
        size={17}
        className={className}
        aria-hidden="true"
      />
    );
  const color =
    type === "PDF"
      ? "#bb3941"
      : ["CSV", "XLSX", "XLS", "TSV"].includes(type)
        ? "#28764e"
        : type === "DOC"
          ? "#316ab3"
          : "#5b6572";
  return (
    <svg
      viewBox="0 0 22 26"
      className={className}
      width="17"
      height="20"
      aria-hidden="true"
      data-file-type={type}
    >
      <path d="M4 1h9l6 6v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2Z" fill={color} />
      <path d="M13 1v6h6" fill="#ffffff66" />
      <text
        x="10.5"
        y="18"
        fill="white"
        fontFamily="Arial,sans-serif"
        textAnchor="middle"
        fontSize={type.length > 3 ? "5.5" : "6.5"}
        fontWeight="700"
      >
        {type}
      </text>
    </svg>
  );
}
