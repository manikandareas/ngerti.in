import type { z } from "zod";
import { productToolSchemas } from "../harness/product-tool-contracts";
import type { ProductTools } from "../harness/tools";
import { Boards } from "./service";

export function registerBoardTools(tools: ProductTools) {
  const boards = new Boards(tools.lifecycle);
  for (const name of [
    "ngertiin.submit_board_card",
    "ngertiin.review_board_card",
    "ngertiin.block_board_card",
  ] as const) {
    const schema = productToolSchemas[name];
    tools.register(name, {
      schema,
      resources: (input) =>
        ((input as { artifact_ids?: string[] }).artifact_ids ?? []).map((id) => ({
          kind: "artifact",
          id,
        })),
      execute: async (input, { scope, authorize }) => {
        const { command_id, ...data } = input as z.infer<typeof schema>;
        return await tools.lifecycle.store.command(
          command_id,
          { operation: name, run_id: scope.run_id, data },
          async () => {
            await authorize();
            if (name === "ngertiin.submit_board_card") return boards.submit(scope.run_id, data);
            if (name === "ngertiin.review_board_card") return boards.review(scope.run_id, data);
            return boards.block(scope.run_id, data);
          },
        );
      },
    });
  }
}
