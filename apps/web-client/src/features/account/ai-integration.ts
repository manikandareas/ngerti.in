import type { Connection } from "@/types/workspace";

export function connectionReady(connection?: Connection) {
  return (
    !!connection &&
    connection.state === "active" &&
    connection.login === "authenticated" &&
    connection.effective_billing_source === connection.authentication.billing_source &&
    connection.models.length > 0
  );
}

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
