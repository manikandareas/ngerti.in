import {
  ArrowLeft01Icon,
  BubbleChatIcon,
  ComputerIcon,
  InformationCircleIcon,
  Settings02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ProviderSettings } from "@/features/settings/components/providers";
import { SettingsSearch } from "@/features/settings/components/settings-search";
import { SettingsRow, SettingsSection } from "@/features/settings/components/shared";
import { ThemeSelect } from "@/features/settings/components/theme-select";
import { useSettingsWorkspace } from "@/hooks/settings-workspace";

const sections = [
  {
    id: "general",
    label: "Umum",
    keywords: "tampilan tema terang gelap sistem",
    icon: Settings02Icon,
  },
  {
    id: "providers",
    label: "Providers",
    keywords: "chatgpt codex muse akun login api key subscription koneksi model biaya runtime",
    icon: ComputerIcon,
  },
  {
    id: "about",
    label: "Tentang",
    keywords: "ngertiin bantuan dokumentasi",
    icon: InformationCircleIcon,
  },
] as const;
export type SettingsPageId = (typeof sections)[number]["id"];

export default function SettingsPage() {
  const { agents, connections, refresh, openAgent } = useSettingsWorkspace();
  const search = useSearch({ from: "/workspace/settings" });
  const page = search.section ?? "general";
  const [query, setQuery] = useState("");
  const matches = sections.filter((item) =>
    `${item.label} ${item.keywords}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <div className="settings-page flex h-svh min-h-0 w-full flex-col overflow-hidden bg-background text-foreground md:flex-row">
      <nav
        className="settings-rail hidden w-16 shrink-0 flex-col items-center gap-4 border-r bg-sidebar p-3 md:flex"
        aria-label="Navigasi aplikasi"
      >
        <Link
          to="/"
          className="settings-rail-brand grid size-9 place-items-center rounded-lg text-xl font-semibold [&_span]:hidden"
          aria-label="Ngertiin"
        >
          n<span>.</span>
        </Link>
        <Button asChild variant="ghost" size="icon">
          <Link to="/" activeOptions={{ exact: true }} aria-label="Kembali ke percakapan">
            <HugeiconsIcon icon={BubbleChatIcon} strokeWidth={1.5} />
          </Link>
        </Button>
        <Button asChild variant="secondary" size="icon" className="mt-auto">
          <Link to="/settings" aria-label="Pengaturan aplikasi">
            <HugeiconsIcon icon={Settings02Icon} strokeWidth={1.5} />
          </Link>
        </Button>
      </nav>
      <aside className="settings-sidebar flex w-full shrink-0 flex-col gap-3 border-b p-4 md:w-60 md:border-r md:border-b-0">
        <div className="settings-sidebar-header flex min-h-9 items-center gap-2 md:[&>[data-slot=button]]:hidden [&>h1]:text-base [&>h1]:font-semibold">
          <Button size="icon" variant="ghost" asChild>
            <Link to="/" activeOptions={{ exact: true }} aria-label="Kembali ke percakapan">
              <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={1.7} />
            </Link>
          </Button>
          <h1>Pengaturan</h1>
        </div>
        <p className="sr-only">Tampilan aplikasi dan koneksi provider Ngertiin.</p>
        <SettingsSearch
          label="Cari pengaturan"
          placeholder="Cari pengaturan"
          value={query}
          onChange={setQuery}
        />
        <nav
          aria-label="Menu pengaturan"
          className="flex max-h-[40dvh] flex-wrap gap-1 overflow-y-auto md:max-h-none md:flex-col"
        >
          {matches.map((item) => (
            <Button
              asChild
              variant="ghost"
              key={item.id}
              className="settings-nav-button w-auto justify-start md:w-full"
            >
              <Link
                key={item.id}
                to="/settings"
                search={{ section: item.id === "general" ? undefined : item.id }}
                activeOptions={{ exact: true, explicitUndefined: true }}
                className="settings-nav-item aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground"
                aria-current={page === item.id ? "page" : undefined}
                onClick={() => setQuery("")}
              >
                <HugeiconsIcon icon={item.icon} size={18} strokeWidth={1.6} />
                {item.label}
              </Link>
            </Button>
          ))}
          {!matches.length && (
            <p className="p-2 text-caption text-muted-foreground" role="status">
              Tidak ada pengaturan yang cocok.
            </p>
          )}
        </nav>
      </aside>
      <main
        className="settings-scroll min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain"
        key={page}
        aria-label="Isi pengaturan"
      >
        <div className="settings-content mx-auto w-full max-w-3xl p-4 pb-12 sm:p-6 lg:p-8">
          {page === "general" && (
            <>
              <header className="settings-content-header mb-6 space-y-2 [&>h2]:text-xl [&>h2]:font-semibold [&>h2]:tracking-tight [&>p]:text-sm [&>p]:text-muted-foreground">
                <h2>Umum</h2>
              </header>
              <SettingsSection title="Tampilan">
                <SettingsRow
                  title="Tema"
                  description="Pilih tampilan, atau ikuti pengaturan perangkat."
                >
                  <ThemeSelect />
                </SettingsRow>
              </SettingsSection>
            </>
          )}
          {page === "providers" && (
            <ProviderSettings
              connections={connections}
              agents={agents}
              refresh={refresh}
              openAgent={openAgent}
            />
          )}
          {page === "about" && (
            <>
              <header className="settings-content-header mb-6 space-y-2 [&>h2]:text-xl [&>h2]:font-semibold [&>h2]:tracking-tight [&>p]:text-sm [&>p]:text-muted-foreground">
                <h2>Tentang Ngertiin</h2>
                <p>Ruang kerja bersama agent yang mengenalmu.</p>
              </header>
              <SettingsSection title="Ngertiin">
                <SettingsRow
                  title="Agent persisten"
                  description="Lanjutkan pekerjaan melalui percakapan bersama Tobi dan agent milikmu."
                />
                <SettingsRow
                  title="Pengaturan agent"
                  description="Nama, arahan, memory, skills, model, dan reasoning tersedia di panel Agent dalam percakapan."
                />
                <SettingsRow
                  title="Dokumentasi produk"
                  description="Scope dan keputusan pengembangan Ngertiin."
                >
                  <Button asChild variant="outline">
                    <a
                      href="https://app.notion.com/p/402abdd6187381e3a720f4b01d824e1a"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Buka dokumentasi
                    </a>
                  </Button>
                </SettingsRow>
              </SettingsSection>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
