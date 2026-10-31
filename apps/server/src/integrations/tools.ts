import { z } from "zod";
import type { ProductTools } from "../harness/tools";
import { appExecute, appSearch } from "./contracts";

export function registerAppTools(tools: ProductTools) {
  tools.register("ngertiin.list_apps", {
    schema: z.strictObject({}),
    resources: () => [],
    execute: (_input, access) => {
      access.authorize();
      return { connections: tools.applications.list(access.scope) };
    },
  });
  tools.register("ngertiin.search_app_tools", {
    schema: appSearch,
    resources: () => [],
    execute: (input, access) => tools.applications.search(input, access.scope, access.authorize),
  });
  tools.register("ngertiin.execute_app_tool", {
    schema: appExecute,
    resources: () => [],
    execute: (input, access) => tools.applications.execute(input, access),
  });
}
