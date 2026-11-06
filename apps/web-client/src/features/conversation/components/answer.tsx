import {
  Children,
  type CSSProperties,
  createContext,
  isValidElement,
  memo,
  type ReactNode,
  useContext,
  useMemo,
} from "react";
import Markdown, { type Components, defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { PluggableList } from "unified";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { AnswerCode } from "@/features/conversation/components/answer-code";
import { MarkdownTable, plainMarkdown } from "@/features/conversation/components/markdown-table";
import { MessageTime } from "@/features/conversation/components/message-time";
import { parseFenceInfo } from "@/features/conversation/lib/code-snippet";
import { splitReplyBlocks } from "@/features/conversation/lib/formatted-reply";
import { referenceFromUrl } from "@/features/conversation/lib/inline-references";
import {
  type MarkdownReferenceOptions,
  remarkInlineReferences,
} from "@/features/conversation/lib/remark-inline-references";
import { blockDirection } from "@/features/conversation/lib/text-direction";
import type { Snapshot } from "@/types/workspace";
import { useStreamingText } from "../lib/use-streaming-text";
import { InlineReferenceChip, useInlineReferences } from "./inline-references";
import { MessageActions } from "./message-actions";
import { type ResearchSource, ResearchSources, SourceCitation } from "./research-sources";

interface AnswerScope {
  agentId?: string;
  sources?: ResearchSource[];
  openResource?: (tab: "files" | "goals", id: string) => void;
  snapshot?: Snapshot;
}
const AnswerContext = createContext<AnswerScope>({});

function AnswerLink({ children, href }: { children?: ReactNode; href?: string }) {
  const { openResource, snapshot, sources } = useContext(AnswerContext);
  const reference = href ? referenceFromUrl(href, plainMarkdown(children)) : null;
  if (reference?.kind === "file") {
    const file = snapshot?.artifacts.find((file) => file.id === reference.id);
    return file ? (
      <InlineReferenceChip
        reference={{ ...reference, label: file.name }}
        onOpenFile={openResource ? () => openResource("files", file.id) : undefined}
      />
    ) : (
      <span className="text-muted-foreground">File tidak tersedia</span>
    );
  }
  if (reference) return <InlineReferenceChip reference={reference} />;
  const goal = snapshot?.goals.find((item) => href?.endsWith(`/${item.id}`));
  const artifact = snapshot?.artifacts.find((item) => href?.split("?")[0]?.endsWith(`/${item.id}`));
  if (openResource && (goal || artifact))
    return (
      <button
        type="button"
        className="text-link underline underline-offset-2"
        onClick={() => openResource(goal ? "goals" : "files", (goal ?? artifact)?.id ?? "")}
      >
        {children}
      </button>
    );
  if (!href) return <span>{children}</span>;
  const source = sources?.find((source) => source.url === href);
  if (source) return <SourceCitation source={source} />;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      dir="auto"
      className="text-link underline underline-offset-2"
    >
      {children}
    </a>
  );
}

// Static component identities preserve table sorting, code wrapping and focus during event updates.
const renderers: Components = {
  a: AnswerLink,
  img: ({ alt }) => <span>{alt ?? "Image"}</span>,
  table: ({ node, children }) => (
    <MarkdownTable direction={blockDirection(node)}>{children}</MarkdownTable>
  ),
  pre: ({ node, children }) => {
    const child = Children.toArray(children).find(isValidElement);
    const props = isValidElement<{ className?: string; children?: ReactNode }>(child)
      ? child.props
      : {};
    const info = parseFenceInfo(
      /language-([^\s]+)/.exec(props.className ?? "")?.[1] ?? "",
      (node?.children[0]?.data as { meta?: unknown } | undefined)?.meta,
    );
    return (
      <AnswerCode
        code={plainMarkdown(props.children).replace(/\n$/, "")}
        lang={info.lang}
        initialWrap={info.wrap}
      />
    );
  },
  code: ({ children }) => (
    <code
      dir="ltr"
      className="rounded bg-foreground/[0.08] px-[0.35em] py-[0.125em] font-mono text-[0.86em] leading-none break-words [box-decoration-break:clone] [unicode-bidi:isolate]"
    >
      {children}
    </code>
  ),
  p: ({ node, children }) => <p dir={blockDirection(node)}>{children}</p>,
  ul: ({ node, children }) => (
    <ul dir={blockDirection(node)} className="list-disc space-y-1 ps-5">
      {children}
    </ul>
  ),
  ol: ({ node, children }) => (
    <ol dir={blockDirection(node)} className="list-decimal space-y-1 ps-5">
      {children}
    </ol>
  ),
  h1: ({ node, children }) => (
    <h1 dir={blockDirection(node)} className="mt-3 text-[18px] font-semibold">
      {children}
    </h1>
  ),
  h2: ({ node, children }) => (
    <h2 dir={blockDirection(node)} className="mt-2 text-[16px] font-semibold">
      {children}
    </h2>
  ),
  h3: ({ node, children }) => (
    <h3 dir={blockDirection(node)} className="mt-1.5 font-semibold">
      {children}
    </h3>
  ),
  blockquote: ({ node, children }) => (
    <blockquote
      dir={blockDirection(node)}
      className="border-s-2 border-border ps-3 text-muted-foreground"
    >
      {children}
    </blockquote>
  ),
  hr: () => <hr className="border-border/40" />,
};

interface MarkdownTextProps {
  text: string;
  references?: MarkdownReferenceOptions;
}

const MarkdownText = memo(
  function MarkdownText({ text, references }: MarkdownTextProps) {
    const plugins = useMemo<PluggableList>(
      () => (references ? [remarkGfm, [remarkInlineReferences, references]] : [remarkGfm]),
      [references],
    );
    return (
      <div
        data-message-text
        className="chat-answer chat-md min-w-0 whitespace-normal break-words text-[15px] leading-[22px] [&>*+*]:mt-2.5 [&_strong]:font-semibold"
      >
        <Markdown
          remarkPlugins={plugins}
          urlTransform={(url) => (referenceFromUrl(url, "") ? url : defaultUrlTransform(url))}
          skipHtml
          components={renderers}
        >
          {text}
        </Markdown>
      </div>
    );
  },
  (previous, next) =>
    previous.text === next.text &&
    JSON.stringify(previous.references) === JSON.stringify(next.references),
);

const MarkdownBody = memo(function MarkdownBody({ text }: { text: string }) {
  const { identities, skills } = useInlineReferences();
  const { agentId, snapshot } = useContext(AnswerContext);
  // Parsing depends on aliases and reference targets. Inventory loading, avatar activity,
  // fresh snapshot objects and duplicate historical actors do not change those meanings.
  const files = snapshot?.artifacts ?? [];
  const hasReferences =
    /(^|[\s(])(?:@|\/[\w-])/u.test(text) || files.some(({ id }) => text.includes(id));
  const references: MarkdownReferenceOptions | undefined = hasReferences
    ? {
        agents: identities.map(({ id, name, handle }) => ({ id, name, handle })),
        files: files.map(({ id, name }) => ({ id, name })),
        skills: (agentId ? skills.filter((skill) => skill.agent.id === agentId) : skills).map(
          ({ reference }) => ({ reference }),
        ),
      }
    : undefined;
  return <MarkdownText text={text} references={references} />;
});

/** File previews share the same safe renderers without drawing conversation bubbles. */
export function MarkdownDocument({ text, openResource, snapshot }: { text: string } & AnswerScope) {
  const scope = useMemo(() => ({ openResource, snapshot }), [openResource, snapshot]);
  return (
    <AnswerContext.Provider value={scope}>
      <MarkdownBody text={text} />
    </AnswerContext.Provider>
  );
}

export const Answer = memo(function Answer({
  agentId,
  text: incomingText,
  streaming = false,
  openResource,
  snapshot,
  sender,
  sentAt,
  sources,
  showSources = true,
  retry,
  busy,
}: {
  text: string;
  streaming?: boolean;
  showSources?: boolean;
  retry?: () => void;
  busy?: boolean;
  sentAt?: string;
  sender?: { name: string; style: CSSProperties; open?: () => void };
} & AnswerScope) {
  const text = useStreamingText(incomingText, streaming);
  const scope = useMemo(
    () => ({ openResource, snapshot, agentId, sources }),
    [openResource, snapshot, agentId, sources],
  );
  const blocks = useMemo(
    () =>
      splitReplyBlocks(text).map((block, position) => ({
        ...block,
        id: `${block.kind}-${position}`,
      })),
    [text],
  );
  return (
    <AnswerContext.Provider value={scope}>
      <div
        data-reply-blocks
        className="assistant-answer flex w-full max-w-full flex-col items-start gap-1"
      >
        {sender ? (
          <MessageActions text={incomingText} retry={retry} busy={busy}>
            <Bubble
              variant="secondary"
              data-chat-bubble="group"
              className="chat-agent-bubble group-agent-bubble"
              style={sender.style}
            >
              <BubbleContent className="chat-bubble-content text-[15px] leading-[22px]">
                {sender.open ? (
                  <button type="button" className="group-bubble-author" onClick={sender.open}>
                    {sender.name}
                  </button>
                ) : (
                  <span className="group-bubble-author">{sender.name}</span>
                )}
                <MarkdownBody text={text} />
                <MessageTime at={sentAt} className="group-bubble-time" />
              </BubbleContent>
            </Bubble>
          </MessageActions>
        ) : (
          blocks.map((block) => {
            const content = <MarkdownBody key={block.id} text={block.text} />;
            return block.kind === "table" ? (
              <div
                key={block.id}
                data-reply-table
                className="my-2 w-full max-w-[88%] first:mt-0 last:mb-0"
              >
                {content}
                <MessageTime at={sentAt} />
              </div>
            ) : (
              <MessageActions key={block.id} text={block.text} retry={retry} busy={busy}>
                <Bubble variant="secondary" data-chat-bubble="simple" className="chat-agent-bubble">
                  <BubbleContent className="chat-bubble-content text-[15px] leading-[22px]">
                    {content}
                    <MessageTime at={sentAt} />
                  </BubbleContent>
                </Bubble>
              </MessageActions>
            );
          })
        )}
        {sources && showSources && <ResearchSources sources={sources} />}
      </div>
    </AnswerContext.Provider>
  );
});
