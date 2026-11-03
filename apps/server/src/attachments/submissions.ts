import { Artifacts } from "../artifacts";
import { admissionInput, DomainError, type Entity } from "../contracts";
import { groupMessage } from "../groups/contracts";
import { Groups } from "../groups/service";
import type { Lifecycle } from "../lifecycle";
import { RunControls } from "../run-controls";
import { allowedPath } from "../workspaces/files";
import { stagedUploadInput } from "./contracts";

const STAGING_LIFETIME_MS = 24 * 60 * 60 * 1000;

/** Private durable bytes are published only with an admitted message, never from a draft. */
export class AttachmentSubmissions {
  readonly artifacts: Artifacts;
  constructor(readonly lifecycle: Lifecycle) {
    this.artifacts = new Artifacts(lifecycle);
  }
  private scope(threadId: string, agentId: string | null) {
    const thread = this.lifecycle.store.get("thread", threadId);
    if (
      thread.purpose !== "conversation" ||
      (agentId === null ? thread.type !== "group" : !thread.member_agent_ids.includes(agentId))
    )
      throw new DomainError("SCOPE_DENIED", 403);
    return thread.type === "group" ? null : agentId;
  }
  stage(id: string, input: unknown) {
    const data = stagedUploadInput.parse(input);
    const agentId = this.scope(data.thread_id, data.agent_id);
    allowedPath(`inputs/${id}/${data.name}`);
    this.sweep();
    return this.lifecycle.store.command(
      id,
      { operation: "stage_message_attachment", ...data },
      () => {
        if (this.lifecycle.store.list("artifact").some((item) => item.id === id))
          throw new DomainError("CONFLICT");
        const fields = this.artifacts.reserveUpload(id, {
          name: data.name,
          media_type: data.media_type,
          content_base64: data.content_base64,
        });
        const now = new Date();
        return this.lifecycle.store.put({
          id,
          kind: "attachment_upload",
          owner_id: this.lifecycle.store.ownerId,
          revision: 1,
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
          ...fields,
          submission_id: data.submission_id,
          thread_id: data.thread_id,
          agent_id: agentId,
          state: "staged",
          expires_at: new Date(now.getTime() + STAGING_LIFETIME_MS).toISOString(),
        });
      },
    );
  }
  commit(input: unknown, commandId: string) {
    const data = admissionInput.parse(input);
    if (this.lifecycle.store.get("thread", data.thread_id).type !== "dm")
      throw new DomainError("SCOPE_DENIED", 403);
    this.scope(data.thread_id, data.agent_id);
    return this.lifecycle.store.transaction(() => {
      this.commitFiles(
        data.thread_id,
        data.agent_id,
        data.artifact_ids,
        data.submission_id ?? null,
        commandId,
      );
      return new RunControls(this.lifecycle).send(data);
    });
  }
  commitGroup(threadId: string, input: unknown, commandId: string) {
    const data = groupMessage.parse(input);
    this.scope(threadId, null);
    return this.lifecycle.store.transaction(() => {
      this.commitFiles(threadId, null, data.artifact_ids, data.submission_id, commandId);
      return new Groups(this.lifecycle).send(threadId, data);
    });
  }
  private commitFiles(
    threadId: string,
    agentId: string | null,
    ids: string[],
    submissionId: string | null,
    commandId: string,
  ) {
    if (submissionId !== commandId || new Set(ids).size !== ids.length)
      throw new DomainError("INVALID_REQUEST", 422);
    const existing = new Set(this.lifecycle.store.list("artifact").map((a) => a.id));
    const pending = ids
      .filter((id) => !existing.has(id))
      .map((id) => {
        const upload = this.lifecycle.store.get("attachment_upload", id);
        if (
          upload.thread_id !== threadId ||
          upload.agent_id !== agentId ||
          upload.submission_id !== commandId
        )
          throw new DomainError("SCOPE_DENIED", 403);
        if (upload.state !== "staged" || upload.expires_at <= new Date().toISOString())
          throw new DomainError("CONFLICT");
        return upload;
      });
    if (pending.length) {
      const workspace = this.artifacts.workspaces.ensure(threadId, agentId);
      for (const upload of pending) {
        this.artifacts.commitUpload(upload, workspace);
        this.lifecycle.store.put(
          {
            ...upload,
            state: "committed",
            revision: upload.revision + 1,
            updated_at: new Date().toISOString(),
          },
          upload.revision,
        );
      }
    }
  }
  materialize(message: Entity<"message">) {
    for (const id of message.artifact_ids) {
      try {
        this.artifacts.materialize(id);
      } catch (error) {
        // Admission is already durable. Pending files remain retryable and fence native dispatch.
        if (!(error instanceof DomainError)) throw error;
      }
    }
  }
  recover() {
    this.sweep();
    for (const item of this.lifecycle.store.list("artifact")) {
      if (item.materialization !== "pending") continue;
      try {
        this.artifacts.materialize(item.id);
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
      }
    }
  }
  sweep(now = new Date()) {
    for (const upload of this.lifecycle.store.list("attachment_upload")) {
      if (upload.state === "committed" || upload.expires_at > now.toISOString()) continue;
      if (upload.state === "staged")
        this.lifecycle.store.put(
          {
            ...upload,
            state: "expired",
            revision: upload.revision + 1,
            updated_at: now.toISOString(),
          },
          upload.revision,
        );
      this.artifacts.discardReserved(upload);
    }
  }
}
