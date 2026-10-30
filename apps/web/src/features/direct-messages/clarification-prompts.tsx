import { useAuth } from "@clerk/tanstack-react-start";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { NativeChoice } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { command, submit } from "./client";
import type { Thread } from "./state";

type Prompt = {
  prompt_id: string;
  native_session_id: string;
  execution_generation: string;
  thread_id: string;
  agent_id: string;
  question: string;
  choices: string[];
  multi_select: boolean;
};
export function ClarificationPrompts({ thread, working }: { thread: Thread; working: boolean }) {
  const { getToken, userId } = useAuth();
  const prompts = useQuery({
    queryKey: ["clarifications", userId, thread.thread_id],
    enabled: !!userId && working,
    refetchInterval: working ? 1500 : false,
    queryFn: async () =>
      submit<{ items: Prompt[] }>(
        command("clarification.list", { thread_id: thread.thread_id }),
        await getToken(),
      ),
  });
  if (!working) return null;
  if (prompts.isError && !prompts.data?.items.length)
    return (
      <p role="alert" className="text-sm text-danger">
        Pertanyaan agent belum dapat diperiksa.{" "}
        <Button variant="ghost" size="sm" onClick={() => void prompts.refetch()}>
          Periksa kembali
        </Button>
      </p>
    );
  if (!prompts.data?.items.length) return null;
  return (
    <div className="max-h-[50dvh] space-y-3 overflow-y-auto px-1">
      {prompts.data?.items.map((prompt) => (
        <PromptCard
          key={`${prompt.native_session_id}:${prompt.execution_generation}:${prompt.prompt_id}`}
          prompt={prompt}
          name={thread.agents.find((a) => a.agent_id === prompt.agent_id)?.display_name ?? "Agent"}
          refresh={() => void prompts.refetch()}
        />
      ))}
    </div>
  );
}
function PromptCard({
  prompt,
  name,
  refresh,
}: {
  prompt: Prompt;
  name: string;
  refresh: () => void;
}) {
  const { getToken } = useAuth();
  const [selected, setSelected] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const pending = useRef<ReturnType<typeof command> | null>(null);
  async function answer() {
    if (lock.current || (!selected.length && !text.trim() && !pending.current)) return;
    lock.current = true;
    setBusy(true);
    setError("");
    pending.current ??= command("clarification.answer", {
      thread_id: prompt.thread_id,
      native_session_id: prompt.native_session_id,
      execution_generation: prompt.execution_generation,
      prompt_id: prompt.prompt_id,
      answer: text.trim() || (prompt.multi_select ? JSON.stringify(selected) : selected[0]),
    });
    try {
      await submit(pending.current, await getToken());
      refresh();
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "STALE_GENERATION") {
        refresh();
        setError("Pertanyaan sudah berakhir atau dijawab di tab lain.");
      } else setError("Jawaban belum terkonfirmasi. Periksa kembali pertanyaan yang sama.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <form
      className="space-y-3 rounded-lg border bg-background p-4 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        void answer();
      }}
      aria-label={`Pertanyaan ${name}`}
    >
      <p className="font-medium">{name} membutuhkan jawabanmu</p>
      <p className="whitespace-pre-wrap wrap-anywhere">{prompt.question}</p>
      <fieldset disabled={busy || !!pending.current} className="space-y-2">
        <legend className="sr-only">Pilihan jawaban</legend>
        {prompt.choices.map((choice) => (
          <label key={choice} className="flex items-start gap-2">
            <NativeChoice
              type={prompt.multi_select ? "checkbox" : "radio"}
              name={prompt.prompt_id}
              checked={selected.includes(choice)}
              onChange={(e) => {
                setText("");
                setSelected(
                  prompt.multi_select
                    ? e.target.checked
                      ? [...selected, choice]
                      : selected.filter((c) => c !== choice)
                    : [choice],
                );
              }}
            />
            <span className="wrap-anywhere">{choice}</span>
          </label>
        ))}
        <label className="block space-y-2">
          {prompt.choices.length ? "Atau tulis jawaban sendiri" : "Jawabanmu"}
          <Textarea
            maxLength={16000}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setSelected([]);
            }}
          />
        </label>
      </fieldset>
      <Button
        type="submit"
        size="sm"
        disabled={busy || (!selected.length && !text.trim() && !pending.current)}
      >
        {busy ? "Mengirim…" : pending.current ? "Periksa jawaban" : "Kirim jawaban"}
      </Button>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
