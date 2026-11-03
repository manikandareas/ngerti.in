import type { z } from "zod";
import type { Entity } from "../contracts";
import type { Store } from "../store";
import type { groupRouteView } from "./contracts";

/** Derive public progress from the authoritative run; never copy its private routing input. */
export function routeView(
  store: Store,
  route: Entity<"group_route">,
): z.infer<typeof groupRouteView> {
  const run = route.router_run_id ? store.get("run", route.router_run_id) : null;
  let stage: z.infer<typeof groupRouteView>["execution"]["stage"] = "classifying";
  if (route.routing?.phase === "contextual" || route.routing?.phase === "reviewing")
    stage = "reviewing";
  if (route.state === "selected") stage = "selected";
  else if (route.state === "rejected") stage = "rejected";
  else if (route.state === "unknown" || run?.status === "unknown") stage = "reconcile";
  else if (run?.status === "queued")
    stage =
      run.preparation?.state === "blocked"
        ? "blocked"
        : run.preparation?.state === "retrying"
          ? "retrying"
          : "preparing";
  else if (run?.status === "dispatching") stage = "preparing";
  else if (run?.status === "running" || run?.status === "cancel_requested") stage = "fallback";
  return {
    ...route,
    execution: {
      stage,
      run_id: run?.id ?? null,
      run_revision: run?.revision ?? null,
      diagnostic: run?.diagnostic ?? null,
      retry_preparation:
        stage === "blocked" &&
        run?.delivery === "pending" &&
        run.native_run_id === null &&
        run.native_dispatch_id === null,
    },
  };
}
