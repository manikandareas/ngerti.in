import { memo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export const Answer = memo(function Answer({ text }: { text: string }) {
  return (
    <div className="space-y-3 whitespace-normal break-words [&_p]:my-3 [&_p:first-child]:mt-0 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-4 [&_code]:font-mono [&_code]:text-sm [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_h1]:text-xl [&_h2]:text-lg [&_h3]:font-semibold [&_table]:block [&_table]:overflow-x-auto [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:p-2">
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-link underline underline-offset-2"
            >
              {children}
            </a>
          ),
          img: ({ alt }) => <span>{alt ?? "Image"}</span>,
        }}
      >
        {text}
      </Markdown>
    </div>
  );
});
