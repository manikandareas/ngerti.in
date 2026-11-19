import { Fragment, memo, useMemo } from "react";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Message, MessageContent, MessageHeader } from "@/components/ui/message";
import { request } from "@/lib/api-client";
import type {
  Agent,
  ConversationPart,
  Message as MessageEntity,
  Run,
  Snapshot,
} from "@/types/workspace";
import { activityPresentation } from "../lib/activity-presentation";
import { attachmentParts } from "../lib/attachment-references";
import { waitingForUser } from "../lib/conversation-activity";
import type { ConversationEntry } from "../lib/conversation-parts";
import { type ConversationRow, conversationRows } from "../lib/conversation-rows";
import { type NativeTranscriptFragment, useNativeTranscript } from "../lib/native-transcript";
import { AgentActivityBubble } from "./agent-activity-bubble";
import { Answer } from "./answer";
import { AgentMessageAvatar, AssistantMessage } from "./assistant-message";
import { ComputerActivity } from "./computer-activity";
import { ConversationDate } from "./conversation-date";
import { HumanReply } from "./human-reply";
import { agentStyle } from "./identity";
import { MessageActions } from "./message-actions";
import { MessageAttachments } from "./message-attachments";
import { MessageTime } from "./message-time";
import { NativeInteractions } from "./native-interactions";
import { TimelineActivity } from "./timeline-activity";
import { type TranscriptNavigation, TranscriptViewport } from "./transcript-viewport";
import { UserMessageText } from "./user-message-text";
import { WorkActivity } from "./work-activity";

type Props = {
  snapshot: Snapshot;
  entries: ConversationEntry[];
  parts: ConversationPart[];
  agents: Agent[];
  activity: Map<string, Run[]>;
  busy: boolean;
  online: boolean;
  messageKeys: ReadonlyMap<string, string>;
  navigation: TranscriptNavigation | null;
  openResource: (kind: "agent" | "files" | "goals" | "routine", id: string) => void;
  openSettings: () => void;
  openComputer: () => void;
  refresh: () => Promise<unknown>;
  act: (action: () => Promise<void>) => Promise<void>;
  queueCommand: (slot: string, path: string, body: unknown) => Promise<unknown>;
};

export const ConversationTranscript = memo(function ConversationTranscript({
  snapshot,
  entries,
  parts,
  agents,
  activity,
  busy,
  online,
  messageKeys,
  navigation,
  openResource,
  openSettings,
  openComputer,
  refresh,
  act,
  queueCommand,
}: Props) {
  "use memo";
  const visibleMessages = useMemo(
    () => entries.flatMap((entry) => (entry.type === "message" ? [entry.message] : [])),
    [entries],
  );
  const nativeTranscript = useNativeTranscript(visibleMessages, snapshot.runs);
  const rows = conversationRows(entries, {
    native: nativeTranscript,
    activity,
    requests: snapshot.human_requests,
    runs: snapshot.runs,
  });
  function nativeFragment(fragment: NativeTranscriptFragment) {
    const author = snapshot.agents.find((agent) => agent.id === fragment.run.agent_id);
    return (
      <div key={fragment.key} data-native-fragment={fragment.key} className="w-full py-1">
        <NativeInteractions
          threadId={snapshot.thread.id}
          runId={fragment.run.id}
          run={fragment.run}
          author={author?.name ?? "Agent"}
          agent={author}
          observePending={false}
          openAgent={author ? () => openResource("agent", author.id) : undefined}
          canRespond={fragment.run.status === "running" && fragment.run.cancellation === "none"}
          recordIds={fragment.recordIds}
          refresh={refresh}
        />
      </div>
    );
  }
  function publishedAuthor(message: MessageEntity) {
    const current = agents.find((agent) => agent.id === message.author_agent_id);
    const historical = parts.find(
      (part) => part.kind === "message" && part.message_id === message.id,
    )?.actors[0];
    return historical ? { ...historical, system_role: current?.system_role } : current;
  }
  function answer(message: MessageEntity, text: string, at: string, last: boolean) {
    if (!text.trim()) return null;
    const related = snapshot.runs.find((run) => run.id === message.run_id);
    if (
      related?.retried_by_run_id ||
      snapshot.human_requests.some(
        (request) =>
          request.message_id === message.id && (request.options || request.purpose === "approval"),
      )
    )
      return null;
    const retry =
      related?.status === "failed" && related.retry_allowed
        ? () =>
            void act(async () => {
              await queueCommand(`response-retry:${related.id}`, `/v1/runs/${related.id}/retry`, {
                expected_revision: related.revision,
              });
            })
        : undefined;
    const streaming =
      message.author === "agent" &&
      message.state === "partial" &&
      message.purpose !== "announcement" &&
      related?.status === "running";
    const author = publishedAuthor(message);
    const sender =
      snapshot.thread.type === "group" && message.author === "agent"
        ? {
            style: agentStyle(author),
          }
        : undefined;
    return (
      <Answer
        retry={retry}
        busy={busy}
        sources={related?.sources}
        agentId={author?.id}
        sentAt={at}
        sender={sender}
        streaming={streaming && last}
        showSources={last}
        text={text}
        openResource={openResource}
        snapshot={snapshot}
      />
    );
  }

  function joins(upper: MessageEntity | undefined, lower: MessageEntity | undefined) {
    if (
      !upper ||
      !lower ||
      upper.author !== lower.author ||
      upper.author_agent_id !== lower.author_agent_id
    )
      return false;
    const plain = (message: MessageEntity) =>
      !message.artifact_ids.length &&
      !nativeTranscript.anchors.has(message.id) &&
      !snapshot.human_requests.some((request) => request.message_id === message.id) &&
      !snapshot.runs.some(
        (run) =>
          run.input_message_id === message.id &&
          (run.status !== "succeeded" ||
            run.native_tools.length > 0 ||
            run.product_tools.length > 0),
      );
    return plain(upper) && plain(lower);
  }
  function runActivity(run: Run, at: string, embedded = false) {
    const actor = snapshot.agents.find((agent) => agent.id === run.agent_id);
    if (!actor) return null;
    const target = snapshot.agents.find(
      (agent) => agent.id === run.active_tools?.at(-1)?.target_agent_id,
    );
    if (run.computer_activity && !["failed", "unknown"].includes(run.status))
      return (
        <AssistantMessage
          key={run.id}
          agent={actor}
          group={snapshot.thread.type === "group"}
          open={() => openResource("agent", actor.id)}
        >
          <ComputerActivity run={run} at={at} agent={actor} open={openComputer} />
        </AssistantMessage>
      );
    if (embedded && !run.diagnostic && ["queued", "dispatching", "running"].includes(run.status)) {
      const view = activityPresentation(run, {
        online,
        waitingForUser: waitingForUser(run, snapshot),
        targetName: target?.name,
      });
      return (
        <Answer
          text=""
          sentAt={at}
          busy={busy}
          agentId={actor.id}
          activity={{ name: actor.name, label: view.label, loading: view.isLoading }}
          sender={snapshot.thread.type === "group" ? { style: agentStyle(actor) } : undefined}
        />
      );
    }
    return (
      <AgentActivityBubble
        embedded={embedded}
        key={run.id}
        agent={actor}
        run={run}
        at={at}
        online={online}
        waitingForUser={waitingForUser(run, snapshot)}
        targetName={target?.name}
        showName={snapshot.thread.type === "group"}
        busy={busy}
        openAgent={() => openResource("agent", actor.id)}
        openSettings={() => openSettings()}
        retryResponse={
          run.retry_allowed
            ? () =>
                void act(async () => {
                  await queueCommand(`response-retry:${run.id}`, `/v1/runs/${run.id}/retry`, {
                    expected_revision: run.revision,
                  });
                })
            : undefined
        }
        retryPreparation={() =>
          void act(async () => {
            await queueCommand(`preparation:${run.id}`, `/v1/runs/${run.id}/retry-preparation`, {
              expected_revision: run.revision,
            });
          })
        }
        reconcile={() =>
          void act(async () => {
            await request(`/v1/runs/${run.id}/reconcile`, {});
          })
        }
      />
    );
  }
  function renderRow(row: ConversationRow, index: number) {
    const date = row.startsDay ? <ConversationDate at={row.at} /> : null;
    if (row.type === "activity")
      return (
        <Fragment key={row.key}>
          {date}
          <TimelineActivity parts={row.parts} open={openResource} />
        </Fragment>
      );
    if (row.type === "run")
      return (
        <div key={row.key} data-response-slot={row.key} className="flex flex-col gap-4">
          {date}
          {row.run.computer_activity ? (
            runActivity(row.run, row.at)
          ) : (
            <Message
              className="conversation-message"
              data-agent-activity={row.run.id}
              data-loading={
                ["queued", "dispatching", "running"].includes(row.run.status) &&
                row.run.preparation?.state !== "blocked"
              }
            >
              {snapshot.thread.type === "group" && (
                <AgentMessageAvatar
                  agent={snapshot.agents.find((agent) => agent.id === row.run.agent_id)}
                  loading
                  open={() => openResource("agent", row.run.agent_id)}
                />
              )}
              <MessageContent>
                {snapshot.thread.type !== "group" && (
                  <MessageHeader className="sr-only">
                    {snapshot.agents.find((agent) => agent.id === row.run.agent_id)?.name ??
                      "Agent"}
                  </MessageHeader>
                )}
                {runActivity(row.run, row.at, true)}
              </MessageContent>
            </Message>
          )}
        </div>
      );
    if (row.type === "native")
      return (
        <Fragment key={row.key}>
          {date}
          <div data-native-history-fallback={row.fallback || undefined}>
            {row.fallback && (
              <p className="text-[12px] text-muted-foreground">
                Riwayat input ·{" "}
                {snapshot.agents.find((agent) => agent.id === row.fragment.run.agent_id)?.name ??
                  "Agent"}
              </p>
            )}
            {nativeFragment(row.fragment)}
          </div>
        </Fragment>
      );
    const { entry } = row;
    const { message } = entry;
    const previous = rows[index - 1];
    const next = rows[index + 1];
    const run = snapshot.runs.findLast((run) => run.input_message_id === message.id);
    const channel =
      row.last && run
        ? snapshot.channel_exchanges?.find((exchange) => exchange.run_id === run.id)
        : null;
    const formatterFailure =
      message.author === "agent" && row.last
        ? snapshot.runs.find(
            (entry) => entry.id === message.run_id && entry.output_plugin_status === "failed",
          )?.output_plugin
        : null;
    const author = publishedAuthor(message);
    const inlineAttachmentIds = new Set(
      message.author === "user"
        ? attachmentParts(message.text).flatMap((part) =>
            "id" in part && snapshot.artifacts.some((file) => file.id === part.id) ? [part.id] : [],
          )
        : [],
    );
    return (
      <div
        key={row.key.replace(message.id, messageKeys.get(message.id) ?? message.id)}
        data-response-slot={row.key.startsWith("response:") ? row.key : undefined}
        className={row.key.startsWith("response:") ? "flex flex-col gap-4" : "contents"}
      >
        {date}
        <Message
          data-timeline-part={row.first ? entry.part.id : undefined}
          data-part-sequence={entry.part.sequence}
          id={row.first ? `message-${message.id}` : undefined}
          align={message.author === "user" ? "end" : "start"}
          className="conversation-message"
          data-join-above={
            (!row.startsDay &&
              joins(previous?.type === "message" ? previous.entry.message : undefined, message)) ||
            undefined
          }
          data-join-below={
            (next &&
              !next.startsDay &&
              joins(message, next.type === "message" ? next.entry.message : undefined)) ||
            undefined
          }
        >
          {snapshot.thread.type === "group" && message.author === "agent" && (
            <AgentMessageAvatar
              agent={author}
              loading={message.state === "partial"}
              open={author ? () => openResource("agent", author.id) : undefined}
            />
          )}
          <MessageContent>
            {!(snapshot.thread.type === "group" && message.author === "agent") && (
              <MessageHeader
                className={
                  snapshot.thread.type === "group" && message.author !== "user"
                    ? "message-author px-3 text-[12px] text-muted-foreground font-normal"
                    : "sr-only"
                }
              >
                {message.author === "user" ? (
                  "Kamu"
                ) : snapshot.thread.type === "group" && author ? (
                  <button
                    type="button"
                    className="text-link hover:underline"
                    onClick={() => openResource("agent", author.id)}
                  >
                    {author.name}
                  </button>
                ) : (
                  (author?.name ?? "Agent")
                )}
              </MessageHeader>
            )}
            {message.author === "user" ? (
              <MessageActions text={message.text} user>
                <Bubble variant="secondary" className="chat-user-bubble">
                  <BubbleContent className="chat-bubble-content text-[15px] leading-[22px] whitespace-pre-wrap">
                    <div data-message-text>
                      <UserMessageText
                        message={message}
                        artifacts={snapshot.artifacts}
                        documents={snapshot.attachment_documents}
                        preparing={run ? ["queued", "dispatching"].includes(run.status) : false}
                      />
                    </div>
                    <MessageTime at={row.at} />
                  </BubbleContent>
                </Bubble>
              </MessageActions>
            ) : (
              answer(message, row.text, row.at, row.last)
            )}
            {formatterFailure && (
              <p className="text-xs text-muted-foreground">
                {formatterFailure.name} could not format this reply. The original reply is shown.
              </p>
            )}
            {row.last && (
              <MessageAttachments
                ids={message.artifact_ids.filter((id) => !inlineAttachmentIds.has(id))}
                files={snapshot.artifacts}
                at={row.at}
                standalone={
                  !row.text.trim() &&
                  message.author !== "user" &&
                  !snapshot.human_requests.some((request) => request.message_id === message.id)
                }
                open={(id) => openResource("files", id)}
              />
            )}
            {row.last &&
              snapshot.human_requests
                .filter((r) => r.message_id === message.id)
                .map((r) => (
                  <HumanReply
                    key={r.id}
                    request={r}
                    question={message.text}
                    author={author?.name ?? "Agent"}
                    refresh={refresh}
                  />
                ))}
          </MessageContent>
        </Message>
        {channel && (
          <p className="self-end text-xs text-muted-foreground">
            {channel.channel_label} ·{" "}
            {
              {
                pending: "Waiting for reply",
                sending: "Sending reply",
                retrying: "Delivery will retry",
                delivered: "Reply delivered",
                failed: "Delivery failed",
                unknown: "Delivery unconfirmed",
                cancelled: "Delivery cancelled",
              }[channel.state]
            }
          </p>
        )}
        {row.last && (
          <WorkActivity
            message={message}
            at={row.at}
            run={run}
            snapshot={snapshot}
            retryPreparation={(runId, revision) =>
              void act(async () => {
                await queueCommand(
                  `router-preparation:${runId}`,
                  `/v1/runs/${runId}/retry-preparation`,
                  { expected_revision: revision },
                );
              })
            }
            retryRoute={(route) =>
              void act(async () => {
                await queueCommand(
                  `route:${route.id}`,
                  `/v1/groups/${snapshot.thread.id}/routes/${route.id}/retry`,
                  { expected_revision: route.revision },
                );
              })
            }
            busy={busy}
          />
        )}
      </div>
    );
  }
  const pendingRequests = new Set(
    snapshot.human_requests
      .filter((request) => request.state === "pending")
      .map((request) => request.message_id),
  );
  const items = rows.map((row) => ({
    key:
      row.type === "message"
        ? row.key.replace(
            row.entry.message.id,
            messageKeys.get(row.entry.message.id) ?? row.entry.message.id,
          )
        : row.key,
    messageId: row.type === "message" && row.first ? row.entry.message.id : null,
    keepMounted:
      (row.type === "message" && row.last && pendingRequests.has(row.entry.message.id)) ||
      (row.type === "native" && row.fragment.run.status === "running"),
    row,
  }));
  return (
    <TranscriptViewport
      items={items}
      navigation={navigation?.threadId === snapshot.thread.id ? navigation : null}
      paginated={Boolean(snapshot.timeline.next_before)}
      renderRow={renderRow}
    />
  );
});
