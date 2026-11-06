import { ArrowUpRight01Icon, Globe02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Run } from "@/types/workspace";
import "./conversation-interactions.css";

export type ResearchSource = Run["sources"][number];
export function sourceDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
export function researchSources(sources: ResearchSource[]) {
  return [
    ...new Map(
      sources
        .filter((source) => /^https?:\/\//i.test(source.url) && sourceDomain(source.url))
        .map((source) => [source.url, source]),
    ).values(),
  ];
}
export function SourceCitation({ source }: { source: ResearchSource }) {
  return (
    <a
      className="source-citation"
      href={source.url}
      target="_blank"
      rel="noreferrer"
      title={source.title || source.url}
    >
      <HugeiconsIcon icon={Globe02Icon} size={13} aria-hidden="true" />
      <span>{sourceDomain(source.url)}</span>
    </a>
  );
}
export function ResearchSources({ sources }: { sources: ResearchSource[] }) {
  const unique = researchSources(sources);
  if (!unique.length) return null;
  return (
    <details className="research-sources">
      <summary aria-label={`${unique.length} sumber riset`}>
        <span className="source-stack" aria-hidden="true">
          {unique.slice(0, 3).map((source) => (
            <span key={source.url}>{sourceDomain(source.url).slice(0, 1).toUpperCase()}</span>
          ))}
        </span>
        <span>{unique.length} sumber</span>
      </summary>
      <ul aria-label="Sumber riset">
        {unique.map((source) => (
          <li key={source.url}>
            <a href={source.url} target="_blank" rel="noreferrer">
              <span className="source-list-domain">
                <HugeiconsIcon icon={Globe02Icon} size={14} aria-hidden="true" />
                {sourceDomain(source.url)}
              </span>
              <span>{source.title || source.url}</span>
              <HugeiconsIcon icon={ArrowUpRight01Icon} size={14} aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
