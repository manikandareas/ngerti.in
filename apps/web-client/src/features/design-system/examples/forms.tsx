import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  type ExampleProps,
  type ExampleSet,
  renderExample,
} from "@/features/design-system/examples/shared";

function Inputs() {
  return (
    <div className="mx-auto max-w-sm space-y-5">
      <div className="space-y-2">
        <Label htmlFor="demo-email">Email</Label>
        <Input id="demo-email" type="email" placeholder="you@company.com" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="demo-invalid">Error</Label>
        <Input
          id="demo-invalid"
          defaultValue="alex@"
          aria-invalid="true"
          aria-describedby="demo-invalid-help"
        />
        <p id="demo-invalid-help" className="text-caption text-destructive">
          Masukkan alamat email yang valid.
        </p>
      </div>
      <Input disabled aria-label="Input nonaktif" value="Disabled" />
    </div>
  );
}

function Fields() {
  return (
    <div className="mx-auto max-w-sm">
      <Field data-invalid="true">
        <FieldLabel htmlFor="demo-field">Nama agent</FieldLabel>
        <Input
          id="demo-field"
          placeholder="Tobi"
          aria-invalid="true"
          aria-describedby="demo-field-description demo-field-error"
        />
        <FieldDescription id="demo-field-description">
          Nama yang mudah dikenali dalam percakapan.
        </FieldDescription>
        <FieldError id="demo-field-error">Nama wajib diisi.</FieldError>
      </Field>
    </div>
  );
}

function Sliders() {
  const [value, setValue] = useState([64]);
  return (
    <div className="mx-auto max-w-sm space-y-5">
      <div className="flex justify-between">
        <Label htmlFor="demo-slider">Volume</Label>
        <output className="font-mono text-caption">{value[0]}%</output>
      </div>
      <Slider
        id="demo-slider"
        value={value}
        onValueChange={setValue}
        max={100}
        step={1}
        aria-label="Volume"
      />
      <Slider defaultValue={[30]} disabled aria-label="Slider nonaktif" />
    </div>
  );
}

function Calendars() {
  const [date, setDate] = useState<Date | undefined>(new Date(2026, 10, 1));
  return (
    <div className="flex justify-center">
      <Calendar
        mode="single"
        selected={date}
        onSelect={setDate}
        defaultMonth={new Date(2026, 10, 1)}
        className="rounded-lg border"
      />
    </div>
  );
}

function Comboboxes() {
  const agents = ["Tobi", "Bud", "Chief", "Sales Outbound"];
  return (
    <div className="mx-auto max-w-sm">
      <Combobox items={agents}>
        <ComboboxInput placeholder="Cari agent…" aria-label="Cari agent" />
        <ComboboxContent>
          <ComboboxEmpty>Agent tidak ditemukan.</ComboboxEmpty>
          <ComboboxList>
            {(agent: string) => (
              <ComboboxItem key={agent} value={agent}>
                {agent}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}

const examples = {
  field: Fields,
  label: () => (
    <div className="mx-auto max-w-sm space-y-2">
      <Label htmlFor="demo-label">
        Nama pengguna <span className="text-destructive">*</span>
      </Label>
      <Input id="demo-label" placeholder="Alex Morgan" />
    </div>
  ),
  input: Inputs,
  "input-group": () => (
    <div className="mx-auto max-w-sm">
      <InputGroup>
        <InputGroupAddon>
          <HugeiconsIcon icon={Search01Icon} strokeWidth={2} aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput aria-label="Cari percakapan" placeholder="Cari percakapan…" />
      </InputGroup>
    </div>
  ),
  "input-otp": () => (
    <div className="flex justify-center">
      <InputOTP maxLength={6} pattern={REGEXP_ONLY_DIGITS} aria-label="Kode verifikasi">
        <InputOTPGroup>
          {[0, 1, 2].map((index) => (
            <InputOTPSlot key={index} index={index} />
          ))}
        </InputOTPGroup>
        <InputOTPSeparator />
        <InputOTPGroup>
          {[3, 4, 5].map((index) => (
            <InputOTPSlot key={index} index={index} />
          ))}
        </InputOTPGroup>
      </InputOTP>
    </div>
  ),
  "native-select": () => (
    <div className="mx-auto max-w-sm space-y-2">
      <Label htmlFor="demo-native">Bahasa</Label>
      <NativeSelect id="demo-native" defaultValue="id">
        <NativeSelectOption value="id">Bahasa Indonesia</NativeSelectOption>
        <NativeSelectOption value="en">English</NativeSelectOption>
      </NativeSelect>
    </div>
  ),
  textarea: () => (
    <div className="mx-auto max-w-sm space-y-2">
      <Label htmlFor="demo-textarea">Instruksi agent</Label>
      <Textarea id="demo-textarea" placeholder="Jelaskan bagaimana agent membantu…" />
    </div>
  ),
  checkbox: () => (
    <div className="mx-auto max-w-sm space-y-4">
      <div className="flex items-center gap-3">
        <Checkbox id="demo-check" defaultChecked />
        <Label htmlFor="demo-check">Kirim notifikasi</Label>
      </div>
      <div className="flex items-center gap-3">
        <Checkbox id="demo-partial" checked="indeterminate" />
        <Label htmlFor="demo-partial">Pilihan parsial</Label>
      </div>
      <div className="flex items-center gap-3">
        <Checkbox id="demo-check-disabled" disabled />
        <Label htmlFor="demo-check-disabled">Tidak tersedia</Label>
      </div>
    </div>
  ),
  "radio-group": () => (
    <RadioGroup defaultValue="personal" aria-label="Jenis workspace" className="mx-auto max-w-sm">
      {["personal", "team"].map((value) => (
        <div key={value} className="flex items-center gap-3">
          <RadioGroupItem id={`demo-radio-${value}`} value={value} />
          <Label htmlFor={`demo-radio-${value}`}>
            {value === "personal" ? "Personal" : "Team"}
          </Label>
        </div>
      ))}
    </RadioGroup>
  ),
  switch: () => (
    <div className="mx-auto max-w-sm space-y-5">
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="demo-switch">Aktifkan notifikasi</Label>
        <Switch id="demo-switch" defaultChecked />
      </div>
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="demo-switch-disabled">Pengaturan nonaktif</Label>
        <Switch id="demo-switch-disabled" disabled />
      </div>
    </div>
  ),
  slider: Sliders,
  select: () => (
    <div className="mx-auto max-w-sm space-y-2">
      <Label htmlFor="demo-select">Agent</Label>
      <Select defaultValue="tobi">
        <SelectTrigger id="demo-select" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="tobi">Tobi</SelectItem>
          <SelectItem value="bud">Bud</SelectItem>
          <SelectItem value="chief">Chief</SelectItem>
        </SelectContent>
      </Select>
    </div>
  ),
  combobox: Comboboxes,
  calendar: Calendars,
} satisfies ExampleSet;

export default function FormExamples({ name }: ExampleProps) {
  return renderExample(examples, name);
}
