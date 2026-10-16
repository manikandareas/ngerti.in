import { Sprout } from "lucide-react";

export function Brand() {
  return (
    <span className="inline-flex items-center text-xl font-black tracking-tight min-[701px]:text-2xl">
      <span className="mr-2 inline-flex size-9 items-center justify-center rounded-xl border border-primary-edge bg-primary text-primary-foreground">
        <Sprout size={24} strokeWidth={2.3} />
      </span>
      ngertiin<span className="text-primary-edge">.</span>
    </span>
  );
}
