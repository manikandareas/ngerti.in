import { type HarnessId, isHarness } from "@/lib/harnesses";
export const settingsSectionIds = [
  "general",
  "account",
  "organization",
  "members",
  "workgroups",
  "team-agents",
  "appearance",
  "conversation",
  "accessibility",
  "providers",
  "data",
  "shortcuts",
  "about",
  "security",
  "organization-providers",
  "activity",
] as const;
export type SettingsSectionId = (typeof settingsSectionIds)[number];
const settingsTabs = ["overview", "members", "access", "invitations"] as const;

export function isSettingsSection(value: unknown): value is SettingsSectionId {
  return settingsSectionIds.some((section) => section === value);
}

export function validateSettingsSearch(search: Record<string, unknown>): {
  settings?: SettingsSectionId;
  provider?: HarnessId;
  workgroup?: string;
  settingsTab?: (typeof settingsTabs)[number];
  setting?: string;
} {
  return {
    settings: isSettingsSection(search.settings) ? search.settings : undefined,
    provider:
      ["providers", "organization-providers"].includes(String(search.settings)) &&
      isHarness(search.provider)
        ? search.provider
        : undefined,
    workgroup:
      search.settings === "workgroups" &&
      typeof search.workgroup === "string" &&
      /^[a-f0-9-]{36}$/i.test(search.workgroup)
        ? search.workgroup
        : undefined,
    settingsTab: settingsTabs.find((tab) => tab === search.settingsTab),
    setting:
      typeof search.setting === "string" && /^[a-z-]{1,50}$/.test(search.setting)
        ? search.setting
        : undefined,
  };
}
