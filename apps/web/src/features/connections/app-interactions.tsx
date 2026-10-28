import { useAuth } from "@clerk/tanstack-react-start";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { api } from "@/lib/api";
import { base, connectionError, send } from "./client";

type Property = { type?: string; title?: string; description?: string; enum?: string[] };
type Interaction = {
  interaction_id: string;
  message: string;
  schema: { properties?: Record<string, Property>; required?: string[] };
};

export function AppInteractions() {
  const { getToken, userId } = useAuth();
  const [items, setItems] = useState<Interaction[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!userId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await api<{ items: Interaction[] }>(
          `${base}/apps/interactions`,
          await getToken(),
        );
        if (active) {
          setItems(result.items);
          setError("");
        }
      } catch (e) {
        if (active) setError(connectionError(e));
      }
      if (active) timer = setTimeout(poll, 3000);
    };
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [getToken, userId]);

  async function answer(item: Interaction, action: string, content: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      await send("/apps/interactions", await getToken(), {
        interaction_id: item.interaction_id,
        action,
        content,
      });
      setItems((current) =>
        current.filter((value) => value.interaction_id !== item.interaction_id),
      );
      setError("");
    } catch (e) {
      setError(connectionError(e));
    } finally {
      setBusy(false);
    }
  }
  if (!items.length && !error) return null;
  return (
    <section aria-label="Permintaan aplikasi" className="space-y-3">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {items.map((item) => (
        <form
          key={item.interaction_id}
          className="space-y-3 rounded-xl border p-4"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const content: Record<string, unknown> = {};
            for (const [name, property] of Object.entries(item.schema.properties ?? {})) {
              const value = data.get(name);
              if (property.type === "boolean") content[name] = value === "on";
              else if (value !== null && value !== "")
                content[name] =
                  property.type === "number" || property.type === "integer" ? Number(value) : value;
            }
            void answer(item, "accept", content);
          }}
        >
          <p className="whitespace-pre-wrap break-words text-sm">{item.message}</p>
          {Object.entries(item.schema.properties ?? {}).map(([name, property]) => (
            <label
              key={name}
              htmlFor={`${item.interaction_id}-${name}`}
              className="block space-y-1 text-sm"
            >
              <span>{property.title ?? name}</span>
              {property.enum ? (
                <NativeSelect
                  id={`${item.interaction_id}-${name}`}
                  name={name}
                  className="h-10 w-full rounded-md border bg-background px-3"
                >
                  {property.enum.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </NativeSelect>
              ) : (
                <Input
                  id={`${item.interaction_id}-${name}`}
                  name={name}
                  type={
                    property.type === "boolean"
                      ? "checkbox"
                      : property.type === "integer" || property.type === "number"
                        ? "number"
                        : "text"
                  }
                  step={property.type === "number" ? "any" : undefined}
                  required={property.type !== "boolean" && item.schema.required?.includes(name)}
                />
              )}
              {property.description && (
                <span className="text-xs text-muted-foreground">{property.description}</span>
              )}
            </label>
          ))}
          <div className="flex gap-2">
            <Button size="sm" disabled={busy}>
              Setujui
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void answer(item, "decline", {})}
            >
              Tolak
            </Button>
          </div>
        </form>
      ))}
    </section>
  );
}
