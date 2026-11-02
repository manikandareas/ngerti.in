import type { z } from "zod";
import type { ProductTools } from "../harness/tools";
import { attachmentList, attachmentRead, attachmentSearch } from "./contracts";
import { Attachments } from "./service";

export function registerAttachmentTools(tools: ProductTools) {
  const attachments = new Attachments(tools.lifecycle);
  tools.register("ngertiin.list_attachments", {
    schema: attachmentList,
    resources: () => [],
    execute: (input, { scope, authorize }) => {
      authorize();
      const data = input as z.infer<typeof attachmentList>;
      return attachments.list(
        tools.lifecycle.store.get("run", scope.run_id),
        data.after,
        data.limit,
      );
    },
  });
  tools.register("ngertiin.read_attachment", {
    schema: attachmentRead,
    resources: (input) => [
      { kind: "artifact", id: (input as z.infer<typeof attachmentRead>).artifact_id },
    ],
    execute: (input, { scope, authorize }) =>
      attachments.read(
        tools.lifecycle.store.get("run", scope.run_id),
        input as z.infer<typeof attachmentRead>,
        authorize,
      ),
  });
  tools.register("ngertiin.search_attachment", {
    schema: attachmentSearch,
    resources: (input) => [
      { kind: "artifact", id: (input as z.infer<typeof attachmentSearch>).artifact_id },
    ],
    execute: (input, { scope, authorize }) =>
      attachments.search(
        tools.lifecycle.store.get("run", scope.run_id),
        input as z.infer<typeof attachmentSearch>,
        authorize,
      ),
  });
}
