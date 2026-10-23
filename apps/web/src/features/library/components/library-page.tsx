import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ChevronDown,
  Ellipsis,
  FileText,
  FolderOpen,
  Globe,
  Image,
  LayoutGrid,
  Music,
  Plus,
  Search,
  Video,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { WorkspaceState } from "@/components/workspace-state";
import { useChatHistory } from "@/features/chat/hooks/use-chat-history";
import { AttachmentPicker } from "@/features/files/components/attachment-picker";
import { useAttachments } from "@/features/files/hooks/use-attachments";
import { SettingsDialog } from "@/features/workspace/components/settings-dialog";
import {
  DesktopNavigation,
  MobileNavigation,
} from "@/features/workspace/components/workspace-navigation";
import type { WorkspaceView } from "@/features/workspace/types";
import { useResourceSearch } from "../hooks/use-library";
import type { ResourceRef, SearchSpec } from "../types";
import { ResourceProvider } from "./resource-context";
import { ResourceSurface } from "./resource-surface";
import { SearchDialog } from "./search-dialog";

const categories = [
  {
    section: "artifacts",
    view: undefined,
    category: "artifacts",
    label: "Semua artifact",
    icon: LayoutGrid,
    group: "Artifact",
  },
  {
    section: "artifacts",
    view: "documents",
    category: "documents",
    label: "Dokumen",
    icon: FileText,
    group: "Artifact",
  },
  {
    section: "artifacts",
    view: "web",
    category: "web",
    label: "Web artifact",
    icon: Globe,
    group: "Artifact",
  },
  {
    section: "media",
    view: "images",
    category: "images",
    label: "Gambar",
    icon: Image,
    group: "Media",
  },
  {
    section: "media",
    view: "videos",
    category: "videos",
    label: "Video",
    icon: Video,
    group: "Media",
  },
  {
    section: "media",
    view: "audio",
    category: "audio",
    label: "Audio",
    icon: Music,
    group: "Media",
  },
  {
    section: "files",
    view: undefined,
    category: "files",
    label: "File unggahan",
    icon: FolderOpen,
    group: "File",
  },
] as const;

export function LibraryPage({
  section,
  view,
  query,
}: {
  section: string;
  view?: string;
  query: string;
}) {
  const navigate = useNavigate();
  const { mobile } = useChatHistory();
  const [mobileSearch, setMobileSearch] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [opened, setOpened] = useState<ResourceRef | null>(null);
  const [draft, setDraft] = useState(query);
  const [sort, setSort] = useState<SearchSpec["sort"]>("recent");
  useEffect(() => setDraft(query), [query]);
  const current =
    categories.find((item) => item.section === section && item.view === view) ??
    categories.find((item) => item.section === section) ??
    categories[0];
  const data = useResourceSearch({
    query,
    kinds: ["file", "result"],
    category: current.category,
    sort,
  });
  const items = data.data?.pages.flatMap((page) => page.items) ?? [];
  const uploads = useAttachments("file-management");
  const client = useQueryClient();
  useEffect(() => {
    if (uploads.items.length) void client.invalidateQueries({ queryKey: ["library"] });
  }, [uploads.items.length, client]);
  function go(destination: WorkspaceView) {
    if (destination === "files") return;
    if (destination === "settings") {
      setSettingsOpen(true);
      return;
    }
    if (destination === "goals") void navigate({ to: "/goals" });
    else void navigate({ to: "/", search: { view: destination } });
  }
  const navigation = (
    <div className="flex min-h-0 flex-1 flex-col px-3 py-3">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void navigate({
            to: "/library/$section",
            params: { section },
            search: { view, q: draft || undefined },
          });
        }}
        className="relative mb-6"
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label="Cari di Library"
          placeholder="Cari di Library…"
          maxLength={300}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="h-9 rounded-full bg-transparent pl-9 text-sm dark:bg-transparent"
        />
      </form>
      <nav
        aria-label="Kategori Library"
        className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto"
      >
        {["Artifact", "Media", "File"].map((group) => (
          <div key={group} className={group === "File" ? "mt-auto pt-6" : ""}>
            {group !== "File" && (
              <h2 className="mb-2 px-3 text-sm font-normal text-muted-foreground">{group}</h2>
            )}
            {categories
              .filter((item) => item.group === group)
              .map((item) => (
                <Link
                  key={item.category}
                  to="/library/$section"
                  params={{ section: item.section }}
                  search={{ view: item.view, q: query || undefined }}
                  aria-current={current.category === item.category ? "page" : undefined}
                  className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring ${current.category === item.category ? "bg-muted font-semibold" : "text-muted-foreground"}`}
                >
                  <item.icon className="size-5 shrink-0" />
                  {item.label}
                </Link>
              ))}
          </div>
        ))}
      </nav>
    </div>
  );
  return (
    <ResourceProvider
      threadId={null}
      opened={opened}
      setOpened={setOpened}
      discuss={() => go("chat")}
      prepare={(text) => void navigate({ to: "/", search: { prompt: text } })}
    >
      <div className="relative flex h-dvh overflow-hidden bg-background">
        <DesktopNavigation view="files" onNavigate={go} onSearch={() => setSearchOpen(true)} />
        {!mobile && (
          <aside
            aria-label="Library"
            className="flex min-h-0 w-[272px] shrink-0 border-r bg-card max-lg:w-60"
          >
            {navigation}
          </aside>
        )}
        <main
          id="main"
          className="min-w-0 flex-1 overflow-y-auto px-5 pb-24 pt-6 min-[701px]:px-10 min-[701px]:pb-10 min-[1100px]:px-16 min-[1100px]:pt-12"
        >
          <div className="mx-auto max-w-[1600px]">
            <header className="mb-8 flex items-center justify-between gap-3">
              <h1 className="min-w-0 text-3xl font-semibold tracking-tight max-[700px]:text-2xl">
                {mobile ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Kategori Library: ${current.label}`}
                        className="flex max-w-full items-center gap-2 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        <span className="truncate">{current.label}</span>
                        <ChevronDown className="size-5 shrink-0 text-muted-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      sideOffset={12}
                      className="w-64 rounded-2xl p-2"
                    >
                      <DropdownMenuRadioGroup
                        value={current.category}
                        onValueChange={(value) => {
                          const item = categories.find((category) => category.category === value);
                          if (item)
                            void navigate({
                              to: "/library/$section",
                              params: { section: item.section },
                              search: { view: item.view, q: query || undefined },
                            });
                        }}
                      >
                        {["Artifact", "Media", "File"].map((group) => (
                          <div key={group}>
                            {group !== "Artifact" && (
                              <DropdownMenuSeparator className="mx-1 my-2" />
                            )}
                            {group !== "File" && (
                              <DropdownMenuLabel className="px-3 py-2">{group}</DropdownMenuLabel>
                            )}
                            {categories
                              .filter((item) => item.group === group)
                              .map((item) => (
                                <DropdownMenuRadioItem
                                  key={item.category}
                                  value={item.category}
                                  className="min-h-11 gap-3 rounded-lg px-3 pr-8 text-base data-[state=checked]:text-primary"
                                >
                                  <item.icon className="size-5" />
                                  {item.label}
                                </DropdownMenuRadioItem>
                              ))}
                          </div>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  current.label
                )}
              </h1>
              <div className="flex shrink-0 items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="secondary"
                      className={
                        mobile ? "size-11 rounded-full p-0" : "h-10 rounded-full px-4 font-normal"
                      }
                      aria-label={mobile ? "Opsi Library" : "Urutan Library"}
                    >
                      {mobile ? (
                        <Ellipsis className="size-5" />
                      ) : (
                        <>
                          {sort === "recent"
                            ? "Terbaru"
                            : sort === "title"
                              ? "Judul A–Z"
                              : "Relevansi"}
                          <ChevronDown className="size-4" />
                        </>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52 rounded-xl p-2">
                    {mobile && (
                      <>
                        <DropdownMenuItem
                          className="min-h-11 gap-2 px-3"
                          onSelect={() => setMobileSearch(true)}
                        >
                          <Search />
                          Cari di Library
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    <DropdownMenuLabel className="px-3 py-2">Urutkan berdasarkan</DropdownMenuLabel>
                    <DropdownMenuRadioGroup
                      value={sort}
                      onValueChange={(value) => setSort(value as SearchSpec["sort"])}
                    >
                      <DropdownMenuRadioItem value="recent" className="min-h-11 px-3 pr-8">
                        Terbaru
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="title" className="min-h-11 px-3 pr-8">
                        Judul A–Z
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="relevance" className="min-h-11 px-3 pr-8">
                        Relevansi
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  className={mobile ? "size-11 rounded-full p-0" : "rounded-full"}
                  aria-label={current.category === "files" ? "Tambah file" : "Buat artifact"}
                  onClick={() =>
                    current.category === "files"
                      ? setUploadOpen(!uploadOpen)
                      : void navigate({
                          to: "/",
                          search: { prompt: "Bantu aku membuat artifact baru." },
                        })
                  }
                >
                  <Plus />
                  {!mobile && (current.category === "files" ? "Tambah file" : "Buat artifact")}
                </Button>
              </div>
            </header>
            {mobile && mobileSearch && (
              <form
                className="mb-6 flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void navigate({
                    to: "/library/$section",
                    params: { section },
                    search: { view, q: draft || undefined },
                  });
                }}
              >
                <Input
                  type="search"
                  aria-label="Cari di Library"
                  placeholder="Cari di Library…"
                  maxLength={300}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                />
                <Button type="submit" variant="secondary">
                  Cari
                </Button>
              </form>
            )}
            {uploadOpen && (
              <div className="mb-8 rounded-xl border bg-card p-4">
                <AttachmentPicker state={uploads} />
              </div>
            )}
            <h2 className="mb-5 text-lg font-semibold">
              {query ? `Hasil untuk “${query}”` : sort === "recent" ? "Terbaru" : "Koleksimu"}
            </h2>
            {data.isPending ? (
              <div
                role="status"
                aria-label="Memuat Library"
                aria-busy="true"
                className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))] gap-6"
              >
                {["a", "b", "c", "d", "e", "f"].map((key) => (
                  <div
                    key={key}
                    className="h-64 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none"
                  />
                ))}
              </div>
            ) : data.isError ? (
              <WorkspaceState
                kind="error"
                title="Library belum dapat dimuat"
                onRetry={() => void data.refetch()}
              />
            ) : !items.length ? (
              <WorkspaceState
                kind="empty"
                title={
                  query
                    ? "Belum ada yang cocok"
                    : current.category === "artifacts"
                      ? "Belum ada artifact"
                      : `Belum ada ${current.label.toLowerCase()}`
                }
                description={
                  query
                    ? "Coba kata pencarian lain atau pilih kategori berbeda."
                    : "File dan hasil pekerjaanmu akan tersimpan di sini. Mulai dari percakapan dengan Gwen."
                }
              />
            ) : (
              <section
                aria-label={current.label}
                className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))] gap-6"
              >
                {items.map((item) => (
                  <button
                    key={`${item.ref.kind}:${item.ref.id}`}
                    type="button"
                    onClick={() => setOpened(item.ref)}
                    className="group min-w-0 overflow-hidden rounded-2xl border bg-card text-left transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <div className="flex aspect-[8/5] flex-col overflow-hidden border-b bg-muted/50 p-6">
                      <current.icon className="mb-4 size-7 shrink-0 text-muted-foreground" />
                      <p className="line-clamp-5 text-sm leading-relaxed text-muted-foreground wrap-anywhere">
                        {item.snippet || item.title}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 p-4">
                      <current.icon className="size-7 shrink-0 text-primary" />
                      <div className="min-w-0">
                        <h3
                          className="truncate text-sm font-semibold group-hover:underline"
                          title={item.title}
                        >
                          {item.title}
                        </h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.ref.kind === "file" ? "File" : "Artifact"}
                          {item.updated_at &&
                            ` · ${new Date(item.updated_at).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}`}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </section>
            )}
            {data.hasNextPage && (
              <Button
                className="mt-6"
                variant="outline"
                disabled={data.isFetchingNextPage}
                onClick={() => void data.fetchNextPage()}
              >
                {data.isFetchingNextPage ? "Memuat…" : "Lihat lainnya"}
              </Button>
            )}
          </div>
        </main>
        <MobileNavigation view="files" onNavigate={go} />
        <SearchDialog
          open={searchOpen}
          onOpenChange={setSearchOpen}
          onSelectThread={(thread) => void navigate({ to: "/", search: { thread } })}
        />
        <SettingsDialog
          initialCategory="general"
          onRestoreFocus={() =>
            document.querySelector<HTMLButtonElement>('[aria-label="Pengaturan"]')?.focus()
          }
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
        />
        <ResourceSurface mobile={mobile} overlay />
      </div>
    </ResourceProvider>
  );
}
