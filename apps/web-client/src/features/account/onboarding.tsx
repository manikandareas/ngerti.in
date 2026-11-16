import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Navigate, useNavigate, useSearch } from "@tanstack/react-router";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { request } from "@/lib/api-client";
import { clientScope } from "@/lib/client-scope";
import { AccountField, useAccountAction } from "./account-forms";
import { OnboardingAI } from "./onboarding-ai";
import { OnboardingLayout } from "./onboarding-layout";
import { OnboardingPreview } from "./onboarding-preview";
import {
  organizationLogo,
  readOrganizationLogo,
  saveOrganizationLogo,
} from "./organization-branding";
import { OrganizationLogo } from "./organization-logo";
import { useAccount } from "./session";

export default function Onboarding() {
  const account = useAccount();
  const { step } = useSearch({ from: "/onboarding" });
  if (step === 2 && account.organization && account.access)
    return <OnboardingAI key={`${account.organization.id}:${clientScope()?.epoch}`} />;
  return <OrganizationOnboarding />;
}

function OrganizationOnboarding() {
  const account = useAccount();
  const navigate = useNavigate();
  const { create } = useSearch({ from: "/onboarding" });
  const [creating, setCreating] = useState(
    () => !!create || account.list.organizations.length === 0,
  );
  const [name, setName] = useState("");
  const [logo, setLogo] = useState("");
  const [readingLogo, setReadingLogo] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const upload = useRef<HTMLInputElement>(null);
  const uploadSequence = useRef(0);
  useEffect(
    () => () => {
      uploadSequence.current++;
    },
    [],
  );
  const action = useAccountAction();
  const canCreate = account.list.created_count < account.list.creation_limit;
  const showCreation = canCreate || (creating && advancing);
  const choosing = (!creating || !showCreation) && account.list.organizations.length > 0;
  const previewName = name.trim() || "Your organization";
  const session = account.session;
  if (!session) return null;
  if (account.organization && account.access && !create && !advancing) {
    if (account.hasAIIntegration === null)
      return <div className="account-loading" role="status" aria-label="Checking AI connections" />;
    return account.hasAIIntegration ? (
      <Navigate to="/" replace />
    ) : (
      <Navigate to="/onboarding" search={{ step: 2 }} replace />
    );
  }

  async function select(id: string) {
    setAdvancing(true);
    try {
      await account.select(id);
      if (clientScope()?.identity.organization !== id)
        throw new Error("Could not open this organization. Try again.");
      await navigate({ to: "/onboarding", search: { step: 2 }, replace: true });
    } finally {
      setAdvancing(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const user = account.session?.user;
    if (!user || !canCreate || !name.trim() || readingLogo) return;
    setAdvancing(true);
    try {
      await action.run(async () => {
        const organization = await account.createOrganization(name);
        if (logo) {
          try {
            saveOrganizationLogo(
              { server: account.server, user: user.id, organization: organization.id },
              logo,
            );
          } catch {
            toast.warning("Organization created, but its logo could not be saved on this device.");
          }
        }
        await select(organization.id);
      });
    } finally {
      setAdvancing(false);
    }
  }

  return (
    <OnboardingLayout step={1} preview={<OnboardingPreview name={previewName} logo={logo} />}>
      <h1>
        {choosing
          ? "Choose your organization."
          : showCreation
            ? "Name your organization."
            : "Your workspace is waiting."}{" "}
        <span className="onboarding-description">
          {choosing
            ? "Pick the space you want to work in."
            : showCreation
              ? "A space for you and your agents."
              : "Open your invitation to join your team."}
        </span>
      </h1>
      {choosing ? (
        <div className="onboarding-organizations">
          {account.list.organizations.map((organization) => (
            <Button
              key={organization.id}
              variant="ghost"
              disabled={action.busy}
              onClick={() => void action.run(() => select(organization.id))}
            >
              <OrganizationLogo
                name={organization.name}
                src={organizationLogo({
                  server: account.server,
                  user: session.user.id,
                  organization: organization.id,
                })}
              />
              <span className="onboarding-organization-name">{organization.name}</span>
              <HugeiconsIcon icon={ArrowRight01Icon} size={16} />
            </Button>
          ))}
          {canCreate && (
            <Button variant="link" onClick={() => setCreating(true)}>
              Create an organization
            </Button>
          )}
        </div>
      ) : showCreation ? (
        <form className="onboarding-form" onSubmit={(event) => void submit(event)}>
          <div className="onboarding-logo-picker">
            <button
              type="button"
              className="onboarding-logo-trigger"
              aria-label="Choose organization logo"
              aria-busy={readingLogo}
              disabled={action.busy || readingLogo}
              onClick={() => upload.current?.click()}
            >
              <OrganizationLogo name={previewName} src={logo} className="onboarding-logo" />
            </button>
            <span className="onboarding-logo-label">Organization logo</span>
            <input
              ref={upload}
              type="file"
              tabIndex={-1}
              className="sr-only"
              aria-label="Upload organization logo"
              accept="image/png,image/jpeg,image/webp"
              disabled={action.busy || readingLogo}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (!file) return;
                const sequence = ++uploadSequence.current;
                setReadingLogo(true);
                void readOrganizationLogo(file)
                  .then((value) => {
                    if (sequence === uploadSequence.current) setLogo(value);
                  })
                  .catch((error) => {
                    if (sequence === uploadSequence.current) toast.error(error.message);
                  })
                  .finally(() => {
                    if (sequence === uploadSequence.current) setReadingLogo(false);
                  });
              }}
            />
          </div>
          <AccountField label="Organization name">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your organization"
              maxLength={120}
              autoComplete="organization"
              required
              disabled={action.busy}
              autoFocus
            />
          </AccountField>
          <div className="onboarding-actions">
            <Button disabled={action.busy || readingLogo || !name.trim()}>
              {action.busy ? "Creating…" : "Continue"}
            </Button>
            {account.list.organizations.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                disabled={action.busy}
                onClick={() => {
                  if (account.organization) void navigate({ to: "/" });
                  else setCreating(false);
                }}
              >
                Back
              </Button>
            )}
          </div>
        </form>
      ) : account.list.organizations.length === 0 ? (
        <details className="account-setup">
          <summary>Set up this server</summary>
          <form
            className="account-form"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const token = String(new FormData(form).get("grant"));
              void action.run(async () => {
                await request("/v1/auth/bootstrap", { token });
                form.reset();
                await account.refresh();
              });
            }}
          >
            <AccountField label="Owner setup token">
              <Input
                name="grant"
                type="password"
                minLength={32}
                maxLength={128}
                autoComplete="off"
                required
              />
            </AccountField>
            <Button disabled={action.busy}>Complete setup</Button>
          </form>
        </details>
      ) : null}
    </OnboardingLayout>
  );
}
