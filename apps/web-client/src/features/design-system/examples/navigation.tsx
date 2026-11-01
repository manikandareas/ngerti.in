import { Add01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { toast } from "sonner";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarTrigger,
} from "@/components/ui/menubar";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  type ExampleProps,
  type ExampleSet,
  renderExample,
} from "@/features/design-system/examples/shared";

function PaginationExample() {
  const [page, setPage] = useState(1);
  return (
    <div className="space-y-4">
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href="#pagination-demo"
              onClick={(event) => {
                event.preventDefault();
                setPage((value) => Math.max(1, value - 1));
              }}
            />
          </PaginationItem>
          {[1, 2, 3].map((value) => (
            <PaginationItem key={value}>
              <PaginationLink
                href="#pagination-demo"
                aria-label={`Halaman ${value}`}
                isActive={page === value}
                onClick={(event) => {
                  event.preventDefault();
                  setPage(value);
                }}
              >
                {value}
              </PaginationLink>
            </PaginationItem>
          ))}
          <PaginationItem>
            <PaginationNext
              href="#pagination-demo"
              onClick={(event) => {
                event.preventDefault();
                setPage((value) => Math.min(3, value + 1));
              }}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
      <p id="pagination-demo" className="text-center text-sm text-muted-foreground">
        Halaman {page} dari 3
      </p>
    </div>
  );
}

function SidebarExample() {
  const [active, setActive] = useState("Percakapan");
  return (
    <div className="relative h-80 overflow-hidden rounded-lg border">
      <SidebarProvider className="h-full min-h-0">
        <Sidebar collapsible="icon" className="absolute h-full">
          <SidebarHeader className="font-medium">Ngertiin</SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Workspace</SidebarGroupLabel>
              <SidebarMenu>
                {[
                  { name: "Percakapan", icon: Add01Icon },
                  { name: "Pencarian", icon: Search01Icon },
                ].map((item) => (
                  <SidebarMenuItem key={item.name}>
                    <SidebarMenuButton
                      isActive={active === item.name}
                      onClick={() => setActive(item.name)}
                    >
                      <HugeiconsIcon icon={item.icon} strokeWidth={2} aria-hidden="true" />
                      <span>{item.name}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
        <div className="min-w-0 flex-1 p-4">
          <SidebarTrigger />
          <p className="mt-4 text-sm">{active}</p>
          <p className="mt-2 text-caption text-muted-foreground">
            Gunakan toggle untuk mencoba sidebar.
          </p>
        </div>
      </SidebarProvider>
    </div>
  );
}

const examples = {
  breadcrumb: () => (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="/">Beranda</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink href="/design-system">Design system</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>Breadcrumb</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  ),
  menubar: () => (
    <Menubar>
      <MenubarMenu>
        <MenubarTrigger>File</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onSelect={() => toast("File baru dipilih")}>File baru</MenubarItem>
          <MenubarItem onSelect={() => toast("Buka file dipilih")}>Buka</MenubarItem>
          <MenubarSeparator />
          <MenubarItem disabled>Ekspor</MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger>Edit</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onSelect={() => toast("Undo dipilih")}>Undo</MenubarItem>
          <MenubarItem onSelect={() => toast("Redo dipilih")}>Redo</MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  ),
  "navigation-menu": () => (
    <NavigationMenu viewport={false}>
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuTrigger>Komponen</NavigationMenuTrigger>
          <NavigationMenuContent className="w-52">
            <NavigationMenuLink href="/design-system?component=button">Button</NavigationMenuLink>
            <NavigationMenuLink href="/design-system?component=input">Input</NavigationMenuLink>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuLink href="/design-system">Fondasi</NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  ),
  pagination: PaginationExample,
  sidebar: SidebarExample,
  tabs: () => (
    <Tabs defaultValue="overview">
      <TabsList aria-label="Preview tabs">
        <TabsTrigger value="overview">Ringkasan</TabsTrigger>
        <TabsTrigger value="activity">Aktivitas</TabsTrigger>
        <TabsTrigger value="disabled" disabled>
          Nonaktif
        </TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="rounded-lg border p-4">
        Ringkasan agent dan percakapan.
      </TabsContent>
      <TabsContent value="activity" className="rounded-lg border p-4">
        Semua aktivitas sudah selesai.
      </TabsContent>
    </Tabs>
  ),
  command: () => (
    <Command className="rounded-lg border">
      <CommandInput placeholder="Cari aksi…" />
      <CommandList>
        <CommandEmpty>Tidak ada hasil.</CommandEmpty>
        <CommandGroup heading="Aksi">
          <CommandItem onSelect={() => toast("Percakapan baru dipilih")}>
            Percakapan baru
          </CommandItem>
          <CommandItem onSelect={() => toast("Pengaturan dipilih")}>Pengaturan</CommandItem>
          <CommandItem disabled>Arsip</CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  ),
} satisfies ExampleSet;

export default function NavigationExamples({ name }: ExampleProps) {
  return renderExample(examples, name);
}
