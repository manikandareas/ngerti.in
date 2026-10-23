import { UserButton } from "@clerk/tanstack-react-start";
import {
  ArrowLeft,
  ChevronRight,
  CircleHelp,
  Gauge,
  Globe,
  Settings2,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { BrowserSettings } from "@/features/computer/components/browser-settings";
import { ProactivitySettings } from "@/features/proactivity/components/proactivity-settings";
import { UsagePanel } from "@/features/quotas/components/usage-panel";
import { cn } from "@/lib/utils";
import { Capabilities } from "./capabilities";
import { SettingsUsageSummary } from "./settings-usage-summary";

const categories = [
  ["general", "Umum", Settings2],
  ["usage", "Penggunaan & paket", Gauge],
  ["proactivity", "Proaktivitas", Sparkles],
  ["data", "Browser & data", Globe],
  ["permissions", "Izin", ShieldCheck],
  ["help", "Bantuan", CircleHelp],
] as const;
export type SettingsCategory = (typeof categories)[number][0];

export function SettingsPanel({
  initialCategory = "general",
  mobile = false,
  onClose,
  onDirtyChange,
}: {
  initialCategory?: SettingsCategory;
  mobile?: boolean;
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [category, setActiveCategory] = useState<SettingsCategory | null>(
    mobile && initialCategory === "general" ? null : initialCategory,
  );
  const content = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const navigation = useRef<HTMLElement>(null);
  const lastCategory = useRef(initialCategory);
  useEffect(() => {
    if (!mobile) return;
    if (category) heading.current?.focus();
    else
      navigation.current
        ?.querySelector<HTMLButtonElement>(`[data-category="${lastCategory.current}"]`)
        ?.focus();
  }, [category, mobile]);
  function setCategory(value: SettingsCategory) {
    lastCategory.current = value;
    setActiveCategory(value);
    content.current?.scrollTo(0, 0);
  }
  return (
    <div className={cn("flex min-h-0 flex-1", mobile ? "flex-col" : "flex-row")}>
      <nav
        ref={navigation}
        aria-label="Kategori pengaturan"
        className={cn(
          "shrink-0 overflow-y-auto p-4",
          mobile ? "min-h-0 flex-1" : "w-60 border-r",
          mobile && category !== null && "hidden",
        )}
      >
        <div className="mb-4 flex h-10 items-center justify-between px-3">
          <h2 className="text-base font-bold">Pengaturan</h2>
          {mobile && (
            <Button variant="ghost" size="icon" aria-label="Tutup pengaturan" onClick={onClose}>
              <X />
            </Button>
          )}
        </div>
        <div className="space-y-1">
          {categories.map(([value, label, Icon]) => (
            <Button
              key={value}
              data-category={value}
              variant={!mobile && category === value ? "secondary" : "ghost"}
              className={cn("w-full justify-start gap-3 px-3 text-left", mobile ? "h-14" : "h-11")}
              aria-current={category === value ? "page" : undefined}
              onClick={() => setCategory(value)}
            >
              <Icon aria-hidden="true" className="size-5" />
              <span className="flex-1">{label}</span>
              {mobile && (
                <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
              )}
            </Button>
          ))}
        </div>
      </nav>
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col",
          mobile && category === null && "hidden",
        )}
      >
        <header className="flex h-18 shrink-0 items-center gap-3 px-5 min-[701px]:px-6">
          {mobile && (
            <Button
              variant="secondary"
              size="icon"
              className="rounded-full"
              aria-label="Kembali ke pengaturan"
              onClick={() => setActiveCategory(null)}
            >
              <ArrowLeft />
            </Button>
          )}
          <h2
            ref={heading}
            tabIndex={-1}
            className="min-w-0 flex-1 text-base font-bold outline-none"
          >
            {categories.find(([value]) => value === category)?.[1]}
          </h2>
          <Button variant="ghost" size="icon" aria-label="Tutup pengaturan" onClick={onClose}>
            <X />
          </Button>
        </header>
        <div
          ref={content}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 min-[701px]:px-6"
        >
          <div hidden={category !== "general"} className="space-y-6">
            <section className="flex items-center justify-between gap-4 border-b pb-6">
              <div>
                <h3 className="font-bold">Akun</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Profil, keamanan akun, dan keluar.
                </p>
              </div>
              <div className="shrink-0">
                <UserButton />
              </div>
            </section>
            <SettingsUsageSummary />
            <section className="flex items-center justify-between gap-4 border-b pb-6">
              <div>
                <h3 className="font-bold">Tampilan</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Mode terang atau gelap pada perangkat ini.
                </p>
              </div>
              <ThemeToggle />
            </section>
            <section>
              <h3 className="font-bold">Bahasa & waktu</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Antarmuka menggunakan Bahasa Indonesia. Kamu bisa meminta Gwen berbicara dalam
                bahasa pilihanmu lewat chat.
              </p>
              <p className="mt-2 text-sm">
                Zona waktu perangkat: {Intl.DateTimeFormat().resolvedOptions().timeZone}
              </p>
            </section>
          </div>
          {category === "usage" && <UsagePanel />}
          {/* Keep the form mounted across categories so unsaved preferences survive navigation. */}
          <div hidden={category !== "proactivity"}>
            <ProactivitySettings className="py-0" onDirtyChange={onDirtyChange} />
          </div>
          {category === "data" && (
            <div className="space-y-5">
              <p className="text-sm text-muted-foreground">
                Profil browser dan file hasil dikelola terpisah. Kelola file yang kamu unggah dan
                hasil pekerjaan melalui Library.
              </p>
              <details className="rounded-2xl bg-muted/60 px-5">
                <summary className="cursor-pointer py-4 font-medium">
                  Profil browser & penghapusan login
                </summary>
                <BrowserSettings className="pt-0 pb-5" />
              </details>
            </div>
          )}
          {category === "permissions" && (
            <div className="space-y-4 rounded-2xl bg-muted/60 p-5 text-sm">
              <p>
                Permintaan persetujuan ditampilkan pada pekerjaan terkait dan panel asisten →
                Persetujuan.
              </p>
              <p className="text-muted-foreground">
                Tinjau tindakan dan konsekuensinya sebelum menyetujui atau menolak. Membuka
                pengaturan tidak memberi izin baru atau mengubah pilihanmu.
              </p>
            </div>
          )}
          {category === "help" && <Capabilities />}
        </div>
      </div>
    </div>
  );
}
