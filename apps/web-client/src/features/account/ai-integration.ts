import type { Connection } from "@/types/workspace";

export { connectionReady } from "@/lib/harness-models";

export function availableAIConnections(
  connections: Connection[],
  userId: string,
  allowedOrganizationConnections: string[],
) {
  const allowed = new Set(allowedOrganizationConnections);
  return connections.filter(
    (connection) =>
      connection.state === "active" &&
      (connection.actor_id === userId ||
        (connection.actor_id === null && allowed.has(connection.id))),
  );
}
