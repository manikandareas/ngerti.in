import {
  Add01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  PackageIcon,
  Plug01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSettingsWorkspace } from "@/hooks/settings-workspace";
import { useApiResource } from "@/hooks/use-api-resource";
import type { Skills } from "@/types/workspace";
import { useMarketplace } from "../hooks/use-marketplace";
import { useMarketplaceToast } from "../hooks/use-marketplace-toast";
import { usePluginCatalog } from "../hooks/use-plugin-catalog";
import { usePluginManager } from "../hooks/use-plugin-manager";
import { type CatalogEntry, skillIdeas } from "../lib/catalog";
import { belongsToCategory, categoryLabel, primaryCategory } from "../lib/categories";
import { EntryIcon } from "./catalog-entry";
import { CatalogResults } from "./catalog-results";
import { EntryDetail } from "./entry-detail";
import { PluginFeedback, PluginInstall } from "./plugin-install";
import { PluginManagement } from "./plugin-management";
import "../marketplace.css";

export default function MarketplacePage({ onPrompt }: { onPrompt: (prompt: string) => void }) {
  const { section, item, category, open } = useMarketplace();
  const { snapshot, agents, appConnectionCursor } = useSettingsWorkspace();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("discover");
  const [agentId, setAgentId] = useState("");
  const content = useRef<HTMLElement>(null);
  const plugin = section === "plugins";
  const title = plugin ? "Plugins" : "Skills";
  const manager = usePluginManager(appConnectionCursor);
  const connections = manager.connections;
  const liveCatalog = usePluginCatalog();
  const connected = useMemo(
    () =>
      new Set(
        manager.inventory
          .filter((connection) => connection.state === "active")
          .map((connection) => connection.toolkit),
      ),
    [manager.inventory],
  );
  const catalogById = useMemo(
    () => new Map(liveCatalog.entries.map((entry) => [entry.id, entry])),
    [liveCatalog.entries],
  );
  const installed = useMemo<CatalogEntry[]>(
    () =>
      [...connected].map(
        (id) =>
          catalogById.get(id) ?? {
            id,
            name: id,
            description: "Connected app",
            about: "Manage this plugin and agent access here.",
            category: "Other apps",
            prompts: [],
          },
      ),
    [connected, catalogById],
  );
  const members = agents.filter((agent) => snapshot?.thread.member_agent_ids.includes(agent.id));
  const agent = members.find((value) => value.id === agentId) ?? members[0];
  const scope =
    agent && snapshot
      ? new URLSearchParams({ agent_id: agent.id, thread_id: snapshot.thread.id })
      : null;
  const skills = useApiResource<Skills>(!plugin && scope ? `/v1/learning/skills?${scope}` : null);
  const availableSkills = useMemo<CatalogEntry[]>(
    () =>
      skills.data
        ? [
            ...skills.data.application
              .filter((skill) => skill.assignment?.enabled)
              .map((skill) => ({
                id: `application:${skill.id}`,
                name: skill.name,
                description: "Application skill",
                about: "Application skill enabled for the selected agent and conversation.",
                category: "Application",
                prompts: [],
              })),
            ...skills.data.harness.map((skill) => ({
              id: `harness:${skill.key}`,
              name: skill.name,
              description: skill.description || "Harness skill",
              about: skill.description || "Skill provided by the selected agent’s harness.",
              category: "Harness",
              prompts: [],
            })),
            ...skills.data.native_catalog
              .filter(
                (skill) =>
                  skill.enabled &&
                  !skills.data?.harness.some((inherited) => inherited.name === skill.name),
              )
              .map((skill) => ({
                id: `native:${skill.key}`,
                name: skill.name,
                description: skill.description || "Native harness skill",
                about: skill.description || "Skill from the selected agent’s native catalog.",
                category: "Harness",
                prompts: [],
              })),
          ]
        : [],
    [skills.data],
  );
  const pluginEntries = useMemo(
    () => [...liveCatalog.entries, ...installed.filter((entry) => !catalogById.has(entry.id))],
    [liveCatalog.entries, installed, catalogById],
  );
  const selectedCategory = useMemo(
    () =>
      category
        ? pluginEntries
            .flatMap((entry) =>
              entry.categories?.length ? entry.categories : [primaryCategory(entry)],
            )
            .find((value) => value.slug === category)
        : undefined,
    [category, pluginEntries],
  );
  const categoryTitle = categoryLabel(
    selectedCategory?.name ?? category?.replaceAll("-", " ") ?? "",
  );
  const categoryEntries = useMemo(
    () =>
      category
        ? pluginEntries.filter((entry) => belongsToCategory(entry, category))
        : pluginEntries,
    [category, pluginEntries],
  );
  let catalog = skillIdeas;
  let description = "Extend what your agents can do.";
  if (plugin) {
    catalog = categoryEntries;
    description = category
      ? `Explore ${categoryTitle} plugins for your agents.`
      : "Connect your apps to work with your agents.";
  } else if (tab === "available") {
    catalog = availableSkills;
  }
  const selected = useMemo(
    () =>
      item
        ? (catalogById.get(item) ??
          availableSkills.find((entry) => entry.id === item) ??
          skillIdeas.find((entry) => entry.id === item) ??
          installed.find((entry) => entry.id === item))
        : undefined,
    [item, catalogById, availableSkills, installed],
  );
  const normalized = query.trim().toLocaleLowerCase();
  const searchIndex = useMemo(
    () =>
      catalog.map((entry) => ({
        entry,
        text: `${entry.id} ${entry.name} ${entry.description} ${entry.category} ${entry.categories?.map((tag) => `${tag.slug} ${tag.name}`).join(" ") ?? ""}`.toLocaleLowerCase(),
      })),
    [catalog],
  );
  const entries = useMemo(
    () =>
      !normalized
        ? catalog
        : searchIndex.filter(({ text }) => text.includes(normalized)).map(({ entry }) => entry),
    [catalog, searchIndex, normalized],
  );
  const isAvailable = useCallback(
    (entry: CatalogEntry) =>
      plugin ? connected.has(entry.id) : availableSkills.some((value) => value.id === entry.id),
    [plugin, connected, availableSkills],
  );
  const locationKey = `${section}:${category ?? ""}:${item ?? ""}`;
  const loading = plugin
    ? liveCatalog.busy && !liveCatalog.entries.length
    : tab === "available" && !skills.data && Boolean(scope) && !skills.error;

  useMarketplaceToast(connections.error ? "Installation status unavailable" : "", {
    description: "Refresh to verify installation status.",
    retry: connections.retry,
  });
  useMarketplaceToast(liveCatalog.error ? "Could not load all plugins" : "", {
    description: liveCatalog.error,
    retry: liveCatalog.retry,
  });
  useMarketplaceToast(
    !liveCatalog.busy && !liveCatalog.error && !liveCatalog.metadataComplete
      ? "Some app details are unavailable"
      : "",
    {
      tone: "warning",
      retry: liveCatalog.retry,
    },
  );
  useMarketplaceToast(!plugin && skills.error ? "Could not load skills" : "", {
    retry: skills.retry,
  });
  useMarketplaceToast(
    !plugin &&
      tab === "available" &&
      skills.data &&
      (skills.data.native_state === "unknown" || skills.data.harness_state === "unknown")
      ? "Some harness skills could not be checked"
      : "",
    { tone: "warning", retry: skills.retry },
  );

  useLayoutEffect(() => {
    if (locationKey) {
      content.current
        ?.querySelector<HTMLElement>("[data-marketplace-heading]")
        ?.focus({ preventScroll: true });
      content.current?.scrollTo({ top: 0 });
    }
  }, [locationKey]);

  function changeSection(next: "plugins" | "skills") {
    setQuery("");
    setTab("discover");
    void open(next);
  }
  const clearSearch = useCallback(() => setQuery(""), []);
  const openCategory = useCallback(
    (slug: string) => {
      setQuery("");
      void open("plugins", undefined, slug);
    },
    [open],
  );
  const openEntry = useCallback(
    (entry: CatalogEntry) => void open(section, entry.id, category),
    [open, section, category],
  );
  const prompt = useRef(onPrompt);
  prompt.current = onPrompt;
  const actOnEntry = useCallback(
    (entry: CatalogEntry) =>
      entry.prompts[0] ? prompt.current(entry.prompts[0]) : void open(section, entry.id),
    [open, section],
  );
  const results = (
    <CatalogResults
      key={`${section}:${category ?? ""}:${query}`}
      entries={entries}
      plugin={plugin}
      loading={loading}
      query={query}
      onClear={clearSearch}
      category={plugin ? category : undefined}
      onCategory={openCategory}
      onOpen={openEntry}
      onAction={actOnEntry}
      isAvailable={isAvailable}
      statusKnown={Boolean(connections.data) && !connections.error}
    />
  );

  return (
    <div className="app-screen marketplace-screen" data-marketplace-screen>
      <aside
        className="app-sidebar app-sidebar-menu marketplace-sidebar"
        aria-label="Marketplace menu"
      >
        <div className="app-sidebar-header marketplace-sidebar-header">
          <span className="app-sidebar-title marketplace-sidebar-heading">Marketplace</span>
        </div>
        <nav
          className="app-sidebar-navigation marketplace-navigation"
          aria-label="Marketplace navigation"
        >
          {(
            [
              { id: "plugins", label: "Plugins", icon: Plug01Icon },
              { id: "skills", label: "Skills", icon: PackageIcon },
            ] as const
          ).map((destination) => (
            <button
              key={destination.id}
              type="button"
              className="app-sidebar-link marketplace-nav-item"
              aria-current={section === destination.id && !item ? "page" : undefined}
              onClick={() => changeSection(destination.id)}
            >
              <HugeiconsIcon icon={destination.icon} size={18} strokeWidth={1.5} />
              <span>{destination.label}</span>
            </button>
          ))}
        </nav>
        <section
          className="marketplace-sidebar-available"
          aria-labelledby="marketplace-installed-heading"
        >
          <h2 id="marketplace-installed-heading">Installed</h2>
          <nav
            className="app-sidebar-navigation marketplace-installed-navigation"
            aria-label="Installed plugins"
          >
            {installed.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="app-sidebar-link marketplace-nav-item"
                aria-current={plugin && item === entry.id ? "page" : undefined}
                title={entry.name}
                onClick={() => void open("plugins", entry.id)}
              >
                <EntryIcon entry={entry} plugin />
                <span>{entry.name}</span>
              </button>
            ))}
            {!installed.length && !connections.error && !connections.data && (
              <div
                className="marketplace-sidebar-skeleton"
                role="status"
                aria-label="Loading installed plugins"
              >
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-36" />
              </div>
            )}
            {!installed.length && connections.data && !connections.error && (
              <span className="marketplace-sidebar-hint">No plugins installed.</span>
            )}
          </nav>
        </section>
      </aside>
      <main ref={content} className="app-surface marketplace-pane" aria-label="Marketplace">
        {item ? (
          <>
            <nav className="marketplace-breadcrumb" aria-label="Breadcrumb">
              <button type="button" onClick={() => void open(section)}>
                {title}
              </button>
              <HugeiconsIcon icon={ArrowRight01Icon} size={14} />
              {plugin && category && (
                <>
                  <button type="button" onClick={() => void open("plugins", undefined, category)}>
                    {categoryTitle}
                  </button>
                  <HugeiconsIcon icon={ArrowRight01Icon} size={14} />
                </>
              )}
              <span aria-current="page">
                {selected?.name ?? (loading ? "Loading…" : "Not found")}
              </span>
            </nav>
            {selected ? (
              <EntryDetail
                entry={selected}
                plugin={plugin}
                available={isAvailable(selected)}
                installAction={
                  plugin ? <PluginInstall entry={selected} manager={manager} /> : undefined
                }
                management={
                  plugin ? (
                    <PluginManagement
                      key={selected.id}
                      entry={selected}
                      manager={manager}
                      snapshot={snapshot}
                    />
                  ) : undefined
                }
                feedback={
                  plugin ? <PluginFeedback manager={manager} toolkit={selected.id} /> : undefined
                }
                onPrompt={onPrompt}
              />
            ) : (
              <div className="marketplace-detail">
                <h1 tabIndex={-1} data-marketplace-heading className="sr-only">
                  {loading ? "Loading plugin" : "Item unavailable"}
                </h1>
                {loading ? (
                  <div
                    className="marketplace-detail-skeleton"
                    role="status"
                    aria-label="Loading details"
                  >
                    <div>
                      <Skeleton className="size-15 rounded-xl" />
                      <Skeleton className="h-7 w-48" />
                    </div>
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                ) : (
                  <div className="marketplace-empty">
                    <h2>Item unavailable</h2>
                    <Button variant="secondary" onClick={() => void open(section)}>
                      Back to {title}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            {plugin && category && (
              <nav className="marketplace-breadcrumb" aria-label="Breadcrumb">
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    void open("plugins");
                  }}
                >
                  Plugins
                </button>
                <HugeiconsIcon icon={ArrowRight01Icon} size={14} />
                <span aria-current="page">{categoryTitle}</span>
              </nav>
            )}
            <div
              className="marketplace-catalog"
              data-category-view={Boolean(category) || undefined}
            >
              <header className="marketplace-header">
                <div className="marketplace-heading">
                  <h1 tabIndex={-1} data-marketplace-heading>
                    {plugin && category ? categoryTitle : title}
                  </h1>
                  <p>{description}</p>
                </div>
                <div className="marketplace-toolbar">
                  <label className="marketplace-search">
                    <HugeiconsIcon icon={Search01Icon} size={17} strokeWidth={1.5} />
                    <input
                      type="search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder={`Search ${plugin ? "plugins" : "skills"}`}
                      aria-label={`Search ${plugin ? "plugins" : "skills"}`}
                    />
                    {query && (
                      <button type="button" aria-label="Clear search" onClick={() => setQuery("")}>
                        <HugeiconsIcon icon={Cancel01Icon} size={14} />
                      </button>
                    )}
                  </label>
                  {!plugin && (
                    <Button
                      className="marketplace-primary marketplace-add"
                      onClick={() => onPrompt("Help me create a skill for work I do often.")}
                    >
                      <HugeiconsIcon icon={Add01Icon} size={16} />
                      Add skill
                    </Button>
                  )}
                </div>
              </header>
              {plugin ? (
                <>
                  <PluginFeedback manager={manager} />
                  {results}
                </>
              ) : (
                <Tabs value={tab} onValueChange={setTab} className="marketplace-tabs">
                  <div className="marketplace-filter-row">
                    <TabsList className="marketplace-tab-list">
                      <TabsTrigger value="discover">Recommended</TabsTrigger>
                      <TabsTrigger value="available">
                        Available
                        {availableSkills.length > 0 && (
                          <span className="marketplace-tab-count">{availableSkills.length}</span>
                        )}
                      </TabsTrigger>
                    </TabsList>
                    {agent && (
                      <select
                        className="marketplace-agent-select"
                        aria-label="Skills for agent"
                        value={agent.id}
                        onChange={(event) => setAgentId(event.target.value)}
                      >
                        {members.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  {["discover", "available"].map((value) => (
                    <TabsContent key={value} value={value} className="marketplace-tab-content">
                      <p className="marketplace-availability-note">
                        {value === "discover"
                          ? "Skill ideas to create with your agent."
                          : `Skills available to ${agent?.name ?? "your agent"} in this conversation.`}
                      </p>
                      {results}
                    </TabsContent>
                  ))}
                </Tabs>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
