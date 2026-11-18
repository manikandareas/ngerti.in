import { Kbd } from "@/components/ui/kbd";
import { Switch } from "@/components/ui/switch";
import { SettingsRow, SettingsSection } from "@/features/settings/components/shared";
import { ThemeSelect } from "@/features/settings/components/theme-select";
import { type Preferences, usePreferences } from "@/hooks/use-preferences";

type ToggleKey = {
  [K in keyof Preferences]: Preferences[K] extends boolean ? K : never;
}[keyof Preferences];

export function PreferenceToggle({
  setting,
  title,
  description,
}: {
  setting: ToggleKey;
  title: string;
  description: string;
}) {
  const { preferences, update } = usePreferences();
  return (
    <SettingsRow title={title} description={description}>
      <Switch
        aria-label={title}
        checked={preferences[setting]}
        onCheckedChange={(value) => update(setting, value)}
      />
    </SettingsRow>
  );
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <select
      className="settings-select"
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function GeneralSettings() {
  const { preferences, update } = usePreferences();
  return (
    <SettingsSection title="General">
      <SettingsRow title="Default conversation">
        <Choice
          label="Default conversation"
          value={preferences.startup}
          options={[
            { value: "last", label: "Last conversation" },
            { value: "tobi", label: "Default agent" },
          ]}
          onChange={(value) => update("startup", value)}
        />
      </SettingsRow>
    </SettingsSection>
  );
}

export function AppearanceSettings() {
  const { preferences, update } = usePreferences();
  return (
    <>
      <SettingsSection title="Appearance">
        <SettingsRow title="Theme">
          <ThemeSelect />
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="Reading">
        <SettingsRow title="Conversation text size">
          <Choice
            label="Conversation text size"
            value={preferences.textSize}
            options={[
              { value: "small", label: "Small" },
              { value: "default", label: "Default" },
              { value: "large", label: "Large" },
            ]}
            onChange={(value) => update("textSize", value)}
          />
        </SettingsRow>
        <SettingsRow title="Conversation width">
          <Choice
            label="Conversation width"
            value={preferences.readingWidth}
            options={[
              { value: "comfortable", label: "Comfortable" },
              { value: "wide", label: "Wide" },
            ]}
            onChange={(value) => update("readingWidth", value)}
          />
        </SettingsRow>
      </SettingsSection>
      <section
        className="settings-reading-preview"
        aria-label="Text size preview"
        data-size={preferences.textSize}
      >
        Start with a conversation. Share a task, ask a question, or pick up where you left off with
        your agent.
      </section>
    </>
  );
}

export function ConversationSettings() {
  const { preferences, update } = usePreferences();
  return (
    <SettingsSection title="Conversation">
      <SettingsRow title="Send messages with" description="Shift + Enter always adds a new line.">
        <Choice
          label="Send messages with"
          value={preferences.sendShortcut}
          options={[
            { value: "enter", label: "Enter" },
            { value: "mod-enter", label: "⌘ / Ctrl + Enter" },
          ]}
          onChange={(value) => update("sendShortcut", value)}
        />
      </SettingsRow>
      <PreferenceToggle
        setting="smoothStreaming"
        title="Smooth streaming"
        description="Display incoming text with a short, smooth transition."
      />
      <PreferenceToggle
        setting="showTimestamps"
        title="Show timestamps"
        description="Show the time on messages and conversation activity."
      />
    </SettingsSection>
  );
}

export function AccessibilitySettings() {
  return (
    <SettingsSection title="Accessibility">
      <PreferenceToggle
        setting="animateAvatars"
        title="Animate avatars"
        description="Allow avatar motion while respecting your device’s reduced motion preference."
      />
      <PreferenceToggle
        setting="followPointer"
        title="Avatars follow the pointer"
        description="Let avatars look toward your pointer."
      />
      <PreferenceToggle
        setting="alwaysShowActions"
        title="Always show message actions"
        description="Show copy and other actions without hovering over a message."
      />
    </SettingsSection>
  );
}

export function KeyboardSettings() {
  const { preferences } = usePreferences();
  const send = preferences.sendShortcut === "enter" ? "Enter" : "⌘ / Ctrl + Enter";
  const items = [
    ["Send message", send],
    ["New line", "Shift + Enter"],
    ["Undo typing", "⌘ / Ctrl + Z"],
    ["Copy selected text", "⌘ / Ctrl + C"],
    ["Mention a group member", "@"],
    ["Find skills", "/"],
    ["Close a menu or cancel editing", "Esc"],
  ];
  return (
    <SettingsSection title="Writing messages">
      {items.map(([title, shortcut]) => (
        <SettingsRow key={title} title={title}>
          <Kbd>{shortcut}</Kbd>
        </SettingsRow>
      ))}
    </SettingsSection>
  );
}
