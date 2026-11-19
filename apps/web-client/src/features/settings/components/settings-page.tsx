import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useLayoutEffect, useRef, useState } from "react";
import { SlidingPanel } from "@/app/sliding-panel";
import { AccountSettings, SecuritySettings } from "@/features/account/account-settings";
import { ActivitySettings } from "@/features/account/activity-settings";
import { MembersSettings } from "@/features/account/members-settings";
import { OrganizationSettings } from "@/features/account/organization-settings";
import { ScopedProviderSettings } from "@/features/account/provider-settings";
import { useAccount } from "@/features/account/session";
import { TeamAgentsSettings } from "@/features/account/team-agents-settings";
import { WorkgroupsSettings } from "@/features/account/workgroups-settings";
import { useSettings } from "../hooks/use-settings";
import { preferenceTargets, settingsNavigation } from "../lib/navigation";
import { isSettingsSection, type SettingsSectionId } from "../lib/settings-search";
import { DataSettings } from "./data-settings";
import {
  AccessibilitySettings,
  AppearanceSettings,
  ConversationSettings,
  GeneralSettings,
  KeyboardSettings,
} from "./preference-sections";
import { matchesSearch, SettingsSearch } from "./settings-ui";
import { SettingsRow, SettingsSection } from "./shared";
import "../settings.css";
import "../settings-layout.css";

export default function SettingsPage({ sidebarOpen = true }: { sidebarOpen?: boolean }) {
  const account = useAccount();
  const navigate = useNavigate({ from: "/" });
  const { section, setting } = useSettings();
  const [query, setQuery] = useState("");
  const scroll = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const positions = useRef(new Map<string, number>());
  const canManage = !!account.access?.capabilities.manage_organization;
  const visible = settingsNavigation.filter(
    (item) =>
      item.group !== "Organization" ||
      canManage ||
      ["organization", "workgroups", "organization-providers"].includes(item.id),
  );
  const requested = ["appearance", "conversation", "accessibility"].includes(section ?? "")
    ? "general"
    : section;
  const page = visible.find((item) => item.id === requested) ?? visible[1];
  const wide = ["members", "workgroups", "team-agents", "activity"].includes(page.id);
  const target = setting ?? (section !== requested ? section : undefined);
  const searchResults = visible.filter((item) =>
    matchesSearch(query, item.label, item.group, item.keywords),
  );
  const targets = query.trim()
    ? preferenceTargets.filter((item) => matchesSearch(query, item.label, item.keywords))
    : [];
  useLayoutEffect(() => {
    const element = scroll.current;
    heading.current?.focus({ preventScroll: true });
    if (element) {
      element.scrollTop = positions.current.get(page.id) ?? 0;
      if (target)
        element
          .querySelector<HTMLElement>(`[data-setting="${target}"]`)
          ?.scrollIntoView({ block: "start" });
    }
    return () => {
      if (element) positions.current.set(page.id, element.scrollTop);
    };
  }, [page.id, target]);
  const select = (id: SettingsSectionId, anchor?: string) => {
    setQuery("");
    void navigate({
      search: (previous) => ({
        ...previous,
        settings: id,
        provider: undefined,
        workgroup: undefined,
        settingsTab: undefined,
        setting: anchor,
      }),
      resetScroll: false,
    });
  };
  return (
    <div className="app-screen settings-screen" data-settings-screen>
      <SlidingPanel open={sidebarOpen} width={248}>
        <aside className="app-sidebar settings-sidebar">
          <SettingsSearch value={query} onChange={setQuery} placeholder="Search settings…" />
          <nav aria-label="Settings navigation" className="settings-navigation">
            {["Personal", "Organization", "Application"].map((group) => {
              const entries = (query.trim() ? searchResults : visible).filter(
                (item) => item.group === group,
              );
              if (!entries.length && !(group === "Personal" && targets.length)) return null;
              return (
                <div className="settings-nav-group" key={group}>
                  <h2>
                    {group === "Organization"
                      ? (account.organization?.name ?? "Organization")
                      : group}
                  </h2>
                  {entries.map((item) => (
                    <Link
                      key={item.id}
                      from="/"
                      search={(previous) => ({
                        ...previous,
                        settings: item.id,
                        provider: undefined,
                        workgroup: undefined,
                        settingsTab: undefined,
                        setting: undefined,
                      })}
                      resetScroll={false}
                      onClick={() => setQuery("")}
                      className="settings-nav-item"
                      aria-current={page.id === item.id ? "page" : undefined}
                    >
                      <HugeiconsIcon
                        icon={item.icon}
                        size={17}
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                      <span>
                        {item.id === "workgroups" && !canManage ? "My workgroups" : item.label}
                      </span>
                    </Link>
                  ))}
                  {group === "Personal" &&
                    targets.map((item) => (
                      <button
                        key={item.id}
                        className="settings-search-result"
                        type="button"
                        onClick={() => select("general", item.id)}
                      >
                        <HugeiconsIcon icon={Search01Icon} size={14} />
                        {item.label}
                      </button>
                    ))}
                </div>
              );
            })}
            {query.trim() && !searchResults.length && !targets.length && (
              <p className="settings-search-empty">No matching settings.</p>
            )}
          </nav>
          <div className="settings-sidebar-account">
            <span>{account.session?.user.name}</span>
            <span>{account.access?.role}</span>
          </div>
        </aside>
      </SlidingPanel>
      <main
        className="app-surface settings-pane"
        aria-label="Settings"
        data-layout={wide ? "wide" : "form"}
      >
        <div className="settings-mobile-navigation">
          <label htmlFor="settings-mobile-nav">Settings</label>
          <select
            id="settings-mobile-nav"
            className="settings-select"
            value={page.id}
            onChange={(event) => {
              const value = event.currentTarget.value;
              if (isSettingsSection(value)) select(value);
            }}
          >
            {["Personal", "Organization", "Application"].map((group) => (
              <optgroup
                key={group}
                label={group === "Organization" ? account.organization?.name : group}
              >
                {visible
                  .filter((item) => item.group === group)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="settings-scroll" ref={scroll}>
          <div className="settings-content">
            <header className="settings-content-header">
              <h1 ref={heading} tabIndex={-1}>
                {page.id === "organization"
                  ? "Organization"
                  : page.id === "workgroups" && !canManage
                    ? "My workgroups"
                    : page.label}
              </h1>
              {page.group === "Organization" && (
                <p>
                  {account.organization?.name}
                  <span className="settings-context-role">{account.access?.role}</span>
                </p>
              )}
            </header>
            <div key={`${account.organization?.id}:${page.id}`} className="settings-page-body">
              {page.id === "account" && <AccountSettings />}
              {page.id === "security" && <SecuritySettings />}
              {page.id === "general" && (
                <div className="settings-preferences">
                  {preferenceTargets.map((item) => (
                    <div key={item.id} data-setting={item.id} data-highlighted={target === item.id}>
                      {item.id === "startup" ? (
                        <GeneralSettings />
                      ) : item.id === "appearance" ? (
                        <AppearanceSettings />
                      ) : item.id === "conversation" ? (
                        <ConversationSettings />
                      ) : (
                        <AccessibilitySettings />
                      )}
                    </div>
                  ))}
                </div>
              )}
              {page.id === "organization" && <OrganizationSettings />}
              {page.id === "members" && <MembersSettings />}
              {page.id === "workgroups" && <WorkgroupsSettings />}
              {page.id === "team-agents" && <TeamAgentsSettings />}
              {page.id === "providers" && <ScopedProviderSettings ownership="personal" />}
              {page.id === "organization-providers" && (
                <ScopedProviderSettings ownership="organization" />
              )}
              {page.id === "activity" && <ActivitySettings />}
              {page.id === "data" && <DataSettings key={account.scopeEpoch} />}
              {page.id === "shortcuts" && <KeyboardSettings />}
              {page.id === "about" && (
                <SettingsSection title="Application">
                  <SettingsRow
                    title="Ngertiin"
                    description="A persistent workspace for conversations and work with your agents."
                  />
                </SettingsSection>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
