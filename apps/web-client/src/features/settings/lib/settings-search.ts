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
] as const;
export type SettingsSectionId = (typeof settingsSectionIds)[number];

export function isSettingsSection(value: unknown): value is SettingsSectionId {
  return settingsSectionIds.some((section) => section === value);
}

export function validateSettingsSearch(search: Record<string, unknown>): {
  settings?: SettingsSectionId;
  provider?: HarnessId;
} {
  return {
    settings: isSettingsSection(search.settings) ? search.settings : undefined,
    provider:
      search.settings === "providers" && isHarness(search.provider) ? search.provider : undefined,
  };
}
