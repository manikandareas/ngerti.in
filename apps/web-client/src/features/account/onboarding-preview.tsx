import { ArrowDown01Icon, ArrowUp02Icon, ComputerIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { WorkspaceRail } from "@/app/workspace-rail";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Message, MessageContent } from "@/components/ui/message";
import { AttachInput } from "@/features/conversation/components/attach-input";
import { ComposerInput } from "@/features/conversation/components/composer-input";
import { AgentAvatar } from "@/features/conversation/components/identity";
import { ConversationNavigation } from "@/features/conversation/components/navigation";
import {
  previewAgents,
  previewConversations,
  previewMessages,
  previewThreads,
} from "./onboarding-preview-data";
import { type OnboardingHarness, onboardingModelSamples } from "./onboarding-harnesses";
import { OnboardingModelMenu } from "./onboarding-model-menu";
import { OrganizationLogo } from "./organization-logo";

const noop = () => {};

export function OnboardingPreview({
  name,
  logo,
  step = 1,
  harness = "codex",
  harnesses = [harness],
}: {
  name: string;
  logo: string;
  step?: 1 | 2;
  harness?: OnboardingHarness;
  harnesses?: OnboardingHarness[];
}) {
  const agent = previewAgents[0];
  const currentHarness = harnesses.includes(harness) ? harness : (harnesses[0] ?? harness);
  return (
    <aside className="onboarding-preview" aria-label="Workspace preview">
      <div className="onboarding-preview-window" data-step={step} aria-hidden="true" inert>
        <div className="application-frame onboarding-preview-home" data-step={step}>
          {step === 1 && (
            <WorkspaceRail
              settings={false}
              marketplace={false}
              onConversation={noop}
              onMarketplace={noop}
              onSettings={noop}
            />
          )}
          <div className="application-body">
            <div className="app-screen">
              {step === 1 && (
                <div className="workspace-sidebar app-sidebar min-h-0">
                  <ConversationNavigation
                    agents={previewAgents}
                    threads={previewThreads}
                    activities={[]}
                    previews={previewConversations}
                    threadId={previewThreads[0].id}
                    busy={false}
                    createMenu={false}
                    setCreateMenu={noop}
                    createAgent={noop}
                    createGroup={noop}
                    choose={noop}
                    organizationHeader={
                      <button type="button" className="organization-switcher">
                        <span className="organization-switcher-identity">
                          <OrganizationLogo name={name} src={logo} />
                          <span>{name}</span>
                        </span>
                        <HugeiconsIcon icon={ArrowDown01Icon} size={14} strokeWidth={1.5} />
                      </button>
                    }
                  />
                </div>
              )}
              <div className="app-surface workspace-main flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <header className="workspace-chat-header grid shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2.5 px-5 py-2.5">
                  <div className="header-identity-position col-start-2 row-start-1 flex min-w-0 justify-center">
                    <Button
                      variant="ghost"
                      className="header-action header-identity inline-flex h-auto min-w-0 items-center gap-2"
                    >
                      <AgentAvatar
                        agent={agent}
                        className="size-6 rounded-lg text-xs"
                        animated={false}
                        followPointer={false}
                      />
                      <span>{agent.name}</span>
                    </Button>
                  </div>
                  <div className="header-model-actions col-start-3 row-start-1 flex min-w-0 items-center justify-end gap-3">
                    <div className="onboarding-preview-model-anchor">
                      <Button
                        variant="ghost"
                        className="header-action model-selector gap-2"
                        aria-expanded={step === 2}
                      >
                        <img
                          src={`/images/harnesses/${currentHarness}.png`}
                          alt=""
                          width="16"
                          height="16"
                        />
                        <span className="min-w-0 truncate">
                          {onboardingModelSamples[currentHarness][0].name}
                        </span>
                        <HugeiconsIcon icon={ArrowDown01Icon} size={12} />
                      </Button>
                      {step === 2 && (
                        <OnboardingModelMenu harness={currentHarness} harnesses={harnesses} />
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="header-action header-browser-action"
                      aria-label="Browser agent"
                    >
                      <HugeiconsIcon icon={ComputerIcon} size={18} strokeWidth={1.5} />
                    </Button>
                  </div>
                </header>
                <div className="conversation-column onboarding-preview-timeline flex min-h-0 flex-1 flex-col gap-4">
                  <div className="conversation-date">
                    <span>Today</span>
                  </div>
                  {previewMessages.map((message) => (
                    <Message
                      key={message.id}
                      align={message.author === "user" ? "end" : "start"}
                      className="conversation-message"
                    >
                      <MessageContent>
                        <Bubble
                          variant="secondary"
                          className={
                            message.author === "user" ? "chat-user-bubble" : "chat-agent-bubble"
                          }
                        >
                          <BubbleContent className="chat-bubble-content whitespace-pre-wrap text-[15px] leading-[22px]">
                            <p>{message.text}</p>
                            <span className="message-time">{message.time}</span>
                          </BubbleContent>
                        </Bubble>
                      </MessageContent>
                    </Message>
                  ))}
                </div>
                <div className="composer-dock w-full shrink-0 px-5 pt-3 pb-4">
                  <div className="conversation-composer flex items-end gap-1.5 p-2">
                    <AttachInput disabled={false} count={0} addFiles={noop} />
                    <ComposerInput
                      ref={null}
                      value=""
                      placeholder={`Pesan untuk ${agent.name}…`}
                      readOnly
                      lookup={() => undefined}
                      retry={noop}
                      onChange={noop}
                      onEnter={noop}
                      onFiles={noop}
                      onMultiline={noop}
                      report={noop}
                      suggestions={false}
                    />
                    <Button size="icon" className="composer-send" aria-label="Kirim" disabled>
                      <HugeiconsIcon icon={ArrowUp02Icon} size={16} strokeWidth={1.75} />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
