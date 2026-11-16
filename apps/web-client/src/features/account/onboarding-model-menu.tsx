import { Settings01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  onboardingHarnessName,
  onboardingModelSamples,
  type OnboardingHarness,
} from "./onboarding-harnesses";

export function OnboardingModelMenu({
  harness,
  harnesses,
}: {
  harness: OnboardingHarness;
  harnesses: OnboardingHarness[];
}) {
  return (
    <div
      data-model-picker-content
      className="onboarding-preview-model-menu rounded-menu bg-popover text-popover-foreground"
    >
      <div className="flex flex-col gap-0.5 p-1.5">
        <div className="onboarding-preview-model-row">
          <img src={`/images/harnesses/${harness}.png`} alt="" width="16" height="16" />
          <span className="min-w-0 flex-1">
            <span className="block truncate">{onboardingModelSamples[harness][0].name}</span>
            <span className="block truncate text-[12px] leading-4 text-(--text-tertiary)">
              {onboardingHarnessName(harness)}
            </span>
          </span>
          <HugeiconsIcon icon={Tick02Icon} size={14} className="shrink-0 text-link" />
        </div>
        <div className="mx-2 my-[5px] h-[0.5px] bg-foreground/10" />
        {harnesses.map((id) => (
          <section key={id} className="flex flex-col gap-0.5">
            <h3 className="flex min-h-6 items-end px-2 pb-0.5 text-[12px] font-medium leading-4 text-(--text-tertiary)">
              {onboardingHarnessName(id)}
            </h3>
            {onboardingModelSamples[id]
              .filter((_, index) => id !== harness || index !== 0)
              .map((model) => (
                <div key={model.name} className="onboarding-preview-model-row">
                  <img src={`/images/harnesses/${id}.png`} alt="" width="16" height="16" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{model.name}</span>
                    <span className="block truncate text-[12px] leading-4 text-(--text-tertiary)">
                      {model.detail}
                    </span>
                  </span>
                </div>
              ))}
          </section>
        ))}
        <div className="mx-2 my-[5px] h-[0.5px] bg-foreground/10" />
        <div className="onboarding-preview-model-row text-muted-foreground">
          <HugeiconsIcon icon={Settings01Icon} size={16} />
          Manage connections
        </div>
      </div>
    </div>
  );
}
