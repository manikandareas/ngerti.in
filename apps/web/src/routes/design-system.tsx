import { useAuth } from "@clerk/tanstack-react-start";
import { createFileRoute, Link } from "@tanstack/react-router";
import { LoaderCircle, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Brand } from "@/components/brand";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, NativeChoice } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AuthPage } from "@/features/auth/components/auth-page";

export const Route = createFileRoute("/design-system")({ component: DesignSystemRoute });
function DesignSystemRoute() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded)
    return (
      <main id="main" aria-busy="true">
        Memuat katalog…
      </main>
    );
  if (!isSignedIn) return <AuthPage />;
  return <DesignSystem />;
}

function DesignSystem() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.dataset.theme === "dark");
  }, []);
  const [feedback, setFeedback] = useState("Pilih tindakan untuk mencoba komponen.");
  return (
    <main id="main" className="mx-auto max-w-6xl space-y-10 px-4 py-8 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Brand />
        <div className="flex items-center gap-3">
          <Link to="/agents" className="text-sm underline">
            Kembali ke agent
          </Link>
          <Button
            variant="outline"
            size="icon"
            aria-label="Ganti tema"
            onClick={() => {
              const theme = dark ? "light" : "dark";
              document.documentElement.dataset.theme = theme;
              localStorage.setItem("ngertiin-theme", theme);
              setDark(!dark);
            }}
          >
            {dark ? <Sun /> : <Moon />}
          </Button>
        </div>
      </header>
      <section className="space-y-3">
        <Badge variant="secondary">Fondasi antarmuka</Badge>
        <h1>Komponen Ngertiin</h1>
        <p className="max-w-2xl text-muted-foreground">
          Katalog interaktif untuk memeriksa tampilan, keyboard, dan state komponen bersama. Semua
          contoh di sini hanya mengubah pratinjau.
        </p>
      </section>
      <section aria-labelledby="actions" className="space-y-4">
        <h2 id="actions">Tindakan</h2>
        <div className="flex flex-wrap items-center gap-3">
          {(["default", "secondary", "outline", "ghost", "destructive", "link"] as const).map(
            (variant) => (
              <Button
                key={variant}
                variant={variant}
                onClick={() => setFeedback(`Tombol ${variant} dipilih.`)}
              >
                {variant}
              </Button>
            ),
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">Kecil</Button>
          <Button>Default</Button>
          <Button size="lg">Besar</Button>
          <Button disabled>Dinonaktifkan</Button>
          <Button loading>
            <LoaderCircle className="animate-spin" />
            Menyimpan…
          </Button>
          <Button aria-invalid="true">Perlu diperiksa</Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Arahkan pointer untuk hover, tahan klik untuk pressed, atau tekan Tab untuk focus.
        </p>
        <p role="status" className="text-sm">
          {feedback}
        </p>
      </section>
      <section aria-labelledby="fields" className="space-y-4">
        <h2 id="fields">Input dan pilihan</h2>
        <div className="grid gap-5 md:grid-cols-2">
          <label className="space-y-2 text-sm">
            Nama
            <Input placeholder="Nama agent" />
          </label>
          <label className="space-y-2 text-sm">
            Terisi
            <Input defaultValue="Tobi" />
          </label>
          <div className="space-y-2 text-sm">
            <label htmlFor="invalid-email">Email</label>
            <Input
              id="invalid-email"
              type="email"
              defaultValue="alamat"
              aria-invalid="true"
              aria-describedby="email-error"
            />
            <p id="email-error" className="text-danger">
              Masukkan alamat email yang valid.
            </p>
          </div>
          <label className="space-y-2 text-sm">
            Tidak tersedia
            <Input disabled placeholder="Akses belum diberikan" />
          </label>
          <label className="space-y-2 text-sm">
            Instruksi
            <Textarea placeholder="Apa yang ingin Anda kerjakan?" />
          </label>
          <div className="space-y-4">
            <label className="block space-y-2 text-sm">
              Pilihan native
              <NativeSelect defaultValue="dm">
                <option value="dm">DM</option>
                <option value="group">Grup</option>
              </NativeSelect>
            </label>
            <Select defaultValue="tobi">
              <SelectTrigger aria-label="Pilih agent" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tobi">Tobi</SelectItem>
                <SelectItem value="writer">Writer</SelectItem>
                <SelectItem value="unavailable" disabled>
                  Tidak tersedia
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox />
            Aktifkan pilihan
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox defaultChecked />
            Terpilih
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox disabled />
            Tanpa izin
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch />
            Notifikasi
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch disabled />
            Tidak tersedia
          </label>
          <label className="flex items-center gap-2 text-sm">
            <NativeChoice type="radio" name="sample" defaultChecked />
            DM
          </label>
          <label className="flex items-center gap-2 text-sm">
            <NativeChoice type="radio" name="sample" />
            Grup
          </label>
        </div>
      </section>
      <section aria-labelledby="overlays" className="space-y-4">
        <h2 id="overlays">Dialog dan navigasi</h2>
        <div className="flex flex-wrap gap-3">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">Buka dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit pratinjau</DialogTitle>
                <DialogDescription>
                  Escape menutup dialog dan mengembalikan fokus ke pemicu.
                </DialogDescription>
              </DialogHeader>
              <label className="space-y-2 text-sm">
                Nama pratinjau
                <Input defaultValue="Tobi" />
              </label>
              <DialogFooter>
                <DialogClose asChild>
                  <Button>Selesai</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline">Buka panel</Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Panel kontekstual</SheetTitle>
                <SheetDescription>Konten tetap dapat dibaca pada layar kecil.</SheetDescription>
              </SheetHeader>
              <p className="px-4">Gunakan Escape untuk kembali ke katalog.</p>
            </SheetContent>
          </Sheet>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">Buka menu</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={() => setFeedback("Edit dipilih dari menu.")}>
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem disabled>Arsipkan (tanpa izin)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">Buka popover</Button>
            </PopoverTrigger>
            <PopoverContent className="max-w-[calc(100vw-2rem)]">
              <label className="space-y-2 text-sm">
                Cari
                <Input placeholder="Cari komponen" />
              </label>
            </PopoverContent>
          </Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost">Petunjuk</Button>
            </TooltipTrigger>
            <TooltipContent>Terlihat dengan pointer atau keyboard.</TooltipContent>
          </Tooltip>
        </div>
        <Tabs defaultValue="overview">
          <TabsList aria-label="Bagian katalog">
            <TabsTrigger value="overview">Ringkasan</TabsTrigger>
            <TabsTrigger value="details">Detail</TabsTrigger>
            <TabsTrigger value="disabled" disabled>
              Tanpa izin
            </TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <p className="py-3 text-sm">Gunakan panah kiri dan kanan untuk berpindah tab.</p>
          </TabsContent>
          <TabsContent value="details">
            <p className="py-3 text-sm">Konten detail ditampilkan.</p>
          </TabsContent>
        </Tabs>
        <Accordion type="single" collapsible>
          <AccordionItem value="keyboard">
            <AccordionTrigger>Bagaimana menggunakan keyboard?</AccordionTrigger>
            <AccordionContent>
              Tab untuk berpindah kontrol, Enter atau Space untuk mengaktifkan, Escape untuk menutup
              overlay.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>
      <section aria-labelledby="states" className="space-y-4">
        <h2 id="states">Feedback dan state</h2>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">Netral</Badge>
          <Badge className="bg-accent text-accent-foreground">Baru</Badge>
          <Badge className="bg-success text-success-foreground">Terhubung</Badge>
          <Badge className="bg-warning text-warning-foreground">Perlu diperiksa</Badge>
          <Badge variant="destructive">Gagal</Badge>
        </div>
        <Alert>
          <AlertTitle>Belum ada hasil</AlertTitle>
          <AlertDescription>Hasil pekerjaan akan muncul di sini setelah tersedia.</AlertDescription>
        </Alert>
        <div role="status" aria-label="Memuat hasil" aria-busy="true" className="space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <span className="sr-only">Memuat hasil…</span>
        </div>
        <Alert variant="destructive">
          <AlertTitle>Hasil belum dapat dimuat</AlertTitle>
          <AlertDescription>Coba kembali setelah koneksi tersedia.</AlertDescription>
        </Alert>
        <Alert className="border-warning-border bg-warning text-warning-foreground">
          <AlertTitle>Izin diperlukan</AlertTitle>
          <AlertDescription className="text-warning-foreground">
            Hubungkan akun agar tindakan ini tersedia.
          </AlertDescription>
        </Alert>
      </section>
    </main>
  );
}
