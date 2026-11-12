import { z } from "zod";
import { DomainError } from "../contracts";
import { productToolSchemas } from "../harness/product-tool-contracts";
import type { ProductTools } from "../harness/tools";
import { sha256 } from "./cua";
import type { Machines } from "./service";

export function registerMachineTools(tools: ProductTools, machines: Machines) {
  for (const name of [
    "ngertiin.machine_status",
    "ngertiin.machine_exec",
    "ngertiin.machine_process",
    "ngertiin.machine_window",
    "ngertiin.machine_control",
    "ngertiin.computer_tools",
    "ngertiin.computer_call",
    "ngertiin.machine_receipts",
    "ngertiin.machine_reconcile",
  ] as const) {
    tools.register(name, {
      schema: productToolSchemas[name],
      resources: () => [],
      execute: async (input, access) => {
        const actor = await machines.actor(access);
        if (name === "ngertiin.machine_status") {
          await machines.refresh().catch(() => {});
          return await machines.snapshot();
        }
        if (name === "ngertiin.machine_receipts")
          return {
            operations: await machines.operations.list(actor),
            processes: await machines.processes.list(actor),
          };
        if (name === "ngertiin.computer_tools") {
          const { names } = productToolSchemas[name].parse(input);
          const catalog = await machines.catalog();
          if (names?.some((selected) => !catalog.some((tool) => tool.name === selected)))
            throw new DomainError("INVALID_REQUEST", 422);
          return {
            tools: names
              ? catalog.filter((tool) => names.includes(tool.name))
              : catalog.map(({ name, description, requires_input_lease }) => ({
                  name,
                  description: description.slice(0, 400),
                  requires_input_lease,
                })),
            session_identity: "supplied_by_ngertiin",
            shared_machine: true,
          };
        }
        if (name === "ngertiin.computer_call") return machines.computer(input, access);
        if (name === "ngertiin.machine_control")
          return machines.control(input, actor, access.authorize);
        if (name === "ngertiin.machine_exec") {
          await machines.ready();
          return machines.processes.execute(input, actor, access.authorize);
        }
        if (name === "ngertiin.machine_process")
          return machines.processes.control(input, actor, access.authorize);
        if (name === "ngertiin.machine_window") return machines.window(input, access);
        const data = z.object({ command_id: z.uuid(), operation_id: z.uuid() }).parse(input);
        const operation = await tools.lifecycle.store.get("machine_operation", data.operation_id);
        if (
          operation.agent_id !== actor.agent_id ||
          operation.thread_id !== actor.thread_id ||
          operation.generation !== (await machines.snapshot()).generation ||
          !operation.resource?.startsWith("file:")
        )
          throw new DomainError("SCOPE_DENIED", 403);
        return machines.operations.execute(
          data.command_id,
          (await machines.snapshot()).generation,
          actor,
          "reconcile.file",
          data,
          access.authorize,
          async () => {
            const path = operation.resource?.slice(5) as string;
            let observed: string | null = null;
            try {
              observed = sha256(await machines.files().read(path));
            } catch (error) {
              if (!(error instanceof DomainError) || error.code !== "NOT_FOUND") throw error;
            }
            await access.authorize();
            const current = await tools.lifecycle.store.get("machine_operation", operation.id);
            const result = {
              path,
              observed_sha256: observed,
              expected_sha256: current.expected_sha256,
              outcome: current.state === "unknown" ? "unknown" : current.state,
            };
            if (current.state === "dispatched") throw new DomainError("MACHINE_INPUT_BUSY");
            if (current.state === "unknown")
              await machines.operations.update(current, {
                reconciled_at: new Date().toISOString(),
                result,
              });
            return result;
          },
        );
      },
    });
  }
}
