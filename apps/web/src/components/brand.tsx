import { Sprout } from "lucide-react";

export function Brand() {
  return (
    <span className="inline-flex items-center text-xl font-medium tracking-tight min-[701px]:text-2xl">
      <span className="mr-2 inline-flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Sprout size={24} strokeWidth={1.75} />
      </span>
      ngertiin<span className="text-foreground">.</span>
    </span>
  );
}
