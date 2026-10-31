import { z } from "zod";
import type { ProductTools } from "../harness/tools";
import { browserActionInput, browserCapabilities } from "./contracts";

export function registerBrowserTools(tools: ProductTools) {
  tools.register("ngertiin.browser_sessions", {
    schema: z.strictObject({}),
    resources: () => [],
    execute: (_input, access) => {
      access.authorize();
      return { profiles: tools.browsers.list(access.scope), capabilities: browserCapabilities() };
    },
  });
  tools.register("ngertiin.browser_open", {
    schema: z.strictObject({ profile_id: z.uuid() }),
    resources: () => [],
    execute: (input, access) =>
      tools.browsers.open(
        (input as { profile_id: string }).profile_id,
        access.scope,
        access.authorize,
      ),
  });
  tools.register("ngertiin.browser_action", {
    schema: browserActionInput,
    resources: () => [],
    execute: (input, access) => tools.browsers.action(input, access),
  });
}
