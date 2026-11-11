export const settingsSectionIds = [
  "general",
  "appearance",
  "conversation",
  "accessibility",
  "providers",
  "apps",
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
  provider?: "codex" | "muse";
} {
  return {
    settings: isSettingsSection(search.settings) ? search.settings : undefined,
    provider:
      search.settings === "providers" && (search.provider === "codex" || search.provider === "muse")
        ? search.provider
        : undefined,
  };
}
