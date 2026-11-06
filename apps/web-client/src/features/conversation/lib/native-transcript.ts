import { useEffect, useState } from "react";
import type { NativeInteraction } from "@/types/native-interactions";
import type { Message, Run } from "@/types/workspace";
import { nativeMarkdownBoundaries } from "./native-transcript-boundary";

export interface NativeTranscriptFragment {
  key: string;
  run: Run;
  recordIds: string[];
}
export interface NativeTranscriptAnchor {
  offset: number;
  fragments: NativeTranscriptFragment[];
}

function anchorCandidate(record: NativeInteraction, run: Run, messages: Map<string, Message>) {
  const message = record.anchor_message_id ? messages.get(record.anchor_message_id) : null;
  if (!message || message.state === "deleted") return null;
  if (
    message.author === "user" &&
    message.id === run.input_message_id &&
    record.anchor_text_offset === null &&
    record.anchor_prefix_sha256 === null
  )
    return { message, offset: message.text.length, check: null };
  const offset = record.anchor_text_offset;
  const expected = record.anchor_prefix_sha256;
  if (
    message.author !== "agent" ||
    message.run_id !== run.id ||
    message.author_agent_id !== run.agent_id ||
    offset === null ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > message.text.length ||
    !expected
  )
    return null;
  return {
    message,
    offset,
    check: {
      key: `${message.id}:${offset}:${expected}`,
      revision: message.revision,
      prefix: message.text.slice(0, offset),
      expected,
    },
  };
}

/** Place only verified observed positions; edited/missing/legacy anchors use a per-run fallback. */
export function useNativeTranscript(messages: Message[], runs: Run[]) {
  const [verified, setVerified] = useState<Map<string, { prefix: string; valid: boolean }>>(
    () => new Map(),
  );
  const messageById = new Map(messages.map((message) => [message.id, message]));
  const records = runs.flatMap((run) =>
    (run.native_interactions ?? [])
      .filter((record) => record.submission?.state !== "submitted")
      .map((record) => ({ run, record, candidate: anchorCandidate(record, run, messageById) })),
  );
  const checks = new Map(
    records.flatMap(({ candidate }) =>
      candidate?.check ? [[candidate.check.key, candidate.check] as const] : [],
    ),
  );
  const signature = [...checks.values()]
    .map((check) => `${check.key}:${check.revision}`)
    .sort()
    .join("|");
  // biome-ignore lint/correctness/useExhaustiveDependencies: immutable server message IDs/revisions, offsets and expected hashes fully identify every prefix check; raw prefixes are never persisted.
  useEffect(() => {
    let cancelled = false;
    const missing = [...checks.values()].filter(
      (check) => verified.get(check.key)?.prefix !== check.prefix,
    );
    if (!missing.length) return;
    void Promise.all(
      missing.map(async (check) => {
        try {
          const bytes = await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(check.prefix),
          );
          const hash = [...new Uint8Array(bytes)]
            .map((byte) => byte.toString(16).padStart(2, "0"))
            .join("");
          return [check.key, { prefix: check.prefix, valid: hash === check.expected }] as const;
        } catch {
          return [check.key, { prefix: check.prefix, valid: false }] as const;
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      // Memory-only cache for this bounded scoped transcript; append-only streaming preserves cards.
      const next = new Map([...verified].filter(([key]) => checks.has(key)));
      for (const [key, valid] of results) next.set(key, valid);
      setVerified(next);
    });
    return () => {
      cancelled = true;
    };
  }, [signature]);

  const anchors = new Map<string, Map<number, Map<string, NativeTranscriptFragment>>>();
  const fallback = new Map<string, NativeTranscriptFragment>();
  const markdownBoundaries = new Map<string, ReturnType<typeof nativeMarkdownBoundaries>>();
  for (const { run, record, candidate } of records.sort(
    (a, b) =>
      a.record.observed_at.localeCompare(b.record.observed_at) ||
      a.record.id.localeCompare(b.record.id),
  )) {
    const cached = candidate?.check ? verified.get(candidate.check.key) : null;
    let located =
      candidate &&
      (!candidate.check || (cached?.valid && cached.prefix === candidate.check.prefix));
    if (
      candidate &&
      located &&
      candidate.check &&
      candidate.offset > 0 &&
      candidate.offset < candidate.message.text.length
    ) {
      let boundary = markdownBoundaries.get(candidate.message.id);
      if (!boundary) {
        boundary = nativeMarkdownBoundaries(candidate.message.text);
        markdownBoundaries.set(candidate.message.id, boundary);
      }
      located = boundary(candidate.offset);
    }
    let fragments = fallback;
    if (candidate && located) {
      let messageAnchors = anchors.get(candidate.message.id);
      if (!messageAnchors) {
        messageAnchors = new Map();
        anchors.set(candidate.message.id, messageAnchors);
      }
      let group = messageAnchors.get(candidate.offset);
      if (!group) {
        group = new Map();
        messageAnchors.set(candidate.offset, group);
      }
      fragments = group;
    }
    let fragment = fragments.get(run.id);
    if (!fragment) {
      fragment = {
        key: `${run.id}:${candidate && located ? `${candidate.message.id}:${candidate.offset}` : "fallback"}`,
        run,
        recordIds: [],
      };
      fragments.set(run.id, fragment);
    }
    fragment.recordIds.push(record.id);
  }
  return {
    anchors: new Map(
      [...anchors].map(([messageId, groups]) => [
        messageId,
        [...groups]
          .sort(([a], [b]) => a - b)
          .map(([offset, fragments]) => ({ offset, fragments: [...fragments.values()] })),
      ]),
    ),
    fallback: [...fallback.values()],
  };
}
