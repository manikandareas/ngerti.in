import { Sprout } from "lucide-react";

export function Brand() {
  return (
    <span className="brand">
      <span className="brand-symbol">
        <Sprout size={24} strokeWidth={2.3} />
      </span>
      ngertiin<span className="brand-dot">.</span>
    </span>
  );
}
