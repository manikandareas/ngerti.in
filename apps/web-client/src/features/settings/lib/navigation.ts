import {
  ComputerIcon,
  InformationCircleIcon,
  KeyboardIcon,
  SecurityCheckIcon,
  Settings01Icon,
  Shield01Icon,
  SparklesIcon,
  UserAccountIcon,
  UserGroupIcon,
  WorkHistoryIcon,
} from "@hugeicons/core-free-icons";
import type { SettingsSectionId } from "./settings-search";

export const settingsNavigation = [
  {
    id: "account",
    label: "Account",
    group: "Personal",
    icon: UserAccountIcon,
    keywords: "profile email name akun profil",
  },
  {
    id: "general",
    label: "Preferences",
    group: "Personal",
    icon: Settings01Icon,
    keywords:
      "theme appearance accessibility conversation startup tampilan tema percakapan aksesibilitas",
  },
  {
    id: "security",
    label: "Security & devices",
    group: "Personal",
    icon: SecurityCheckIcon,
    keywords: "sessions browser desktop sign out perangkat sesi keamanan",
  },
  {
    id: "providers",
    label: "AI connections",
    group: "Personal",
    icon: SparklesIcon,
    keywords: "personal provider model codex claude muse pi opencode koneksi",
  },
  {
    id: "data",
    label: "Data & privacy",
    group: "Personal",
    icon: Shield01Icon,
    keywords: "draft export reset storage external memory provider privasi data",
  },
  {
    id: "organization",
    label: "General",
    group: "Organization",
    icon: Settings01Icon,
    keywords: "organization name rename role organisasi",
  },
  {
    id: "members",
    label: "Members",
    group: "Organization",
    icon: UserGroupIcon,
    keywords: "people invite invitations role anggota undang undangan",
  },
  {
    id: "workgroups",
    label: "Workgroups",
    group: "Organization",
    icon: UserGroupIcon,
    keywords: "teams team membership tim anggota access akses",
  },
  {
    id: "team-agents",
    label: "Shared agents",
    group: "Organization",
    icon: SparklesIcon,
    keywords: "team agents audience access agent bersama",
  },
  {
    id: "organization-providers",
    label: "AI connections",
    group: "Organization",
    icon: ComputerIcon,
    keywords: "shared organization provider billing koneksi organisasi",
  },
  {
    id: "activity",
    label: "Activity",
    group: "Organization",
    icon: WorkHistoryIcon,
    keywords: "audit history log aktivitas riwayat",
  },
  {
    id: "shortcuts",
    label: "Keyboard shortcuts",
    group: "Application",
    icon: KeyboardIcon,
    keywords: "keyboard shortcuts pintasan",
  },
  {
    id: "about",
    label: "About",
    group: "Application",
    icon: InformationCircleIcon,
    keywords: "version application tentang",
  },
] satisfies {
  id: SettingsSectionId;
  label: string;
  group: string;
  icon: typeof Settings01Icon;
  keywords: string;
}[];

export const preferenceTargets = [
  { id: "startup", label: "Default conversation", keywords: "startup home default awal" },
  {
    id: "appearance",
    label: "Appearance & theme",
    keywords: "theme light dark system font text size width tampilan tema ukuran teks lebar",
  },
  {
    id: "conversation",
    label: "Conversation",
    keywords: "send enter streaming timestamps kirim pesan waktu",
  },
  {
    id: "accessibility",
    label: "Accessibility",
    keywords: "animation avatar cursor motion animasi aksesibilitas",
  },
];
