import type { Goal, Message, Thread } from "./state";

const labels: Record<Goal["status"], string> = {
  active: "Aktif",
  waiting: "Menunggu",
  blocked: "Terhambat",
  paused: "Dijeda",
  stopped: "Dihentikan",
  completed: "Selesai",
};

export function GoalProgress({
  goals,
  messages,
  agents = [],
}: {
  goals: Goal[];
  messages: Message[];
  agents?: Thread["agents"];
}) {
  if (!goals.length) return null;
  return (
    <section aria-label="Progress goals" className="space-y-3 border-b pb-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">Goals percakapan</h2>
        <span className="text-xs text-muted-foreground">{goals.length} tanggung jawab</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Agent mengelola progress di sini. Ubah, jeda, atau hentikan lewat percakapan.
      </p>
      {goals.map((goal) => (
        <details key={goal.goal_id} className="rounded-lg border px-4 py-3">
          <summary className="cursor-pointer text-sm marker:text-muted-foreground">
            <span className="font-medium wrap-anywhere">{goal.title}</span>
            <span className="ml-2 text-xs text-muted-foreground">{labels[goal.status]}</span>
          </summary>
          <div className="mt-3 space-y-3 text-sm wrap-anywhere">
            {goal.responsible_agent_id && agents.length > 1 && (
              <p className="text-xs text-muted-foreground">
                Penanggung jawab:{" "}
                {agents.find((a) => a.agent_id === goal.responsible_agent_id)?.display_name ??
                  "Agent"}
              </p>
            )}
            <p className="whitespace-pre-wrap">{goal.objective}</p>
            {agents.length > 1 && goal.units && (
              <details>
                <summary className="cursor-pointer text-xs">Kontribusi agent</summary>
                <ul className="mt-2 space-y-2">
                  {messages
                    .filter(
                      (m) =>
                        m.author_kind === "agent" && goal.units?.some((u) => u.run_id === m.run_id),
                    )
                    .map((m) => (
                      <li key={m.message_id}>
                        <a
                          className="inline-flex min-h-11 items-center text-xs underline"
                          href={`#message-${m.message_id}`}
                        >
                          {agents.find((a) => a.agent_id === m.author_agent_id)?.display_name ??
                            "Agent"}
                          : lihat hasil
                        </a>
                      </li>
                    ))}
                </ul>
              </details>
            )}
            {goal.progress && <p className="whitespace-pre-wrap">{goal.progress}</p>}
            {goal.wake_condition && (
              <p className="text-muted-foreground">Menunggu: {goal.wake_condition}</p>
            )}
            {goal.evidence.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold">Bukti hasil</h3>
                {goal.evidence.map((evidence) => (
                  <div key={evidence.evidence_id} className="space-y-1 border-l-2 pl-3">
                    <p className="font-medium">{evidence.criterion}</p>
                    <p className="text-muted-foreground">{evidence.summary}</p>
                    {messages.some(
                      (message) => message.message_id === evidence.source_message_id,
                    ) && (
                      <a
                        className="inline-flex min-h-11 items-center text-xs underline"
                        href={`#message-${evidence.source_message_id}`}
                      >
                        Lihat pesan hasil
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </details>
      ))}
    </section>
  );
}
