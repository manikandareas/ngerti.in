import { ArrowRight01Icon, ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { CatalogEntry } from "../lib/catalog";
import { categoryLabel } from "../lib/categories";
import { EntryIcon } from "./catalog-entry";

export function EntryDetail({
  entry,
  plugin,
  available,
  installAction,
  management,
  feedback,
  onPrompt,
}: {
  entry: CatalogEntry;
  plugin: boolean;
  available: boolean;
  installAction?: ReactNode;
  management?: ReactNode;
  feedback?: ReactNode;
  onPrompt: (prompt: string) => void;
}) {
  return (
    <article className="marketplace-detail">
      <header className="marketplace-detail-header">
        <EntryIcon entry={entry} plugin={plugin} />
        <div className="marketplace-detail-identity">
          <h1 tabIndex={-1} data-marketplace-heading>
            {entry.name}
          </h1>
          <p>
            {plugin
              ? categoryLabel(entry.category)
              : entry.prompts.length > 0
                ? available
                  ? "Available skill"
                  : "Skill idea"
                : entry.description}
          </p>
        </div>
        <div className="marketplace-detail-actions">
          {installAction ??
            (!plugin && entry.prompts[0] ? (
              <Button className="marketplace-primary" onClick={() => onPrompt(entry.prompts[0])}>
                {available ? "Try now" : "Create with agent"}
                <HugeiconsIcon icon={ArrowUpRight01Icon} size={16} />
              </Button>
            ) : null)}
        </div>
      </header>
      {feedback}
      {entry.prompts.length > 0 && (
        <section className="marketplace-prompt-preview" aria-label="Example requests">
          <div className="marketplace-prompts">
            {entry.prompts.map((prompt) => (
              <button type="button" key={prompt} onClick={() => onPrompt(prompt)}>
                <span>
                  <span className="marketplace-prompt-name">{entry.name}</span>
                  {prompt}
                </span>
                <span className="marketplace-prompt-arrow">
                  <HugeiconsIcon icon={ArrowRight01Icon} size={18} />
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
      {(plugin || entry.prompts.length > 0 || entry.about !== entry.description) && (
        <p className="marketplace-detail-about">{entry.about}</p>
      )}
      {management}
      <section className="marketplace-detail-section" aria-labelledby="marketplace-info-heading">
        <h2 id="marketplace-info-heading">Information</h2>
        <dl className="marketplace-information">
          <div>
            <dt>Categories</dt>
            <dd className="marketplace-category-tags">
              {entry.categories?.length
                ? entry.categories.map((category) => (
                    <span key={category.slug}>{categoryLabel(category.name)}</span>
                  ))
                : entry.category}
            </dd>
          </div>
          {plugin && entry.toolsCount !== undefined && (
            <div>
              <dt>Actions</dt>
              <dd>
                {entry.toolsCount.toLocaleString()} tools
                {entry.triggersCount ? ` · ${entry.triggersCount.toLocaleString()} triggers` : ""}
              </dd>
            </div>
          )}
          {plugin && entry.noAuth !== undefined && (
            <div>
              <dt>Authentication</dt>
              <dd>{entry.noAuth ? "No account required" : "Account connection required"}</dd>
            </div>
          )}
          {entry.website && (
            <div>
              <dt>Website</dt>
              <dd>
                <a href={entry.website} target="_blank" rel="noreferrer">
                  Visit {entry.name}
                  <HugeiconsIcon icon={ArrowUpRight01Icon} size={14} />
                </a>
              </dd>
            </div>
          )}
        </dl>
      </section>
      {!plugin && (
        <p className="marketplace-detail-note">
          {available
            ? "Skills follow the selected agent and conversation. Harness skills are managed by their original harness."
            : "This is a skill idea. Your agent can help you create it for your needs."}
        </p>
      )}
    </article>
  );
}
