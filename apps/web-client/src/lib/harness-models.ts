import type { ModelPickerModel, ModelPickerProvider } from "@/components/ui/model-picker-types";
import type { Connection } from "@/types/workspace";
import { type HarnessId, harnesses, harnessIds, modelProviderName } from "./harnesses";

export function connectionReady(connection?: Connection) {
  return (
    !!connection &&
    connection.state === "active" &&
    connection.login === "authenticated" &&
    connection.effective_billing_source === connection.authentication.billing_source &&
    connection.models.length > 0
  );
}

export const harnessModelKey = (connectionId: string, modelId: string) =>
  JSON.stringify([connectionId, modelId]);

/** One observed catalog for onboarding and the app. Connection identity never becomes a display label. */
export function harnessModelCatalog(
  connections: readonly Connection[],
  allowedHarness?: HarnessId,
) {
  const choices = new Map<
    string,
    { connection: Connection; model: Connection["models"][number] }
  >();
  const providers: (ModelPickerProvider & { id: HarnessId })[] = harnessIds.map((id) => {
    const accounts = connections.filter(
      (connection) =>
        connection.harness === id &&
        connectionReady(connection) &&
        (!allowedHarness || id === allowedHarness),
    );
    return {
      id,
      name: harnesses[id].name,
      models: accounts.flatMap((connection, index): ModelPickerModel[] =>
        connection.models.map((model) => {
          const key = harnessModelKey(connection.id, model.id);
          choices.set(key, { connection, model });
          const billing =
            connection.authentication.billing_source === "free"
              ? "Free"
              : connection.authentication.billing_source === "subscription"
                ? "Subscription"
                : "API key";
          return {
            id: key,
            name: model.id,
            description: `${modelProviderName(connection.provider_id ?? harnesses[id].providerId)} · ${billing}${accounts.length > 1 ? ` · Connection ${index + 1}` : ""}`,
            thinking: model.reasoning,
            capabilities: [
              ...(model.reasoning.length ? ["reasoning" as const] : []),
              ...(model.input_modalities?.includes("image") ? ["image" as const] : []),
            ],
          };
        }),
      ),
    };
  });
  return { providers, choices };
}
