import { UserButton } from "@clerk/tanstack-react-start";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Bot, Menu, MessageSquare, Plug, Settings2, Sparkles } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export type SettingsSection = "providers" | "apps" | "research" | "media";
export function SettingsShell({
  section,
  onSection,
  children,
}: {
  section: SettingsSection;
  onSection: (section: SettingsSection) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const navigation = (
    <div className="flex h-full flex-col gap-6 px-3 py-5">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" className="size-8">
          <Link to="/" aria-label="Kembali ke percakapan">
            <ArrowLeft />
          </Link>
        </Button>
        <span className="text-base font-semibold">Settings</span>
      </div>
      <nav aria-label="Settings" className="space-y-1">
        {(
          [
            { id: "providers", label: "AI providers", icon: Sparkles },
            { id: "apps", label: "Connections", icon: Plug },
            { id: "research", label: "Riset internet", icon: Settings2 },
            { id: "media", label: "Gambar, video & suara", icon: Sparkles },
          ] as const
        ).map((item) => (
          <Button
            key={item.id}
            variant="ghost"
            className={`h-9 w-full justify-start gap-2.5 px-3 text-sm ${section === item.id ? "bg-accent text-accent-foreground font-medium" : "font-medium"}`}
            aria-current={section === item.id ? "page" : undefined}
            onClick={() => {
              onSection(item.id);
              setOpen(false);
            }}
          >
            <item.icon />
            {item.label}
          </Button>
        ))}
        <Button asChild variant="ghost" className="h-9 w-full justify-start gap-2.5 px-3 text-sm">
          <Link to="/agents">
            <Bot />
            Agents
          </Link>
        </Button>
        <Button asChild variant="ghost" className="h-9 w-full justify-start gap-2.5 px-3 text-sm">
          <Link to="/">
            <MessageSquare />
            Chat
          </Link>
        </Button>
      </nav>
      <div className="mt-auto flex items-center gap-3 text-sm">
        <div className="size-8 shrink-0">
          <UserButton />
        </div>
        <span>Akun saya</span>
      </div>
    </div>
  );
  return (
    <div className="app-frame settings-frame">
      <aside className="hidden w-[232px] shrink-0 md:block">{navigation}</aside>
      <div className="app-surface">
        <header className="flex items-center gap-3 border-b p-3 md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Buka Settings">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left">
              <SheetTitle className="sr-only">Settings</SheetTitle>
              <SheetDescription className="sr-only">
                Provider AI, aplikasi dan pengaturan layanan.
              </SheetDescription>
              {navigation}
            </SheetContent>
          </Sheet>
          <span className="text-sm font-medium">Settings</span>
        </header>
        <main
          id="main"
          className="settings-content min-h-0 flex-1 overflow-y-auto px-5 py-8 sm:px-8 lg:px-12 lg:py-10"
        >
          <div className="mx-auto w-full max-w-3xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
