import { Artifacts } from "../artifacts";
import { DomainError } from "../contracts";
import { authorizeResponsibilityWork } from "../goals/work-fence";
import { productToolSchemas } from "../harness/product-tool-contracts";
import type { ProductTools, ToolAccess } from "../harness/tools";

export function registerWorkspaceTools(tools: ProductTools) {
  const { lifecycle } = tools;
  const artifacts = new Artifacts(lifecycle);
  const workspaces = artifacts.workspaces;
  const workspaceFor = (access: ToolAccess) => {
    access.authorize();
    return workspaces.authorizeRun(lifecycle.store.get("run", access.scope.run_id));
  };
  for (const name of [
    "ngertiin.get_workspace",
    "ngertiin.list_files",
    "ngertiin.read_file",
    "ngertiin.create_file",
    "ngertiin.publish_artifact",
  ] as const) {
    tools.register(name, {
      schema: productToolSchemas[name],
      resources: () => [],
      execute: (raw, access) => {
        const workspace = workspaceFor(access);
        const data = raw as {
          command_id: string;
          path: string;
          text: string;
          media_type: string;
        };
        if (name === "ngertiin.get_workspace")
          return {
            workspace_id: workspace.id,
            name: workspace.name,
            root: workspaces.path(workspace),
          };
        if (name === "ngertiin.list_files")
          return workspaces.files(workspace.id).list(data.path, "", 200);
        if (name === "ngertiin.read_file") {
          const bytes = workspaces.files(workspace.id).read(data.path);
          if (bytes.length > 100_000) throw new DomainError("INVALID_REQUEST", 413);
          return {
            path: data.path,
            text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
          };
        }
        if (name === "ngertiin.create_file")
          return lifecycle.store.command(
            data.command_id,
            { operation: name, workspace_id: workspace.id, path: data.path, text: data.text },
            () => {
              access.authorize();
              authorizeResponsibilityWork(lifecycle, access.scope.run_id);
              workspaces.files(workspace.id).create(data.path, Buffer.from(data.text));
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
