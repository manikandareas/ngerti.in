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
        <Button variant="ghost" className="h-10 gap-2 rounded-xl px-3" aria-label="Tentang Gwen">
          <img src="/images/Dh2gf.png" width={32} height={32} className="size-8" alt="" />
          <span className="text-sm font-bold">Gwen</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="max-w-[calc(100vw-2rem)] border border-border p-4 shadow-sm">
        <PopoverHeader>
          <PopoverTitle>Gwen · Asisten personalmu</PopoverTitle>
          <PopoverDescription>
            Ceritakan ide, minta bantuan menulis, analisis, atau susun rencana bersama Gwen.
          </PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  );
}
