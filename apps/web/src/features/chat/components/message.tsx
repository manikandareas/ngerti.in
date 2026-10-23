import { code } from "@streamdown/code";
import { createMathPlugin } from "@streamdown/math";
import { Check, Copy, Reply } from "lucide-react";
import { memo, useState } from "react";
import { Streamdown } from "streamdown";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/features/chat/types";
import { ResultCard } from "@/features/files/components/result-card";
import { ResourceSearchCards } from "@/features/library/components/resource-card";
import { cn } from "@/lib/utils";

const plugins = { code, math: createMathPlugin({ singleDollarTextMath: true }) };

export const Message = memo(function Message({
  message,
  onReply,
}: {
  message: ChatMessage;
  onReply?: (text: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const active = message.status === "running";
  const textParts = message.parts.filter((part) => part.type === "text" && part.text?.trim());
  const pending = ["queued", "running"].includes(message.status);
  const text = textParts.map((part) => part.text ?? "").join("\n");
  const proactive = message.parts.find((part) => part.type === "proactive");
  const results = message.parts.filter((part) => part.type === "result" && part.result_id);
  const searches = message.parts.filter((part) => part.type === "resources");
  if (
    !text &&
    !searches.length &&
    !results.length &&
    message.role !== "user" &&
    !pending &&
    message.status !== "cancelled"
  )
    return null;
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  const actions =
    text && !active ? (
      <div
        className={cn(
          "absolute top-1/2 flex -translate-y-1/2 flex-col items-center gap-1 opacity-100 transition-opacity min-[701px]:flex-row [@media(hover:hover)]:opacity-0 group-hover/message:opacity-100 group-focus-within/message:opacity-100 motion-reduce:transition-none",
          message.role === "user" ? "right-full pr-2" : "left-full pl-2",
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={copy}
          aria-label={copied ? "Pesan tersalin" : "Salin pesan"}
          className={cn("text-muted-foreground", copied && "text-foreground")}
        >
          {copied ? <Check /> : <Copy />}
        </Button>
        {onReply ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Balas pesan"
            onClick={() => onReply(text)}
          >
            <Reply />
          </Button>
        ) : null}
      </div>
    ) : null;
  if (message.role === "user") {
    return (
      <article
        aria-label="Pesan kamu"
        className="group/message relative ml-auto w-fit max-w-[calc(100%-44px)] rounded-3xl bg-muted px-[18px] py-3 text-[15px] leading-normal whitespace-pre-wrap wrap-anywhere min-[701px]:max-w-[calc(100%-80px)] min-[701px]:text-base"
      >
        {text}
        {message.parts
          .filter((part) => part.type === "file")
          .map((part) => (
            <p key={part.id} className="mt-2 text-xs text-muted-foreground">
              Lampiran: {part.filename} · v{part.revision}
            </p>
          ))}
        {actions}
      </article>
    );
  }
  return (
    <article
      className="group/message relative w-fit min-w-0 max-w-[calc(100%-44px)] min-[701px]:max-w-[calc(100%-80px)]"
      aria-label="Jawaban Gwen"
    >
      {results.map((part) => (
        <div key={part.id} className="mb-3 w-[320px] max-w-full">
          <ResultCard resultId={part.result_id ?? ""} />
        </div>
      ))}
      {text || pending || message.status === "cancelled" || proactive ? (
        <div className="relative min-w-0 rounded-3xl bg-card px-[18px] py-3 text-[15px] leading-normal min-[701px]:text-base">
          {proactive ? (
            <p className="mb-2 text-xs text-muted-foreground">
              Saran Gwen
              {proactive.created_at ? ` · ${new Date(proactive.created_at).toLocaleString()}` : ""}
            </p>
          ) : null}
          {textParts.map((part) => (
            <div
              className="wrap-anywhere [&_p]:leading-normal [&>div>:first-child]:mt-0 [&>div>:last-child]:mb-0 [&_h1]:text-2xl [&_h2]:text-xl [&_h1]:font-extrabold [&_h2]:font-extrabold [&_h3]:font-extrabold [&_h1]:mt-5 [&_h2]:mt-5 [&_h3]:mt-5 [&_p]:my-3 [&_ul]:my-3 [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:pl-6 [&_pre]:max-w-full [&_pre]:overflow-auto [&_pre]:text-[13px]"
              key={part.id}
            >
              <Streamdown
                plugins={plugins}
                mode={active ? "streaming" : "static"}
                isAnimating={active}
                animated={{ animation: "fadeIn", duration: 140 }}
                controls={{ code: true, table: false }}
              >
                {part.text ?? ""}
              </Streamdown>
            </div>
          ))}
          {!text && pending ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="size-2 shrink-0 animate-pulse rounded-full bg-primary-edge motion-reduce:animate-none" />
              <span>Sebentar, Gwen sedang menyiapkan jawaban…</span>
            </div>
          ) : null}
          {message.status === "cancelled" ? (
            <p role="status" className="text-xs text-muted-foreground">
              Respons dihentikan. Bagian yang sudah diterima tetap tersimpan. Kamu bisa melanjutkan
              lewat pesan baru.
            </p>
          ) : null}
          {proactive?.why_relevant ? (
            <details className="mt-3 text-xs text-muted-foreground">
              <summary className="cursor-pointer py-1">Mengapa ini muncul?</summary>
              <p className="mt-2 wrap-anywhere">{proactive.why_relevant}</p>
              <p className="mt-2">
                Katakan “kurangi saran proaktif” atau atur saran di percakapan ini.
              </p>
            </details>
          ) : null}
          {actions}
        </div>
      ) : null}
      {searches.map((part) => (
        <ResourceSearchCards
          key={part.id}
          refs={part.refs ?? []}
          query={part.query}
          hasMore={part.has_more}
        />
      ))}
    </article>
  );
});
