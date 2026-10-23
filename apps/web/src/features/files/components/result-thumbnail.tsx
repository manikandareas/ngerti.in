import { useAuth } from "@clerk/tanstack-react-start";
import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { fileContent } from "../api";
import { staticHtml } from "../static-html";
import type { ResultFile } from "../types";

export function ResultThumbnail({ file }: { file?: ResultFile }) {
  const { getToken, userId } = useAuth();
  const supported =
    file?.content_type.startsWith("text/") || file?.content_type === "application/json";
  const preview = useQuery({
    queryKey: ["result-thumbnail", userId, file?.revision_id],
    enabled: Boolean(userId && file && supported),
    staleTime: 60_000,
    retry: false,
    queryFn: async ({ signal }) => {
      if (!file) return "";
      const blob = await fileContent(file.revision_id, await getToken(), signal);
      return (await blob.text()).slice(0, 200_000);
    },
  });
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none relative block aspect-[1.8] overflow-hidden rounded-[16px] bg-background"
    >
      {preview.data ? (
        file?.content_type === "text/html" ? (
          <iframe
            title={`Pratinjau ${file.filename}`}
            tabIndex={-1}
            sandbox=""
            referrerPolicy="no-referrer"
            srcDoc={staticHtml(preview.data)}
            className="h-[200%] w-[200%] origin-top-left scale-50 border-0 bg-white"
          />
        ) : (
          <span className="block h-full overflow-hidden p-6 text-left font-mono text-[10px] leading-relaxed whitespace-pre-wrap wrap-anywhere text-foreground">
            {preview.data.slice(0, 5000)}
          </span>
        )
      ) : (
        <span className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
          <FileText className="size-12 stroke-1" />
          <span className="text-xs">
            {supported && preview.isPending ? "Menyiapkan preview…" : "Buka untuk melihat hasil"}
          </span>
        </span>
      )}
    </span>
  );
}
