import {
  ArrowDown01Icon,
  Cancel01Icon,
  InformationCircleIcon,
  Settings01Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";

import { Dialog as DialogPrimitive } from "radix-ui";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ProviderSettings } from "@/features/settings/components/providers";
import { SettingsSearch } from "@/features/settings/components/settings-search";
import { SettingsRow, SettingsSection } from "@/features/settings/components/shared";
import { ThemeSelect } from "@/features/settings/components/theme-select";
import { useSettingsDialog } from "@/features/settings/hooks/use-settings-dialog";
import type { SettingsSectionId } from "@/features/settings/lib/settings-search";
import { useSettingsWorkspace } from "@/hooks/settings-workspace";
import "../settings.css";

const sections = [
  {
    id: "general",
    label: "Umum",
    keywords: "tampilan tema terang gelap sistem",
    icon: Settings01Icon,
  },
  {
    id: "providers",
    label: "Providers",
    keywords: "chatgpt codex muse akun login api key subscription koneksi model biaya runtime",
    icon: SparklesIcon,
  },
  {
    id: "about",
    label: "Tentang",
    keywords: "ngertiin bantuan dokumentasi",
    icon: InformationCircleIcon,
  },
] as const;
export default function SettingsDialog() {
  const { agents, connections, refresh, openAgent } = useSettingsWorkspace();
  const { section, open, close } = useSettingsDialog();
  const page = section ?? "general";
  const [query, setQuery] = useState("");
  const dialog = useRef<HTMLDivElement>(null);
  const returnFocus = useRef(document.activeElement);
  function restoreFocus() {
    const workspace = document.querySelector(".workspace-shell");
    if (!(workspace instanceof HTMLElement)) return;
    const visible = (element: Element | null): element is HTMLElement =>
      element instanceof HTMLElement &&
      element.isConnected &&
      element.getClientRects().length > 0 &&
      !element.closest('[inert], [aria-hidden="true"], [role="dialog"][data-state="closed"]');
    if (document.querySelector('[role="dialog"][data-state="open"]')) return;
    const previous = returnFocus.current;
    if (visible(previous) && workspace.contains(previous) && previous.tabIndex >= 0)
      previous.focus({ preventScroll: true });
    if (visible(document.activeElement) && workspace.contains(document.activeElement)) return;
    const target = [
      workspace.querySelector('button[aria-label="Buka percakapan"]'),
      workspace.querySelector('textarea[aria-label="Pesan"]'),
    ].find((element) => visible(element) && element.tabIndex >= 0);
    if (target instanceof HTMLElement) target.focus({ preventScroll: true });
  }
  const q = query.trim().toLowerCase();
  const matches = sections.filter((item) =>
    `${item.label} ${item.keywords}`.toLowerCase().includes(q),
  );
  const current = sections.find((item) => item.id === page) ?? sections[0];
  const firstMatch = matches[0]?.id;
  const currentMatches = matches.some((item) => item.id === page);

  useEffect(() => {
    if (q && !currentMatches && firstMatch) void open(firstMatch, undefined, true);
  }, [q, currentMatches, firstMatch, open]);

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => !open && close()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="settings-scrim" />
        <div className="settings-frame" data-settings-sheet data-settings-look="simple">
          <DialogPrimitive.Content
            ref={dialog}
            className="settings-page settings-dialog"
            aria-describedby="settings-description"
            onEscapeKeyDown={(event) => {
              const field = event.target;
              if (field instanceof Element && field.closest("[data-api-key-editor]")) {
                event.preventDefault();
                return;
              }
              if (
                field instanceof HTMLInputElement &&
                field.closest(".settings-search") &&
                field.value
              )
                event.preventDefault();
            }}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              dialog.current?.focus();
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              requestAnimationFrame(restoreFocus);
            }}
          >
            <DialogPrimitive.Title className="sr-only">Pengaturan</DialogPrimitive.Title>
            <DialogPrimitive.Description id="settings-description" className="sr-only">
              Tampilan aplikasi dan koneksi provider Ngertiin.
            </DialogPrimitive.Description>
            <aside className="settings-sidebar">
              <SettingsSearch
                label="Cari pengaturan"
                placeholder="Cari pengaturan"
                value={query}
                onChange={setQuery}
              />
              <nav aria-label="Menu pengaturan" className="settings-navigation">
                {matches.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.id}
                      from="/"
                      search={(previous) => ({
                        ...previous,
                        settings: item.id,
                        provider: undefined,
                      })}
                      resetScroll={false}
                      activeOptions={{ exact: true, explicitUndefined: true }}
                      className="settings-nav-item"
                      data-settings-page={item.id}
                      aria-current={page === item.id ? "page" : undefined}
                      onClick={() => setQuery("")}
                    >
                      <HugeiconsIcon icon={Icon} size={15} aria-hidden="true" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
                {!matches.length && (
                  <p className="settings-search-empty" role="status">
                    Tidak ada pengaturan yang cocok.
                  </p>
                )}
              </nav>
            </aside>
            <div className="settings-pane">
              <header className="settings-content-header">
                <div className="settings-mobile-section">
                  <select
                    aria-label="Menu pengaturan"
                    value={page}
                    onChange={(event) => {
                      setQuery("");
                      void open(event.target.value as SettingsSectionId);
                    }}
                  >
                    {sections.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <HugeiconsIcon icon={ArrowDown01Icon} size={14} aria-hidden="true" />
                </div>
                <h2>{current.label}</h2>
              </header>
              <DialogPrimitive.Close
                className="settings-close"
                aria-label="Tutup pengaturan"
                title="Tutup pengaturan (Esc)"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={16} aria-hidden="true" />
              </DialogPrimitive.Close>
              <main
                className="settings-scroll"
                key={page}
                aria-label="Isi pengaturan"
                data-settings-scroll
              >
                {page === "general" && (
                  <SettingsSection title="Tampilan">
                    <SettingsRow title="Tema">
                      <ThemeSelect />
                    </SettingsRow>
                  </SettingsSection>
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
                )}
              </main>
            </div>
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
