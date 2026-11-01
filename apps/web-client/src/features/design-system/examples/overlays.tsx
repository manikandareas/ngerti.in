import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type ExampleProps, type ExampleSet, renderExample } from "./shared";

function DropdownExample() {
  const [checked, setChecked] = useState(true);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">Buka menu</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Pengaturan contoh</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => toast("Profil dipilih")}>Profil</DropdownMenuItem>
        <DropdownMenuCheckboxItem checked={checked} onCheckedChange={setChecked}>
          Notifikasi
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>Tidak tersedia</DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={() => toast("Ini contoh aksi hapus.")}>
          Hapus contoh
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const examples = {
  "alert-dialog": () => (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">Hapus contoh</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hapus contoh ini?</AlertDialogTitle>
          <AlertDialogDescription>
            Ini hanya preview. Tidak ada data aplikasi yang dihapus.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => toast.success("Contoh dikonfirmasi")}
          >
            Konfirmasi
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ),
  "context-menu": () => (
    <ContextMenu>
      <ContextMenuTrigger className="flex h-40 items-center justify-center rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Klik kanan atau tekan lama area ini
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => toast("Contoh disalin")}>Salin</ContextMenuItem>
        <ContextMenuItem onSelect={() => toast("Contoh diduplikasi")}>Duplikat</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled>Arsipkan</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  ),
  dialog: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Buka dialog</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit nama agent</DialogTitle>
          <DialogDescription>Contoh dialog dengan input dan focus management.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="demo-dialog-name">Nama</Label>
          <Input id="demo-dialog-name" defaultValue="Tobi" />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Batal</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button onClick={() => toast.success("Contoh disimpan")}>Simpan</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
  drawer: () => (
    <Drawer>
      <DrawerTrigger asChild>
        <Button variant="outline">Buka drawer</Button>
      </DrawerTrigger>
      <DrawerContent>
        <div className="mx-auto w-full max-w-sm">
          <DrawerHeader>
            <DrawerTitle>Detail aktivitas</DrawerTitle>
            <DrawerDescription>Drawer dapat ditutup melalui tombol atau gesture.</DrawerDescription>
          </DrawerHeader>
          <p className="px-4 text-sm text-muted-foreground">
            Semua aktivitas contoh sudah selesai.
          </p>
          <DrawerFooter>
            <DrawerClose asChild>
              <Button>Tutup drawer</Button>
            </DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  ),
  "dropdown-menu": DropdownExample,
  "hover-card": () => (
    <HoverCard>
      <HoverCardTrigger asChild>
        <Button variant="link">Hover profil Tobi</Button>
      </HoverCardTrigger>
      <HoverCardContent>
        <h4 className="font-medium">Tobi</h4>
        <p className="mt-2 text-sm text-muted-foreground">
          Agent personal yang membantu mengelola pekerjaan harian.
        </p>
      </HoverCardContent>
    </HoverCard>
  ),
  popover: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">Pengaturan cepat</Button>
      </PopoverTrigger>
      <PopoverContent>
        <div className="space-y-3">
          <h4 className="font-medium">Judul percakapan</h4>
          <Label htmlFor="demo-popover-title">Judul</Label>
          <Input id="demo-popover-title" defaultValue="Riset produk" />
        </div>
      </PopoverContent>
    </Popover>
  ),
  sheet: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Buka sheet</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Detail agent</SheetTitle>
          <SheetDescription>Konten pendukung tanpa meninggalkan halaman.</SheetDescription>
        </SheetHeader>
        <p className="px-4 text-sm">Tobi · Personal assistant</p>
        <SheetFooter>
          <SheetClose asChild>
            <Button>Tutup sheet</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
  tooltip: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline">Hover atau fokus</Button>
      </TooltipTrigger>
      <TooltipContent>Informasi tambahan yang singkat.</TooltipContent>
    </Tooltip>
  ),
} satisfies ExampleSet;

export default function OverlayExamples({ name }: ExampleProps) {
  return renderExample(examples, name);
}
