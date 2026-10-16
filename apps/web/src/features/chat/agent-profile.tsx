import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";

export function AgentProfile() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className="h-auto flex-col gap-1 rounded-2xl px-3 py-0 hover:bg-transparent"
          aria-label="Tentang Gwen"
        >
          <img src="/images/Dh2gf.png" width={48} height={48} className="size-12" alt="" />
          <span className="rounded-full bg-muted px-3 py-0.5 text-xs font-normal">Gwen</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="max-w-[calc(100vw-2rem)] border border-border p-4 shadow-sm">
        <PopoverHeader>
          <PopoverTitle>Gwen · Teman belajarmu</PopoverTitle>
          <PopoverDescription>
            Tanyakan topik yang ingin kamu pahami, hubungkan konsep, atau ceritakan tujuan
            belajarmu.
          </PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  );
}
