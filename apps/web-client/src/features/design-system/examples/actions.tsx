import { Add01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Spinner } from "@/components/ui/spinner";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { type ExampleProps, type ExampleSet, renderExample } from "./shared";

function Buttons() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        {(["default", "secondary", "outline", "ghost", "destructive", "link"] as const).map(
          (variant) => (
            <Button key={variant} variant={variant} onClick={() => toast(`Button: ${variant}`)}>
              {variant}
            </Button>
          ),
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm">Small</Button>
        <Button>Default</Button>
        <Button size="lg">Large</Button>
        <Button size="icon" aria-label="Tambah contoh">
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
        </Button>
        <Button disabled>Disabled</Button>
        <Button disabled aria-busy="true">
          <Spinner />
          Loading
        </Button>
      </div>
    </div>
  );
}

const examples = {
  button: Buttons,
  "button-group": () => (
    <ButtonGroup>
      <Button variant="outline" onClick={() => toast("Draft disimpan")}>
        Simpan
      </Button>
      <Button onClick={() => toast.success("Contoh diterbitkan")}>
        Terbitkan <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} aria-hidden="true" />
      </Button>
    </ButtonGroup>
  ),
  toggle: () => (
    <Toggle aria-label="Teks tebal" variant="outline" className="font-semibold">
      B
    </Toggle>
  ),
  "toggle-group": () => (
    <ToggleGroup type="single" defaultValue="left" aria-label="Perataan teks" variant="outline">
      <ToggleGroupItem value="left">Kiri</ToggleGroupItem>
      <ToggleGroupItem value="center">Tengah</ToggleGroupItem>
      <ToggleGroupItem value="right">Kanan</ToggleGroupItem>
    </ToggleGroup>
  ),
} satisfies ExampleSet;

export default function ActionsExamples({ name }: ExampleProps) {
  return renderExample(examples, name);
}
