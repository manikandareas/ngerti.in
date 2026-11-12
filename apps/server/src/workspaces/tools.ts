import { Artifacts } from "../artifacts";
import { DomainError } from "../contracts";
import { authorizeResponsibilityWork } from "../goals/work-fence";
import { productToolSchemas } from "../harness/product-tool-contracts";
import type { ProductTools, ToolAccess } from "../harness/tools";
import { sha256 } from "../machines/cua";
import { MachineEffectRefused } from "../machines/operations";
import { machineFor } from "../machines/service";

export function registerWorkspaceTools(tools: ProductTools) {
  const { lifecycle } = tools;
  const artifacts = new Artifacts(lifecycle);
  const workspaces = artifacts.workspaces;
  const workspaceFor = async (access: ToolAccess) => {
    await access.authorize();
    return await workspaces.authorizeRun(await lifecycle.store.get("run", access.scope.run_id));
  };
  for (const name of [
    "ngertiin.get_workspace",
    "ngertiin.list_files",
    "ngertiin.read_file",
    "ngertiin.create_file",
    "ngertiin.write_file",
    "ngertiin.publish_artifact",
  ] as const) {
    if (name === "ngertiin.write_file" && !machineFor(lifecycle)) continue;
    tools.register(name, {
      schema: productToolSchemas[name],
      resources: () => [],
      execute: async (raw, access) => {
        const workspace = await workspaceFor(access);
        const data = raw as {
          command_id: string;
          path: string;
          text: string;
          media_type: string;
          expected_sha256: string | null;
        };
        if (name === "ngertiin.get_workspace")
          return {
            workspace_id: workspace.id,
            name: workspace.name,
            root: workspaces.path(workspace),
            machine_id: workspace.machine_id,
            shared: workspace.machine_id !== null || workspace.scope === "group",
          };
        if (name === "ngertiin.list_files")
          return (await workspaces.workingFiles(workspace.id)).list(data.path, "", 200);
        if (name === "ngertiin.read_file") {
          const bytes = await (await workspaces.workingFiles(workspace.id)).read(data.path);
          if (bytes.length > 100_000) throw new DomainError("INVALID_REQUEST", 413);
          return {
            path: data.path,
            text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
            sha256: sha256(bytes),
          };
        }
        const machine = machineFor(lifecycle);
        if (machine && (name === "ngertiin.create_file" || name === "ngertiin.write_file")) {
          const bytes = Buffer.from(data.text);
          const actor = await machine.actor(access);
          const create = name === "ngertiin.create_file" || data.expected_sha256 === null;
          return machine.operations.execute(
            data.command_id,
            (await machine.snapshot()).generation,
            actor,
            name,
            {
              path: data.path,
              sha256: sha256(bytes),
              expected_sha256: create ? null : data.expected_sha256,
            },
            access.authorize,
            async () =>
              machine.operations.path(data.path, async () => {
                let current: Buffer | null = null;
                try {
                  current = await machine.files().read(data.path);
                } catch (error) {
                  if (!(error instanceof DomainError) || error.code !== "NOT_FOUND") throw error;
                }
                if (
                  create
                    ? current !== null
                    : current === null || sha256(current) !== data.expected_sha256
                )
                  throw new MachineEffectRefused("CONFLICT");
                await access.authorize();
                await authorizeResponsibilityWork(lifecycle, access.scope.run_id);
                await machine.files().write(data.path, bytes, create);
                return { path: data.path, sha256: sha256(bytes) };
              }),
            (result) => result,
            { resource: `file:${data.path}`, expected_sha256: sha256(bytes) },
          );
        }
        if (name === "ngertiin.write_file") throw new DomainError("MACHINE_UNAVAILABLE", 503);
        if (name === "ngertiin.create_file")
          return await lifecycle.store.command(
            data.command_id,
            { operation: name, workspace_id: workspace.id, path: data.path, text: data.text },
            async () => {
              await access.authorize();
              await authorizeResponsibilityWork(lifecycle, access.scope.run_id);
              (await workspaces.files(workspace.id)).create(data.path, Buffer.from(data.text));
              return { path: data.path };
            },
          );
        return artifacts.publish(
          data.command_id,
          {
            workspace_id: workspace.id,
            run_id: access.scope.run_id,
            path: data.path,
            media_type: data.media_type,
          },
          access.authorize,
        );
      },
    });
  }
}
