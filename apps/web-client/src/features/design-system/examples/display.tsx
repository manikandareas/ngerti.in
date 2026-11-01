import { useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import { toast } from "sonner";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Avatar, AvatarFallback, AvatarGroup } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { DirectionProvider } from "@/components/ui/direction";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type ExampleProps,
  type ExampleSet,
  renderExample,
} from "@/features/design-system/examples/shared";

function ChartExample() {
  return (
    <ChartContainer
      config={{ messages: { label: "Pesan", color: "var(--chart-1)" } }}
      className="h-56 w-full aspect-auto"
    >
      <BarChart
        accessibilityLayer
        data={[
          { day: "Sen", messages: 24 },
          { day: "Sel", messages: 42 },
          { day: "Rab", messages: 32 },
          { day: "Kam", messages: 56 },
          { day: "Jum", messages: 48 },
        ]}
      >
        <CartesianGrid vertical={false} />
        <XAxis dataKey="day" tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="messages" fill="var(--color-messages)" radius={5} />
      </BarChart>
    </ChartContainer>
  );
}

function DirectionExample() {
  const [dir, setDir] = useState<"ltr" | "rtl">("ltr");
  return (
    <div className="space-y-5">
      <Button
        variant="outline"
        onClick={() => setDir((value) => (value === "ltr" ? "rtl" : "ltr"))}
      >
        Ubah arah: {dir.toUpperCase()}
      </Button>
      <DirectionProvider dir={dir}>
        <div dir={dir} className="flex items-center gap-3 rounded-lg border p-4">
          <Avatar>
            <AvatarFallback>AM</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium">Alex Morgan</p>
            <p className="text-sm text-muted-foreground">Arah konten {dir.toUpperCase()}</p>
          </div>
        </div>
      </DirectionProvider>
    </div>
  );
}

const examples = {
  avatar: () => (
    <div className="flex flex-wrap items-center gap-6">
      <Avatar size="sm">
        <AvatarFallback>AM</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback className="bg-accent text-link">TO</AvatarFallback>
      </Avatar>
      <Avatar size="lg">
        <AvatarFallback>BU</AvatarFallback>
      </Avatar>
      <AvatarGroup>
        {["AM", "TO", "BU"].map((name) => (
          <Avatar key={name}>
            <AvatarFallback>{name}</AvatarFallback>
          </Avatar>
        ))}
      </AvatarGroup>
    </div>
  ),
  "aspect-ratio": () => (
    <div className="mx-auto max-w-sm overflow-hidden rounded-lg border">
      <AspectRatio ratio={16 / 9}>
        <div className="flex size-full flex-col items-center justify-center gap-2 bg-accent text-link">
          <p className="font-mono text-title">16 : 9</p>
          <p className="text-sm">Rasio tetap, ukuran fleksibel</p>
        </div>
      </AspectRatio>
    </div>
  ),
  card: () => (
    <Card className="mx-auto max-w-sm">
      <CardHeader>
        <CardTitle>Riset produk</CardTitle>
        <CardDescription>Kelompokkan konten dan aksi dalam satu surface.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Ringkasan temuan dan referensi tersimpan dalam satu tempat.
        </p>
      </CardContent>
      <CardFooter>
        <Button onClick={() => toast("Contoh card dibuka")}>Buka ringkasan</Button>
      </CardFooter>
    </Card>
  ),
  carousel: () => (
    <div className="mx-auto max-w-sm px-10">
      <Carousel>
        <CarouselContent>
          {[1, 2, 3].map((item) => (
            <CarouselItem key={item}>
              <div className="flex aspect-square flex-col items-center justify-center gap-3 rounded-card border bg-card">
                <span className="font-mono text-heading">0{item}</span>
                <span className="text-sm text-muted-foreground">Slide {item}</span>
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className="-left-10" />
        <CarouselNext className="-right-10" />
      </Carousel>
    </div>
  ),
  chart: ChartExample,
  direction: DirectionExample,
  item: () => (
    <Item variant="outline">
      <ItemMedia>
        <Avatar>
          <AvatarFallback>TO</AvatarFallback>
        </Avatar>
      </ItemMedia>
      <ItemContent>
        <ItemTitle>Tobi</ItemTitle>
        <ItemDescription>Personal assistant · Ready</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button variant="outline" size="sm" onClick={() => toast("Contoh item dipilih")}>
          Buka
        </Button>
      </ItemActions>
    </Item>
  ),
  kbd: () => (
    <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground">
      Buka command palette{" "}
      <KbdGroup>
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
      </KbdGroup>
    </div>
  ),
  resizable: () => (
    <ResizablePanelGroup orientation="horizontal" className="min-h-48 rounded-lg border">
      <ResizablePanel defaultSize="50%" minSize="20%">
        <div className="flex h-48 items-center justify-center text-sm">Panel A</div>
      </ResizablePanel>
      <ResizableHandle withHandle aria-label="Ubah ukuran panel" />
      <ResizablePanel defaultSize="50%" minSize="20%">
        <div className="flex h-48 items-center justify-center text-sm">Panel B</div>
      </ResizablePanel>
    </ResizablePanelGroup>
  ),
  "scroll-area": () => (
    <ScrollArea className="mx-auto h-48 max-w-sm rounded-lg border">
      <div className="divide-y px-4">
        {Array.from({ length: 12 }, (_, index) => `Percakapan ${index + 1}`).map((item) => (
          <p key={item} className="py-3 text-sm">
            {item}
          </p>
        ))}
      </div>
    </ScrollArea>
  ),
  separator: () => (
    <div className="mx-auto max-w-sm space-y-5">
      <p className="font-medium">Workspace personal</p>
      <Separator />
      <div className="flex h-5 items-center gap-4 text-sm text-muted-foreground">
        <span>Profil</span>
        <Separator orientation="vertical" />
        <span>Preferensi</span>
        <Separator orientation="vertical" />
        <span>Notifikasi</span>
      </div>
    </div>
  ),
  table: () => (
    <Table>
      <TableCaption>Data contoh agent</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Agent</TableHead>
          <TableHead>Peran</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {[
          { name: "Tobi", role: "Personal assistant", state: "Ready" },
          { name: "Bud", role: "Researcher", state: "Working" },
          { name: "Chief", role: "Operations", state: "Ready" },
        ].map((agent) => (
          <TableRow key={agent.name}>
            <TableCell className="font-medium">{agent.name}</TableCell>
            <TableCell>{agent.role}</TableCell>
            <TableCell>
              <Badge variant={agent.state === "Ready" ? "success" : "warning"}>{agent.state}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ),
} satisfies ExampleSet;

export default function DisplayExamples({ name }: ExampleProps) {
  return renderExample(examples, name);
}
