# Fact-check: the ages of chat, vibe coding, agents, and personal bots

Research date and age reference: **2026-11-04**. This is public-source research, not a change to the Ngertiin product roadmap.

## Question and clarified meaning

The supplied statement was:

> Chat (2 years) / Vibe Coding (1 year) / Agents (6 months) / Bots (3 months). What's next?

The user clarified that the numbers mean **the ages of apps or app categories**, rather than the duration of consecutive hype cycles. “Bots” means the recent generation of products such as **Grok Bot and Meta Muse**. Generic messaging bots are therefore not the relevant comparison.

The original post's publication date and representative apps for the first three categories were not supplied. Ages below consistently use public release or research-preview announcements, not company founding, private prototypes, or the first invention of an underlying technique. A category has no single birthday; representative products establish concrete counterexamples.

## Finding

**Partly correct.** The recent Grok Bot/Muse cohort is roughly two to three months old. The other numbers substantially understate the age of representative apps, or mix the age of a label with the age of products. A more defensible shorthand today is:

- Modern AI chat: approximately **four years**, using ChatGPT as the anchor.
- Vibe-coding app builders: approximately **two years**, using Bolt as an anchor; the label itself dates to **2025**.
- Modern coding-agent apps: approximately **one and a half to two years**, using Claude Code and Codex cloud.
- The named recent personal-agent releases: **weeks to roughly three months**, depending on the product.

These are overlapping product families, not mutually exclusive stages.

## Verified launch dates and ages

| Product or reference | Public milestone | Age on 2026-11-04 | Evidence and interpretation |
| --- | --- | --- | --- |
| ChatGPT | 2022-11-30 | 47 months, 5 days | OpenAI's original [Introducing ChatGPT](https://openai.com/index/chatgpt/) announcement. “Chat: 2 years” is too short for this app today. This is an anchor for the modern consumer LLM-chat wave, not the invention of chatbots. |
| Bolt | October 2024 | Approximately 25 months | Bolt's own [Bolt v2 announcement](https://bolt.new/blog/introducing-bolt-v2), dated 2025-10-02, explicitly says it went live in October 2024. Vibe-coding products therefore predate a one-year age window. Do not adopt the article's broader marketing claims about being first. |
| “Vibe coding” label | 2025, verified to year precision | More than one year; less than two years | In Karpathy's [2026-04-30 Sequoia Ascent publication](https://karpathy.bearblog.dev/sequoia-ascent-2026/), the interview introduction and question say he coined the phrase “last year.” This concerns terminology, not an app launch. |
| Claude Code | 2025-02-24, limited research preview | 20 months, 11 days | Anthropic's [Claude 3.7 Sonnet and Claude Code](https://www.anthropic.com/news/claude-3-7-sonnet) explicitly introduces an agentic coding tool that reads/edits code and runs commands and tests. |
| Codex cloud software-engineering agent | 2025-05-16, research preview | 17 months, 19 days | OpenAI's [Introducing Codex](https://openai.com/index/introducing-codex/). This is the cloud-agent launch, not the older Codex model name or the separate CLI launch. Both this and Claude Code contradict “agents: 6 months” as a general app-age claim today. |
| Grok Bot | 2026-08-11, beta | 2 months, 24 days; 85 days total | The official [Introducing Grok Bot](https://x.ai/news/introducing-grok-bot) announcement. Approximately three months is a reasonable rounding for this app. |
| Meta Muse personal-agent app | 2026-09-08 | 1 month, 27 days; 57 days total | Meta's [Introducing Muse](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/). The page also shows a 2026-09-30 update; the original publication date is the launch anchor. This is the personal-agent app, not the earlier Muse Spark model. |
| OpenAI dots | 2026-09-29, initial rollout | 1 month, 6 days; 36 days total | OpenAI's [Introducing dots](https://openai.com/index/introducing-dots/). An additional example of this recent cohort, with a different age. |
| Claude Duet | 2026-10-21, research preview | 14 days | Anthropic's [Introducing Claude Duet](https://claude.com/resources/articles/claude-duet). Research-preview availability is not equivalent to general availability. |

Calendar ages were calculated from each dated milestone to 2026-11-04. The elapsed-day count is also supplied for the newest releases. Bolt's evidence specifies a month, so no precise day was invented.

## What distinguishes these bots?

The useful distinction is between a bounded task agent and an ongoing personal/work agent. The named new products combine a persistent relationship, memory, connected apps, proactive follow-up, and execution on their own computer. These are vendor-described product characteristics, not independently tested success rates:

- [Grok Bot](https://x.ai/news/introducing-grok-bot) describes always-on agents that retain conversations, work on their own cloud computer, and coordinate with other bots.
- [Muse](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/) describes a personal agent with its own VM/browser that advances goals and keeps working after the app closes.
- [Dots](https://openai.com/index/introducing-dots/) describes always-on agents with their own cloud computer and goals that continue between conversations.
- [Claude Duet](https://claude.com/resources/articles/claude-duet) describes a proactive agent that follows connected apps and continues delegated work while the user is away.

Thus “bots” is a useful informal name for this cohort, but those products remain agents. In particular, age since the latest branded release is not the age of persistent agents as a category. As an earlier example, [OpenClaw's 2026-01-29 announcement](https://openclaw.ai/blog/introducing-openclaw) says its Clawd predecessor began in November 2025 and describes it as an agent platform accessed through chat apps. The general reasoning/action pattern also predates these apps: the original [ReAct paper](https://arxiv.org/abs/2210.03629) was submitted on 2022-10-06.

## What comes next?

**Forecast, not a verified next era:** continued development of agents that take responsibility for ongoing outcomes, improve from feedback, and coordinate specialists across services. Some of these mechanisms already exist, so the prospective change is wider, more dependable use rather than the sudden invention of another category. Anthropic's [2026-05-19 Managed Agents announcement](https://claude.com/resources/articles/new-in-claude-managed-agents) already describes memory refinement, outcome evaluation, and multiagent orchestration; Grok Bot already describes coordination between bots.

There is no basis in these launch dates for predicting that the next product generation must arrive after 1.5 months. Distinguishing the next useful development would require measuring completed outcomes, recurring use, reliability, human intervention, and cost rather than just the age or novelty of an app name.

## Evidence limits

- The original post's date remains unknown. The assessment is explicitly as of 2026-11-04.
- These are representative examples, not an exhaustive census or proof of the earliest app in each category.
- Karpathy's [original X post](https://x.com/karpathy/status/1886192184808149383), widely dated to February 2025, returned HTTP 403. The age table uses the year supported by his retrievable first-party publication. That publication discloses an LLM-generated summary and cleaned transcript which he reviewed.
- Launch announcements establish dates and stated positioning, not adoption, production readiness, or demonstrated autonomous reliability. Beta, preview, and phased rollout are preserved as separate milestones.
- Firecrawl search returned HTTP 402. Research continued through web search and direct retrieval of the official pages.
