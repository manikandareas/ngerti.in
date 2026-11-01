import {
  Add01Icon,
  Alert02Icon,
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ThemeSwitcher } from "@/components/theme-switcher";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CodeBlock,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockTitle,
} from "@/components/ui/code-block";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { components } from "@/lib/component-catalog";

const swatches = [
  { name: "Canvas", token: "background", className: "bg-background" },
  { name: "Surface", token: "card", className: "bg-card" },
  { name: "Subtle", token: "muted", className: "bg-muted" },
  { name: "Raised", token: "popover", className: "bg-popover" },
  { name: "Primary", token: "primary", className: "bg-primary" },
  { name: "Soft blue", token: "accent", className: "bg-accent" },
];

function HomePage() {
  return (
    <div className="mx-auto flex min-h-svh max-w-content flex-col gap-10 px-6 py-8 sm:px-10 sm:py-12">
      <header className="flex flex-wrap items-center justify-between gap-6">
        <a href="#main" className="inline-flex items-center gap-3 font-medium">
          <span className="grid size-9 place-items-center rounded-control bg-primary-gradient text-primary-foreground">
            <HugeiconsIcon icon={Add01Icon} size={20} strokeWidth={2} aria-hidden="true" />
          </span>
          <span>
            Ngertiin <span className="font-normal text-muted-foreground">/ web-client</span>
          </span>
        </a>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" asChild>
            <Link to="/design-system">Design system</Link>
          </Button>
          <ThemeSwitcher />
        </div>
      </header>

      <main id="main" className="space-y-8">
        <div className="space-y-3">
          <p className="font-mono text-caption uppercase tracking-wider text-link">
            Page 1 · Design system
          </p>
          <h1 className="text-heading-mobile font-medium tracking-tight sm:text-heading">
            Komponen yang konsisten, di setiap tema.
          </h1>
          <p className="max-w-2xl text-muted-foreground">
            Warna, tipografi, dan interaksi dari design system kita. Pilih tema untuk melihat
            komponen dalam tampilan terang atau gelap.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Warna & surface</CardTitle>
            <CardDescription>
              Setiap warna memiliki peran yang sama dalam kedua tema.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {swatches.map(({ name, token, className }) => (
              <div key={token} className="min-w-0 space-y-3">
                <div data-swatch={token} className={`h-20 rounded-md border ${className}`} />
                <div>
                  <p className="text-sm font-medium">{name}</p>
                  <p className="font-mono text-caption text-muted-foreground">{token}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid items-start gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Aksi</CardTitle>
              <CardDescription>Primary, secondary, destructive, dan state.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => toast.success("Komponen siap digunakan.")}>
                  Get started{" "}
                  <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} aria-hidden="true" />
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    document.getElementById("library")?.scrollIntoView({ behavior: "smooth" })
                  }
                >
                  View components
                </Button>
                <Button variant="outline" onClick={() => toast("Tombol outline")}>
                  Outline
                </Button>
                <Button variant="ghost" onClick={() => toast("Tombol ghost")}>
                  Ghost
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button disabled>Disabled</Button>
                <Button disabled aria-busy="true">
                  <Spinner /> Loading
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => toast.error("Contoh aksi destructive.")}
                >
                  Destructive
                </Button>
                <Button variant="link" asChild>
                  <a href="#library">Lihat library</a>
                </Button>
              </div>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline">Buka dialog</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Tampilan yang selaras</DialogTitle>
                    <DialogDescription>
                      Dialog menggunakan surface, border, radius, dan focus ring dari tema yang
                      aktif.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="secondary">Tutup</Button>
                    </DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Form & input</CardTitle>
              <CardDescription>Label, helper, error, dan input nonaktif.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">Work email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  aria-describedby="email-help"
                />
                <p id="email-help" className="text-caption text-muted-foreground">
                  Gunakan alamat email perusahaan.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="invalid-email">Error state</Label>
                <Input
                  id="invalid-email"
                  type="email"
                  defaultValue="alex@"
                  aria-invalid="true"
                  aria-describedby="email-error"
                />
                <p id="email-error" className="text-caption text-destructive">
                  Masukkan alamat email yang valid.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="disabled-input">Disabled state</Label>
                <Input id="disabled-input" disabled value="you@company.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="scope">Access scope</Label>
                <Select defaultValue="office">
                  <SelectTrigger id="scope" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="office">Office access</SelectItem>
                    <SelectItem value="meeting">Meeting rooms</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" placeholder="Tambahkan catatan…" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Selection & status</CardTitle>
              <CardDescription>Kontrol yang jelas dan feedback yang mudah dibaca.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-3">
                <Checkbox id="notify" defaultChecked />
                <Label htmlFor="notify">Kirim notifikasi email</Label>
              </div>
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="renew">Auto-renew credential</Label>
                <Switch id="renew" defaultChecked />
              </div>
              <RadioGroup
                defaultValue="employee"
                aria-label="Tipe credential"
                className="flex flex-wrap gap-6"
              >
                <div className="flex items-center gap-3">
                  <RadioGroupItem id="employee" value="employee" />
                  <Label htmlFor="employee">Employee</Label>
                </div>
                <div className="flex items-center gap-3">
                  <RadioGroupItem id="guest" value="guest" />
                  <Label htmlFor="guest">Guest</Label>
                </div>
              </RadioGroup>
              <div className="flex flex-wrap gap-2">
                <Badge variant="success">Active</Badge>
                <Badge variant="warning">Expiring</Badge>
                <Badge variant="destructive">Revoked</Badge>
                <Badge variant="secondary">Draft</Badge>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-caption">
                  <span>Provisioning</span>
                  <span className="font-mono text-muted-foreground">64%</span>
                </div>
                <Progress value={64} aria-label="Provisioning" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Feedback & navigation</CardTitle>
              <CardDescription>Surface lembut, teks kontras, dan ikon Hugeicons.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <Alert variant="success">
                <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} aria-hidden="true" />
                <AlertTitle>Credential berhasil diterbitkan</AlertTitle>
                <AlertDescription>Employee key sudah siap digunakan.</AlertDescription>
              </Alert>
              <Alert variant="warning">
                <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} aria-hidden="true" />
                <AlertTitle>Credential segera kedaluwarsa</AlertTitle>
                <AlertDescription>Perpanjang akses sebelum masa aktif berakhir.</AlertDescription>
              </Alert>
              <Tabs defaultValue="offices">
                <TabsList aria-label="Use case">
                  <TabsTrigger value="offices">Offices</TabsTrigger>
                  <TabsTrigger value="events">Events</TabsTrigger>
                </TabsList>
                <TabsContent value="offices" className="pt-3 text-muted-foreground">
                  Kelola employee key dan akses ruang kerja.
                </TabsContent>
                <TabsContent value="events" className="pt-3 text-muted-foreground">
                  Kelola guest key dan akses untuk acara.
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        <Card id="library">
          <CardHeader>
            <CardTitle>Library komponen</CardTitle>
            <CardDescription>
              {components.length} komponen shadcn tersedia untuk digunakan.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible>
              <AccordionItem value="components">
                <AccordionTrigger>Lihat semua komponen</AccordionTrigger>
                <AccordionContent>
                  <div className="flex flex-wrap gap-2 pt-3">
                    {components.map((component) => (
                      <Badge key={component} variant="outline" className="font-mono font-normal">
                        {component}
                      </Badge>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
            <CodeBlock className="mt-6">
              <CodeBlockHeader>
                <CodeBlockTitle>Contoh penggunaan</CodeBlockTitle>
                <CodeBlockCopyButton
                  value={'import { Button } from "@/components/ui/button"'}
                  className="ml-auto"
                />
              </CodeBlockHeader>
              <CodeBlockContent>
                {'import { Button } from "@/components/ui/button"'}
              </CodeBlockContent>
            </CodeBlock>
          </CardContent>
        </Card>
      </main>
      <footer className="border-t pt-6 text-caption text-muted-foreground">
        Inter untuk UI. Geist Mono untuk kode. Light dan dark menggunakan fondasi yang sama.
      </footer>
    </div>
  );
}

export default HomePage;
