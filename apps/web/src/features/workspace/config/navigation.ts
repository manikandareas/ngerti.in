import {
  CalendarClock,
  Compass,
  FolderOpen,
  Gauge,
  ListTodo,
  MessageCircle,
  Settings2,
  Target,
} from "lucide-react";
import type { WorkspaceView } from "@/features/workspace/types";

export const workspaceLinks = [
  { view: "chat", label: "Percakapan", icon: MessageCircle },
  { view: "tasks", label: "Task", icon: ListTodo },
  { view: "goals", label: "Tujuan", icon: Target },
  { view: "schedules", label: "Jadwal", icon: CalendarClock },
  { view: "files", label: "Library", icon: FolderOpen },
  { view: "capabilities", label: "Kemampuan Gwen", icon: Compass },
  { view: "usage", label: "Penggunaan", icon: Gauge },
  { view: "settings", label: "Pengaturan", icon: Settings2 },
] as const;

export const workspaceDescriptions: Record<Exclude<WorkspaceView, "chat">, string> = {
  tasks: "Titipkan pekerjaan, ikuti progres, dan tinjau keputusanmu.",
  goals: "Tentukan tujuan, tinjau bukti kemajuan, dan pilih langkah berikutnya.",
  schedules: "Atur pekerjaan sekali atau berulang, lalu temukan hasilnya saat kamu kembali.",
  files: "Temukan kembali file dan hasilmu, atau minta Gwen mencarinya lewat chat.",
  capabilities: "Kenali bantuan yang bisa kamu gunakan dan yang sedang disiapkan.",
  usage: "Pantau penggunaanmu tanpa meninggalkan percakapan.",
  settings: "Atur pengalamanmu bersama Gwen.",
};

// Keep the complete registry above for existing deep links.
export const primaryWorkspaceLinks = workspaceLinks.filter(({ view }) =>
  ["chat", "goals", "files", "settings"].includes(view),
);
