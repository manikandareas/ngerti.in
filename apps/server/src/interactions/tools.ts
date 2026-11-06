import { productToolSchemas } from "../harness/product-tool-contracts";
import type { ProductTools } from "../harness/tools";
import { Interactions } from "./service";

export function registerInteractionTools(tools: ProductTools) {
  const interactions = new Interactions(tools.lifecycle);
  for (const name of ["ngertiin.ask_user", "ngertiin.resolve_user_input"] as const) {
    tools.register(name, {
      schema: productToolSchemas[name],
      resources: () => [],
      execute: (raw, access) => {
        access.authorize();
        const { command_id, ...input } = raw as { command_id: string } & Record<string, unknown>;
        return tools.lifecycle.store.command(
          command_id,
          { operation: name, run_id: access.scope.run_id, input },
          () => {
            access.authorize();
            return name === "ngertiin.ask_user"
              ? interactions.ask(access.scope.run_id, input)
              : interactions.resolve(access.scope.run_id, { command_id, ...input });
          },
        );
      },
    });
  }
}
