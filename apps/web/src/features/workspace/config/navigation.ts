import { Compass, FolderOpen, Gauge, ListTodo, MessageCircle, Settings2 } from "lucide-react";
import type { WorkspaceView } from "@/features/workspace/types";

export const workspaceLinks = [
  { view: "chat", label: "Percakapan", icon: MessageCircle },
  { view: "tasks", label: "Task", icon: ListTodo },
  { view: "files", label: "File & hasil", icon: FolderOpen },
  { view: "capabilities", label: "Kemampuan Gwen", icon: Compass },
  { view: "usage", label: "Penggunaan", icon: Gauge },
  { view: "settings", label: "Pengaturan", icon: Settings2 },
] as const;

export const workspaceDescriptions: Record<Exclude<WorkspaceView, "chat">, string> = {
  tasks: "Titipkan pekerjaan, ikuti progres, dan tinjau keputusanmu.",
  files: "Buka file, periksa revision, unduh hasil, atau hapus yang tidak diperlukan.",
  capabilities: "Kenali bantuan yang bisa kamu gunakan dan yang sedang disiapkan.",
  usage: "Pantau penggunaanmu tanpa meninggalkan percakapan.",
  settings: "Atur pengalamanmu bersama Gwen.",
};
