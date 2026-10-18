import { Compass, Gauge, ListTodo, MessageCircle, Settings2 } from "lucide-react";

export type WorkspaceView = "chat" | "tasks" | "capabilities" | "usage" | "settings";

export const workspaceLinks = [
  { view: "chat", label: "Percakapan", icon: MessageCircle },
  { view: "tasks", label: "Task", icon: ListTodo },
  { view: "capabilities", label: "Kemampuan Gwen", icon: Compass },
  { view: "usage", label: "Penggunaan", icon: Gauge },
  { view: "settings", label: "Pengaturan", icon: Settings2 },
] as const;
