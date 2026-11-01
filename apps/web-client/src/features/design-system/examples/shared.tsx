import type { ComponentType } from "react";
import type { ComponentName } from "@/lib/component-catalog";

export type ExampleProps = { name: ComponentName };
export type ExampleSet = Partial<Record<ComponentName, ComponentType>>;

export function renderExample(examples: ExampleSet, name: ComponentName) {
  const Example = examples[name];
  if (!Example) throw new Error(`Missing primitive example: ${name}`);
  return <Example />;
}
