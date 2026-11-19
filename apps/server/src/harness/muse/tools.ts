import type { ProductToolDefinition } from "../product-tool-contracts";
import { SessionTools } from "../session-tools";

/** Muse MSP retains its existing session lifecycle during the ACP migration. */
export class MuseTools extends SessionTools {
  constructor(
    endpoint: () => string,
    enabled = true,
    machine = false,
    catalog?: readonly ProductToolDefinition[],
  ) {
    super(endpoint, enabled, machine, true, catalog);
  }
}
