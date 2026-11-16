import type { ReactNode } from "react";
import "./onboarding.css";

export function OnboardingLayout({
  step,
  children,
  preview,
}: {
  step: 1 | 2;
  children: ReactNode;
  preview: ReactNode;
}) {
  return (
    <main className="onboarding-screen">
      <section
        className="onboarding-panel"
        aria-label={step === 1 ? "Organization setup" : "Connect AI"}
      >
        <header className="onboarding-header">
          <a href="/" className="account-wordmark" aria-label="Ngertiin">
            ngertiin.
          </a>
        </header>
        <div className="onboarding-content" data-step={step}>
          {children}
        </div>
        <footer className="onboarding-progress">
          <span className="onboarding-progress-bars" aria-hidden="true">
            {[1, 2].map((value) => (
              <span key={value} className="onboarding-progress-bar" data-active={value === step} />
            ))}
          </span>
          <span>
            <span className="sr-only">{step === 1 ? "Organization setup" : "Connect AI"}: </span>
            Step {step} of 2
          </span>
        </footer>
      </section>
      {preview}
    </main>
  );
}
