import type { ReactNode } from "react";

export type ModelCapability = "reasoning" | "image";
export type ThinkingEffort = string;

export type ModelPickerModel = {
  id: string;
  name: string;
  description?: string;
  available?: boolean;
  capabilities?: readonly ModelCapability[];
  thinking?: readonly ThinkingEffort[];
  defaultThinking?: ThinkingEffort;
};

export type ModelPickerProvider = {
  id: string;
  name: string;
  icon?: ReactNode;
  models: readonly ModelPickerModel[];
};

export type ModelPickerProps = {
  providers: readonly ModelPickerProvider[];
  /** Override the visible provider in externally controlled previews. */
  activeProvider?: string;
  onProviderChange?: (providerId: string) => void;
  /** Retain unconnected harnesses in preview rails even before their models are discovered. */
  showEmptyProviders?: boolean;
  value?: string | null;
  defaultValue?: string;
  onValueChange?: (modelId: string, providerId: string, thinking?: ThinkingEffort | null) => void;
  thinking?: ThinkingEffort | null;
  defaultThinking?: ThinkingEffort;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
  dropdownIcon?: ReactNode;
  footer?: ReactNode;
  emptyProvider?: (providerId: string) => ReactNode;
  /** Keep the panel in document flow for embedded previews without moving form focus. */
  inline?: boolean;
  hideTrigger?: boolean;
};
