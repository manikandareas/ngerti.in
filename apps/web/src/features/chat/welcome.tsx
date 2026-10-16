import { BookOpen, Lightbulb, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const suggestions = [
  { icon: BookOpen, label: "Jelaskan topik yang ingin kupahami", prompt: "Bantu aku memahami " },
  {
    icon: Lightbulb,
    label: "Bantu hubungkan konsep-konsepnya",
    prompt: "Bantu aku menghubungkan konsep ",
  },
  { icon: Sparkles, label: "Buatkan rencana belajarku", prompt: "/course Aku ingin belajar " },
];

export function Welcome({ choose }: { choose: (text: string) => void }) {
  return (
    <section className="mx-auto flex w-full flex-col items-center text-center min-[701px]:pb-12">
      <img
        src="/images/gY5qJ.png"
        alt=""
        width={104}
        height={104}
        className="mb-[18px] size-[104px] rounded-full"
      />
      <h1 className="text-2xl font-extrabold min-[701px]:text-[28px]">Mau belajar apa hari ini?</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Dari rasa penasaran jadi paham. Kita mulai dari mana?
      </p>
      <div className="mt-6 flex flex-col items-center justify-center gap-2 min-[701px]:flex-row min-[701px]:flex-wrap">
        {suggestions.map(({ icon: Icon, label, prompt }) => (
          <Button
            key={label}
            variant="outline"
            className="h-auto max-w-full rounded-full bg-card px-3 py-2 text-xs whitespace-normal"
            onClick={() => choose(prompt)}
          >
            <Icon className="size-3.5" />
            {label}
          </Button>
        ))}
      </div>
    </section>
  );
}
