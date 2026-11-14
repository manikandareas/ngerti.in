import { z } from "zod";
import { id } from "../contracts/base";

/** Presentation choices only; dispatch still revalidates the underlying grants. */
export const workspaceAccess = z.strictObject({
  invocable_team_agent_ids: z.array(id),
  allowed_organization_connection_ids: z.array(id),
});
