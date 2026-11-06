import { useEffect, useRef, useState } from "react";
import { HumanReplyCard } from "@/features/conversation/components/human-reply-card";
import { useComposerRequest } from "@/features/conversation/lib/composer-requests";
import type { HumanRequest } from "@/types/work";
import { tobi } from "./fixtures";
import { AssistantRow, type OpenSample, SampleAnswer, UserReply } from "./preview-primitives";

/** Preview latency only; no application command or provider request is sent. */
function useStudioDelay() {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolve = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      resolve.current?.();
    },
    [],
  );
  return (complete: () => void) =>
    new Promise<void>((done) => {
      resolve.current = done;
      timer.current = setTimeout(() => {
        complete();
        done();
        resolve.current = null;
      }, 500);
    });
}

export function ProductInputPreview({
  variant,
  group,
  open,
}: {
  variant: string;
  group: boolean;
  open: OpenSample;
}) {
  const purpose = variant.startsWith("approval")
    ? "approval"
    : variant === "review"
      ? "review"
      : "input";
  const [phase, setPhase] = useState(variant.replace("approval-", ""));
  const [text, setText] = useState(
    ["filled", "submitting", "unconfirmed", "error"].includes(variant) ? "Ringkas (5 poin)." : "",
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [reply, setReply] = useState(variant === "answered" ? "Ringkas (5 poin)." : "");
  const delay = useStudioDelay();
  const multiple = variant === "multiple";
  const options = ["single", "multiple", "custom"].includes(variant)
    ? {
        choices: multiple
          ? [
              { id: "headers", label: "Header kolom" },
              { id: "stock", label: "Harga dan stok" },
              { id: "duplicates", label: "Duplikasi produk" },
            ]
          : [
              { id: "short", label: "Ringkas" },
              { id: "detailed", label: "Rinci" },
            ],
        min: 1,
        max: multiple ? 3 : 1,
        allow_custom: variant === "custom",
      }
    : null;
  const question =
    purpose === "approval"
      ? "Setujui pembuatan checklist-impor.md versi Ringkas (5 poin)?"
      : purpose === "review"
        ? "Bisa tinjau checklist ini sebelum saya melanjutkan?"
        : multiple
          ? "Pengecekan apa yang perlu dimasukkan?"
          : options
            ? "Checklist impor sebaiknya Ringkas atau Rinci?"
            : "Apa yang perlu dijelaskan untuk staf operasional?";
  const request: Pick<HumanRequest, "id" | "state" | "purpose" | "options" | "action"> = {
    id: "studio-question",
    purpose,
    options,
    state: phase === "answered" ? "answered" : phase === "closed" ? "cancelled" : "pending",
    action:
      purpose === "approval"
        ? {
            tool_name: "ngertiin.create_file",
            arguments: {
              path: "checklist-impor.md",
              base64: btoa(
                "# Checklist impor\n\n1. Simpan salinan file sumber sebelum memulai.\n2. Cocokkan nama dan urutan kolom dengan template.\n3. Pastikan harga serta stok berupa angka yang valid.\n4. Tinjau duplikasi produk dan aturan impor ulang.\n5. Periksa pratinjau dan laporan hasil sebelum melanjutkan.",
              ),
            },
          }
        : null,
  };
  async function complete(value: string) {
    if (!value.trim() || phase === "submitting") return false;
    setReply(value);
    setPhase("submitting");
    await delay(() => setPhase("answered"));
    return true;
  }
  useComposerRequest(
    purpose !== "approval" && !options && !["answered", "closed"].includes(phase)
      ? {
          id: "studio-question",
          scope: "studio",
          author: tobi.name,
          question,
          busy: phase === "submitting",
          locked: phase === "unconfirmed",
          error: phase === "error" ? "Pesan belum terkirim. Coba lagi." : "",
          restoreText: phase === "unconfirmed" ? text : undefined,
          check: phase === "unconfirmed" ? () => complete(text) : undefined,
          submit: complete,
        }
      : null,
  );
  return (
    <>
      <AssistantRow group={group} open={open}>
        {!options && purpose !== "approval" && (
          <SampleAnswer text={question} group={group} open={open} />
        )}
        <HumanReplyCard
          request={request}
          author={tobi.name}
          question={question}
          selected={selected}
          text={text}
          setSelected={setSelected}
          setText={setText}
          busy={phase === "submitting"}
          uncertain={phase === "unconfirmed"}
          error={
            phase === "unconfirmed"
              ? "Keputusan belum terkonfirmasi. Periksa status pengiriman."
              : ""
          }
          submit={(decision) =>
            complete(
              decision
                ? decision === "approve"
                  ? "Approved."
                  : "Rejected."
                : purpose === "approval"
                  ? "Approved."
                  : [
                      ...(options?.choices
                        .filter((choice) => selected.includes(choice.id))
                        .map((choice) => choice.label) ?? []),
                      text,
                    ]
                      .filter(Boolean)
                      .join("\n"),
            )
          }
        />
      </AssistantRow>
      {phase === "answered" && <UserReply text={reply} />}
    </>
  );
}
