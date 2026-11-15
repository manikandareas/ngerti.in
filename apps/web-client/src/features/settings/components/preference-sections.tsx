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
    <SettingsSection title="Saat aplikasi dibuka">
      <SettingsRow title="Percakapan awal">
        <Choice
          label="Percakapan awal"
          value={preferences.startup}
          options={[
            { value: "last", label: "Percakapan terakhir" },
            { value: "tobi", label: "Agent awal" },
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
      <SettingsSection title="Tampilan aplikasi">
        <SettingsRow title="Tema">
          <ThemeSelect />
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="Area baca">
        <SettingsRow title="Ukuran teks percakapan">
          <Choice
            label="Ukuran teks percakapan"
            value={preferences.textSize}
            options={[
              { value: "small", label: "Kecil" },
              { value: "default", label: "Standar" },
              { value: "large", label: "Besar" },
            ]}
            onChange={(value) => update("textSize", value)}
          />
        </SettingsRow>
        <SettingsRow title="Lebar percakapan">
          <Choice
            label="Lebar percakapan"
            value={preferences.readingWidth}
            options={[
              { value: "comfortable", label: "Nyaman dibaca" },
              { value: "wide", label: "Lebar" },
            ]}
            onChange={(value) => update("readingWidth", value)}
          />
        </SettingsRow>
      </SettingsSection>
      <section
        className="settings-reading-preview"
        aria-label="Pratinjau ukuran teks"
        data-size={preferences.textSize}
      >
        Mulai dari sebuah percakapan. Berikan tugas, tanyakan sesuatu, atau lanjutkan pekerjaan
        bersama agent.
      </section>
    </>
  );
}

export function ConversationSettings() {
  const { preferences, update } = usePreferences();
  return (
    <SettingsSection title="Menulis dan membaca">
      <SettingsRow
        title="Kirim pesan dengan"
        description="Shift + Enter selalu membuat baris baru."
      >
        <Choice
          label="Kirim pesan dengan"
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
        title="Perhalus teks yang masuk"
        description="Tampilkan jawaban yang sedang ditulis dengan transisi singkat."
      />
      <PreferenceToggle
        setting="showTimestamps"
        title="Tampilkan waktu pesan"
        description="Tampilkan jam pada pesan dan aktivitas percakapan."
      />
    </SettingsSection>
  );
}

export function AccessibilitySettings() {
  return (
    <SettingsSection title="Gerakan dan interaksi">
      <PreferenceToggle
        setting="animateAvatars"
        title="Animasi avatar"
        description="Izinkan gerakan avatar. Preferensi kurangi gerakan dari perangkat tetap dihormati."
      />
      <PreferenceToggle
        setting="followPointer"
        title="Avatar mengikuti kursor"
        description="Arahkan tatapan avatar mengikuti gerakan kursor."
      />
      <PreferenceToggle
        setting="alwaysShowActions"
        title="Selalu tampilkan aksi pesan"
        description="Tampilkan tombol salin dan aksi lain tanpa perlu mengarahkan kursor ke pesan."
      />
    </SettingsSection>
  );
}

export function KeyboardSettings() {
  const { preferences } = usePreferences();
  const send = preferences.sendShortcut === "enter" ? "Enter" : "⌘ / Ctrl + Enter";
  const items = [
    ["Kirim pesan", send],
    ["Baris baru", "Shift + Enter"],
    ["Urungkan pengetikan", "⌘ / Ctrl + Z"],
    ["Salin teks yang dipilih", "⌘ / Ctrl + C"],
    ["Pilih anggota grup", "@"],
    ["Cari skills", "/"],
    ["Tutup menu atau batalkan editor", "Esc"],
  ];
  return (
    <SettingsSection title="Saat menulis pesan">
      {items.map(([title, shortcut]) => (
        <SettingsRow key={title} title={title}>
          <Kbd>{shortcut}</Kbd>
        </SettingsRow>
      ))}
    </SettingsSection>
  );
}
