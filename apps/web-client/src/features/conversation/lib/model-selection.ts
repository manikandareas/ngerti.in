import { assertScope, clientScope } from "@/lib/client-scope";

const pending = new Map<string, Promise<boolean>>();

function selectionKey(threadId: string, agentId: string) {
  const scope = clientScope();
  return JSON.stringify([scope?.key, scope?.epoch, threadId, agentId]);
}

export function queueModelSelection(
  threadId: string,
  agentId: string,
  save: () => Promise<boolean>,
) {
  const key = selectionKey(threadId, agentId);
  const previous = pending.get(key);
  const operation = previous ? previous.then(save, save) : save();
  pending.set(key, operation);
  const clear = () => {
    if (pending.get(key) === operation) pending.delete(key);
  };
  void operation.then(clear, clear);
}

/** New work waits for the latest explicit choice, without waiting for workspace refresh. */
export async function waitForModelSelection(threadId: string, agentId: string) {
  const scope = clientScope();
  const key = selectionKey(threadId, agentId);
  let operation = pending.get(key);
  while (operation) {
    const saved = await operation;
    assertScope(scope);
    if (!saved)
      throw new Error("Your model choice could not be saved. Choose a model and try again.");
    operation = pending.get(key);
  }
}
