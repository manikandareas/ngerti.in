import {
  AccessibilityIcon,
  InformationCircleIcon,
  KeyboardIcon,
  Message01Icon,
  PaintBoardIcon,
  Settings01Icon,
  Shield01Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { useLayoutEffect, useRef } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DataSettings } from "@/features/settings/components/data-settings";
import {
  AccessibilitySettings,
  AppearanceSettings,
  ConversationSettings,
  GeneralSettings,
  KeyboardSettings,
} from "@/features/settings/components/preference-sections";
import { ProviderSettings } from "@/features/settings/components/providers";
import { SettingsRow, SettingsSection } from "@/features/settings/components/shared";
import { useSettings } from "@/features/settings/hooks/use-settings";
import type { SettingsSectionId } from "@/features/settings/lib/settings-search";
import { useSettingsWorkspace } from "@/hooks/settings-workspace";
import { usePreferences } from "@/hooks/use-preferences";
import "../settings.css";

const sections = [
  { id: "general", label: "Umum", icon: Settings01Icon },
  { id: "appearance", label: "Tampilan", icon: PaintBoardIcon },
  { id: "conversation", label: "Percakapan", icon: Message01Icon },
  { id: "accessibility", label: "Aksesibilitas", icon: AccessibilityIcon },
  { id: "providers", label: "Providers", icon: SparklesIcon },
  { id: "data", label: "Data & privasi", icon: Shield01Icon },
  { id: "shortcuts", label: "Pintasan keyboard", icon: KeyboardIcon },
  { id: "about", label: "Tentang", icon: InformationCircleIcon },
] as const;

export default function SettingsPage() {
  const { agents, connections, refresh, openAgent } = useSettingsWorkspace();
  const { section, open } = useSettings();
  const { error } = usePreferences();
  const page = section ?? "general";
  const current = sections.find((item) => item.id === page) ?? sections[0];
  const heading = useRef<HTMLHeadingElement>(null);

  useLayoutEffect(() => {
    // A screen change moves focus into the new content without a modal focus trap.
    if (page) heading.current?.focus({ preventScroll: true });
  }, [page]);

  return (
    <div className="app-screen settings-screen" data-settings-screen>
      <aside className="app-sidebar app-sidebar-menu settings-sidebar">
        <div className="app-sidebar-header settings-sidebar-header">
          <span className="app-sidebar-title settings-sidebar-title">Pengaturan</span>
        </div>
        <nav aria-label="Menu pengaturan" className="app-sidebar-navigation settings-navigation">
          {sections.map((item) => (
            <Link
              key={item.id}
              from="/"
              search={(previous) => ({ ...previous, settings: item.id, provider: undefined })}
              resetScroll={false}
              className="app-sidebar-link settings-nav-item"
              data-settings-page={item.id}
              aria-current={page === item.id ? "page" : undefined}
            >
              <HugeiconsIcon icon={item.icon} size={18} strokeWidth={1.5} aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <select
          className="settings-select settings-mobile-section"
          aria-label="Menu pengaturan"
          value={page}
          onChange={(event) => void open(event.target.value as SettingsSectionId)}
        >
          {sections.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </aside>
      <main className="app-surface settings-pane" aria-label="Pengaturan">
        <header className="settings-content-header">
          <h1 ref={heading} tabIndex={-1}>
            {current.label}
          </h1>
        </header>
        <div className="settings-scroll" key={page} data-settings-scroll>
          <div className="settings-content">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {page === "general" && <GeneralSettings />}
            {page === "appearance" && <AppearanceSettings />}
            {page === "conversation" && <ConversationSettings />}
            {page === "accessibility" && <AccessibilitySettings />}
            {page === "data" && <DataSettings />}
            {page === "shortcuts" && <KeyboardSettings />}
            {page === "providers" && (
              <ProviderSettings
                connections={connections}
                agents={agents}
                refresh={refresh}
                openAgent={openAgent}
              />
            )}
            {page === "about" && (
              <SettingsSection title="Aplikasi">
                <SettingsRow
                  title="Ngertiin"
                  description="Ruang kerja pribadi untuk percakapan dan pekerjaan bersama agent."
                />
              </SettingsSection>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
