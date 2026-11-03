export type Expectation = {
  goals: number;
  routines: number;
  artifacts: number;
  work_state?: "waiting";
  state?: "active" | "completed";
  same_goal?: boolean;
  objective_changed?: boolean;
  handoff?: boolean;
};
export type Scenario = {
  id: string;
  category: "direct" | "schedule" | "ongoing" | "explicit" | "context" | "delegation";
  group?: boolean;
  turns: { text: string; expected: Expectation }[];
};

const direct = { goals: 0, routines: 0, artifacts: 0 };
const ongoing = { goals: 1, routines: 0, artifacts: 0, work_state: "waiting" as const };

export function scenarios(reminderDate: string): Scenario[] {
  return [
    {
      id: "summary-audit-wording",
      category: "direct",
      turns: [
        {
          text: "rangkum isi paper ini\n\nSource excerpt: Retrieval-augmented generation combines a retriever with a generator. The retriever selects passages from a document index. The generator conditions its answer on those passages. Retrieval quality and source attribution need evaluation. Please return a concise summary of this supplied excerpt.",
          expected: direct,
        },
      ],
    },
    {
      id: "summary-paraphrase",
      category: "direct",
      turns: [
        {
          text: "Give me the gist in two sentences: retrieval supplies relevant passages to a generator; bad retrieval can still produce unsupported answers; evaluation should check the answer and its supporting source.",
          expected: direct,
        },
      ],
    },
    {
      id: "deliverable-with-several-steps",
      category: "direct",
      turns: [
        {
          text: "Compare these three supplied approaches, recommend one, then provide the result as a downloadable comparison.md file: A costs 2 units and takes 8 seconds; B costs 5 units and takes 3 seconds; C costs 9 units and takes 2 seconds. Our maximum is 5 units and 4 seconds. Explain your filtering and recommendation. Use only these facts.",
          expected: { ...direct, artifacts: 1 },
        },
      ],
    },
    {
      id: "research-audit-wording",
      category: "direct",
      turns: [
        {
          text: "research terkait ai agent\n\nFor this request, use only these supplied notes: an agent chooses actions to achieve an outcome; a workflow follows predefined transitions; tools expose actions; execution must handle errors and uncertain results. Explain the distinction and trade-offs in a short answer.",
          expected: direct,
        },
      ],
    },
    {
      id: "quoted-goal-is-data",
      category: "direct",
      turns: [
        {
          text: 'Translate this quoted sentence into English: "Buat goal untuk mengurus peluncuran sampai selesai." The quoted sentence is the entire text to translate.',
          expected: direct,
        },
      ],
    },
    {
      id: "hypothetical-tracking-discussion",
      category: "direct",
      turns: [
        {
          text: "If we wanted to keep a project moving over several weeks, how would a Goal differ from a Routine? I am comparing the concepts before choosing a project.",
          expected: direct,
        },
      ],
    },
    {
      id: "missing-input-is-not-ongoing",
      category: "direct",
      turns: [{ text: "Please translate the sentence I meant to paste.", expected: direct }],
    },
    {
      id: "one-shot-reminder",
      category: "schedule",
      turns: [
        {
          text: `Send me a short message to eat at 14:45 Asia/Makassar on ${reminderDate}.`,
          expected: { ...direct, routines: 1 },
        },
      ],
    },
    {
      id: "one-shot-paraphrase-and-edit",
      category: "schedule",
      turns: [
        {
          text: `At 14:45 Asia/Makassar on ${reminderDate}, post a quick hello here.`,
          expected: { ...direct, routines: 1 },
        },
        {
          text: "Move that hello to 15:15 on the same date and in the same timezone.",
          expected: { ...direct, routines: 1 },
        },
      ],
    },
    {
      id: "recurring-check-is-not-an-outcome",
      category: "schedule",
      turns: [
        {
          text: "Every Monday at 09:00 Asia/Makassar, check this thread for a new status note and send a short recap if there is one. If nothing changed, stay quiet.",
          expected: { ...direct, routines: 1 },
        },
      ],
    },
    {
      id: "implicit-ownership-and-correction",
      category: "ongoing",
      turns: [
        {
          text: "Take responsibility for getting my workshop materials ready through the successive draft and review rounds. Keep track of what remains across our conversations and carry the work forward as I send inputs over the coming days. The first draft arrives tomorrow; for now record what you are responsible for and wait for it.",
          expected: ongoing,
        },
        {
          text: "Change the outcome we are tracking: prepare the facilitator guide only, rather than all workshop materials. The draft will still arrive tomorrow, so keep waiting for it.",
          expected: { ...ongoing, same_goal: true, objective_changed: true },
        },
      ],
    },
    {
      id: "implicit-paraphrase",
      category: "ongoing",
      turns: [
        {
          text: "I am handing you ownership of bringing the grant application to submission readiness. Maintain its progress through the coming revisions, follow up on unresolved pieces when I return, and keep this responsibility until the application is ready. I will provide the requirements in my next conversation; hold the work pending those inputs.",
          expected: ongoing,
        },
      ],
    },
    {
      id: "explicit-goal-even-for-small-work",
      category: "explicit",
      turns: [
        {
          text: "Create a tracked Goal named Verified arithmetic. Calculate 19 + 23, publish the calculation as arithmetic.md, and complete that Goal once its result is ready.",
          expected: { goals: 1, routines: 0, artifacts: 1, state: "completed" },
        },
      ],
    },
    {
      id: "promote-when-responsibility-expands",
      category: "context",
      turns: [
        {
          text: "What are the main sections of a grant application? Answer briefly.",
          expected: direct,
        },
        {
          text: "Now take ownership of getting mine ready over our next several conversations. Track outstanding sections and carry it forward until ready for submission. I will bring the eligibility requirements tomorrow; wait for those before drafting.",
          expected: ongoing,
        },
        {
          text: "By the way, translate the phrase 'good morning' into French.",
          expected: { ...ongoing, same_goal: true },
        },
      ],
    },
    {
      id: "peer-request-is-not-an-outcome",
      category: "delegation",
      group: true,
      turns: [
        {
          text: "Coordinator, ask Reviewer to say hello to me.",
          expected: { ...direct, handoff: true },
        },
      ],
    },
  ];
}
