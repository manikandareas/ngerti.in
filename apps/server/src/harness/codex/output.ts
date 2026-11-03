type Phase = "commentary" | "final_answer" | null;
/** Preserve native item boundaries and exclude progress from the canonical answer. */
export class AgentOutput {
  readonly items = new Map<string, { phase: Phase; text: string }>();
  item(id: string, phase?: Phase, text?: string) {
    const current = this.items.get(id) ?? { phase: null, text: "" };
    if (phase !== undefined) current.phase = phase;
    if (text !== undefined) current.text = text;
    this.items.set(id, current);
  }
  delta(id: string, text: string) {
    this.item(id);
    const current = this.items.get(id);
    if (current) current.text += text;
  }
  snapshot() {
    const all = [...this.items.values()];
    const hasFinal = all.some((item) => item.phase === "final_answer");
    return all
      .filter((item) => (hasFinal ? item.phase === "final_answer" : item.phase !== "commentary"))
      .map((item) => item.text)
      .filter(Boolean)
      .join("\n\n");
  }
}
