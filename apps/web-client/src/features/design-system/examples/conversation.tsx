import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";
import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bubble, BubbleContent, BubbleGroup } from "@/components/ui/bubble";
import {
  CodeBlock,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockTitle,
} from "@/components/ui/code-block";
import { Marker, MarkerContent } from "@/components/ui/marker";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageGroup,
  MessageHeader,
} from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import {
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoices,
  QuestionnaireDescription,
  QuestionnaireError,
  QuestionnaireItem,
  QuestionnaireNext,
  QuestionnairePrevious,
  QuestionnaireProgress,
  QuestionnaireSubmit,
  QuestionnaireTitle,
} from "@/components/ui/questionnaire";
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace";
import { type ExampleProps, type ExampleSet, renderExample } from "./shared";

const snippet =
  'import { Button } from "@/components/ui/button";\n\n<Button variant="default">Get started</Button>';
const questions = [
  {
    name: "theme",
    required: true,
    title: "Tema mana yang Anda pilih?",
    choices: [
      { value: "light", label: "Light mode" },
      { value: "dark", label: "Dark mode" },
    ],
  },
  {
    name: "density",
    required: true,
    title: "Bagaimana kepadatan tampilannya?",
    choices: [
      { value: "compact", label: "Compact" },
      { value: "comfortable", label: "Comfortable" },
    ],
  },
];

function QuestionnaireExample() {
  return (
    <Questionnaire
      items={questions}
      onSubmit={(event) => {
        event.preventDefault();
        toast.success("Jawaban contoh disimpan");
      }}
    >
      <QuestionnaireProgress />
      {questions.map((question) => (
        <QuestionnaireItem key={question.name} name={question.name} required={question.required}>
          <QuestionnaireTitle>{question.title}</QuestionnaireTitle>
          <QuestionnaireDescription>Pilih satu untuk melanjutkan preview.</QuestionnaireDescription>
          <QuestionnaireChoices>
            {question.choices.map((choice) => (
              <QuestionnaireChoice key={choice.value} value={choice.value}>
                {choice.label}
              </QuestionnaireChoice>
            ))}
          </QuestionnaireChoices>
          <QuestionnaireError />
        </QuestionnaireItem>
      ))}
      <QuestionnaireActions>
        <QuestionnairePrevious>Kembali</QuestionnairePrevious>
        <QuestionnaireNext>Lanjut</QuestionnaireNext>
        <QuestionnaireSubmit>Selesai</QuestionnaireSubmit>
      </QuestionnaireActions>
    </Questionnaire>
  );
}

function MessageScrollerExample() {
  return (
    <MessageScrollerProvider defaultScrollPosition="start">
      <MessageScroller className="h-64 rounded-lg border">
        <MessageScrollerViewport aria-label="Percakapan contoh">
          <MessageScrollerContent className="gap-4 p-4">
            {Array.from({ length: 8 }, (_, index) => ({
              id: `message-${index}`,
              text:
                index % 2 === 0
                  ? `Pertanyaan contoh ${index / 2 + 1}`
                  : "Berikut ringkasan yang sudah saya siapkan.",
              user: index % 2 === 0,
            })).map((message) => (
              <MessageScrollerItem key={message.id} messageId={message.id}>
                <Bubble
                  align={message.user ? "end" : "start"}
                  variant={message.user ? "default" : "secondary"}
                >
                  <BubbleContent>{message.text}</BubbleContent>
                </Bubble>
              </MessageScrollerItem>
            ))}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton direction="end" />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}

const examples = {
  attachment: () => (
    <div className="flex flex-wrap gap-3">
      <Attachment>
        <AttachmentMedia>
          <span className="font-mono text-caption">JSON</span>
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle>design-tokens.json</AttachmentTitle>
          <AttachmentDescription>Contoh lampiran · 2.4 KB</AttachmentDescription>
        </AttachmentContent>
      </Attachment>
      <Attachment state="processing">
        <AttachmentContent>
          <AttachmentTitle>research.pdf</AttachmentTitle>
          <AttachmentDescription>Sedang diproses…</AttachmentDescription>
        </AttachmentContent>
      </Attachment>
    </div>
  ),
  bubble: () => (
    <BubbleGroup>
      <Bubble align="end">
        <BubbleContent>Bisa buatkan ringkasan riset hari ini?</BubbleContent>
      </Bubble>
      <Bubble variant="secondary">
        <BubbleContent>Tentu. Berikut tiga temuan utama yang sudah saya rangkum.</BubbleContent>
      </Bubble>
      <Bubble variant="outline">
        <BubbleContent>Bubble outline untuk informasi pendukung.</BubbleContent>
      </Bubble>
    </BubbleGroup>
  ),
  "code-block": () => (
    <CodeBlock>
      <CodeBlockHeader>
        <CodeBlockTitle>button.tsx</CodeBlockTitle>
        <CodeBlockCopyButton value={snippet} className="ml-auto" />
      </CodeBlockHeader>
      <CodeBlockContent lineNumbers>{snippet}</CodeBlockContent>
    </CodeBlock>
  ),
  marker: () => (
    <div className="space-y-6">
      <Marker variant="separator">
        <MarkerContent>1 November 2026</MarkerContent>
      </Marker>
      <Marker variant="border">
        <MarkerContent>Pesan baru</MarkerContent>
      </Marker>
    </div>
  ),
  message: () => (
    <MessageGroup>
      <Message>
        <MessageAvatar>
          <Avatar>
            <AvatarFallback>TO</AvatarFallback>
          </Avatar>
        </MessageAvatar>
        <MessageContent>
          <MessageHeader>Tobi</MessageHeader>
          <Bubble variant="secondary">
            <BubbleContent>Ringkasan sudah siap untuk diperiksa.</BubbleContent>
          </Bubble>
          <MessageFooter>09:41</MessageFooter>
        </MessageContent>
      </Message>
      <Message align="end">
        <MessageContent>
          <Bubble>
            <BubbleContent>Terima kasih, lanjutkan.</BubbleContent>
          </Bubble>
          <MessageFooter>09:42</MessageFooter>
        </MessageContent>
      </Message>
    </MessageGroup>
  ),
  "message-scroller": MessageScrollerExample,
  questionnaire: QuestionnaireExample,
  trace: () => (
    <Trace>
      <TraceLine>
        <TraceIcon>
          <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} />
        </TraceIcon>
        <TraceTitle>Referensi ditemukan</TraceTitle>
        <TraceDescription>3 sumber</TraceDescription>
      </TraceLine>
      <TraceCollapsible>
        <TraceCollapsibleTrigger>
          <TraceLine>
            <TraceTitle>Lihat detail aktivitas</TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent>
          Referensi dibaca, temuan dibandingkan, dan ringkasan contoh disiapkan.
        </TraceCollapsibleContent>
      </TraceCollapsible>
      <TraceLine status="pending">
        <TraceTitle>Menunggu langkah berikutnya</TraceTitle>
      </TraceLine>
    </Trace>
  ),
} satisfies ExampleSet;

export default function ConversationExamples({ name }: ExampleProps) {
  return renderExample(examples, name);
}
