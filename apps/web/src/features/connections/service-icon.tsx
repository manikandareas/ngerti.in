import { Blocks } from "lucide-react";

const icons = new Set([
  "openai",
  "anthropic",
  "gemini",
  "xai",
  "notion",
  "github",
  "linear",
  "google-workspace",
]);

export function ServiceIcon({ service }: { service: string }) {
  const name = service === "openai-codex" ? "openai" : service;
  return icons.has(name) ? (
    <img
      src={`/icons/services/${name}.png`}
      alt=""
      width={32}
      height={32}
      className="size-8 shrink-0 rounded-lg object-contain"
    />
  ) : (
    <Blocks aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
  );
}
