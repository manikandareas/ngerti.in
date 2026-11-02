import { Check, Clock3, LoaderCircle, Square, X } from "lucide-react";
import { useId, useState } from "react";
import type { NativeInteraction } from "@/types/native-interactions";

const quietButton =
  "inline-flex h-7 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2 text-[12px] leading-5 text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 touch:h-9";

function answerLines(record: NativeInteraction) {
  const answer = record.submission?.answer;
  if (record.type === "approval") {
    const choice =
      answer?.type === "approval"
        ? record.request.availableChoices.find((item) => item.choiceId === answer.choice_id)
        : undefined;
    return choice
      ? [
          {
            id: choice.choiceId,
            label: "Keputusanmu",
            value: choice.label ?? choice.decision,
            picked: true,
          },
        ]
      : [];
  }
  if (answer?.type !== "user_input") return [];
  return answer.answers.map((value) => {
    const question = record.request.questions.find((item) => item.id === value.questionId);
    return {
      id: value.questionId,
      label: question?.header || question?.question || "Jawabanmu",
      value: value.freeText ?? value.selectedLabel ?? value.selectedLabels?.join(", ") ?? "",
      picked: value.freeText === undefined,
    };
  });
}

/** Source AskSettledLine geometry, with application journal facts kept distinct from effects. */
export function NativeSettledCard({
  record,
  runStatus,
  cancellation,
  canObserve,
  checking,
  check,
}: {
  record: NativeInteraction;
  runStatus: string;
  cancellation: string;
  canObserve: boolean;
  checking: boolean;
  check: () => void;
}) {
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const submission = record.submission;
  const lines = answerLines(record);
  const answer = lines
    .map((line) => line.value)
    .filter(Boolean)
    .join(" · ");
  const kind = record.type === "user_input" ? "jawaban" : "keputusan";
  let label = "Permintaan tersimpan";
  let explanation = "Input native tidak tersedia saat ini. Riwayat ini tetap tersimpan.";
  let icon = <Clock3 size={13} />;
  if (submission?.state === "submitted") {
    label =
      record.type === "user_input"
        ? lines.length === 1
          ? lines[0]?.picked
            ? "Kamu memilih:"
            : "Kamu menjawab:"
          : "Jawaban diterima harness"
        : "Keputusan diterima harness";
    explanation =
      "Harness mengonfirmasi penerimaan. Ini tidak menyatakan tindakan dijalankan atau pekerjaan selesai.";
    icon = <Check size={13} strokeWidth={2.4} className="text-success-foreground" />;
  } else if (submission?.state === "unknown") {
    label = `Pengiriman ${kind} belum terkonfirmasi`;
    explanation = "Belum ada konfirmasi penerimaan. Jangan kirim ulang; periksa status.";
  } else if (submission?.state === "submitting") {
    label = `Menunggu konfirmasi ${kind}`;
    explanation = "Penerimaan belum dikonfirmasi. Pengiriman ulang dinonaktifkan.";
    icon = <LoaderCircle size={13} className="motion-safe:animate-spin" />;
  } else if (submission?.state === "not_dispatched") {
    label = `${record.type === "user_input" ? "Jawaban" : "Keputusan"} belum dikirim`;
    explanation =
      "Harness memastikan jawaban belum dikirim. Periksa permintaan terbaru sebelum mencoba lagi.";
    icon = <X size={13} />;
  } else if (cancellation === "requested") {
    label = "Stop diminta; belum dikonfirmasi harness";
    explanation =
      "Permintaan stop belum membuktikan native run berhenti. Tidak ada jawaban tercatat.";
    icon = <Square size={11} strokeWidth={2.4} />;
  } else if (cancellation === "confirmed") {
    label = "Run dihentikan; jawaban native tidak tercatat";
    explanation =
      "Penghentian run dikonfirmasi. Tidak ada keputusan akhir permintaan yang dilaporkan.";
    icon = <Square size={11} strokeWidth={2.4} />;
  } else if (record.observed_state === "not_pending") {
    label = "Permintaan tidak lagi tercantum";
    explanation = "Jawaban, penolakan, atau kedaluwarsa permintaan tidak dilaporkan.";
    icon = <X size={13} />;
  } else if (["succeeded", "failed", "cancelled"].includes(runStatus)) {
    label = "Run selesai; jawaban native tidak tercatat";
    explanation = "Status run tidak menentukan jawaban atau keputusan akhir permintaan ini.";
    icon = <X size={13} />;
  } else if (runStatus === "unknown") {
    label = "Status run belum terkonfirmasi";
    explanation =
      "Permintaan tersimpan. Status native perlu diperiksa sebelum tindakan berikutnya.";
  }
  const status = submission?.state ?? record.observed_state;
  const uncertain = status === "unknown" || status === "submitting" || status === "not_dispatched";
  return (
    <fieldset
      aria-label={`Status ${kind} native`}
      data-native-interaction={record.id}
      data-native-state={status}
      data-ask-card="settled"
      className="min-w-0 w-full max-w-[560px] border-0 p-0 text-left text-[13px] leading-[18px] text-muted-foreground"
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span aria-hidden="true" className="flex size-4 shrink-0 items-center justify-center">
          {icon}
        </span>
        <span dir="auto" aria-live="polite" className="min-w-0 truncate">
          {label}
          {answer && <span className="text-foreground/70"> {answer}</span>}
          {submission?.state === "submitted" &&
            lines.length === 1 &&
            record.type === "user_input" && <span> · diterima harness</span>}
        </span>
        {uncertain && (
          <button type="button" onClick={check} disabled={checking} className={quietButton}>
            {checking ? "Memeriksa…" : "Periksa status"}
          </button>
        )}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={detailId}
          className={quietButton}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Tutup rincian" : "Rincian"}
        </button>
      </div>
      {uncertain && <p className="ms-[22px] mt-1.5 text-[12px] leading-[18px]">{explanation}</p>}
      {open && (
        <div
          id={detailId}
          className="ms-[22px] mt-1.5 space-y-2 rounded-xl bg-foreground/[0.045] px-3 py-2 text-[13px] leading-5 text-foreground/70"
        >
          {record.type === "user_input" ? (
            record.request.questions.map((question) => (
              <p key={question.id} className="whitespace-pre-wrap break-words">
                {question.question}
              </p>
            ))
          ) : (
            <>
              <p className="break-words">
                {record.request.toolName ??
                  record.request.subject.toolName ??
                  record.request.subject.kind}
              </p>
              {(record.request.subject.command ??
                record.request.subject.path ??
                record.request.rawArgs) && (
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-[18px]">
                  {record.request.subject.command ??
                    record.request.subject.path ??
                    record.request.rawArgs}
                </pre>
              )}
            </>
          )}
          {lines.map((line) => (
            <p key={line.id} className="whitespace-pre-wrap break-words">
              <span className="text-muted-foreground">{line.label}: </span>
              {line.value || "Jawaban tersimpan"}
            </p>
          ))}
          {!uncertain && <p>{explanation}</p>}
          {record.observed_state === "not_pending" && submission && (
            <p>Permintaan tidak lagi tercantum pada pemeriksaan native terakhir.</p>
          )}
          {cancellation === "requested" && submission && (
            <p>Stop run diminta; konfirmasi penghentian native belum diterima.</p>
          )}
          {cancellation === "confirmed" && submission && <p>Penghentian run dikonfirmasi.</p>}
          {uncertain && !canObserve && <p>Riwayat dapat diperiksa tanpa membuka sesi native.</p>}
        </div>
      )}
    </fieldset>
  );
}
