import { HarnessIcon } from "@/components/harness-icon";
import { ModelPicker } from "@/components/ui/model-picker";
import { harnessModelCatalog } from "@/lib/harness-models";
import type { HarnessId } from "@/lib/harnesses";
import type { OnboardingHarness } from "./onboarding-harnesses";

export function OnboardingModelMenu({ harness }: { harness: OnboardingHarness }) {
  const providers = harnessModelCatalog([]).providers.map((provider) => ({
    ...provider,
    icon: <HarnessIcon id={provider.id as HarnessId} size={20} />,
  }));
  return (
    <div className="onboarding-preview-model-menu rounded-menu bg-popover text-popover-foreground">
      <ModelPicker
        providers={providers}
        activeProvider={harness}
        showEmptyProviders
        open
        inline
        hideTrigger
        emptyProvider={() => "Models appear after you connect and verify this harness."}
      />
    </div>
  );
}
