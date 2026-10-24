# Ngertiin product direction

The authoritative specification is [Ngertiin Multi Agent in Notion](https://app.notion.com/p/402abdd6187381e3a720f4b01d824e1a).

- One user talks to persistent agents in private DMs or groups. Agent identities/configuration persist across conversations; private histories remain separate.
- Agents capture, revise and advance goals through ordinary conversation. A form or approval toggle is not required to begin legitimate goal work.
- Hermes owns execution, sessions, proactive triggers, cancellation and recovery. Product UI and API expose durable state and authenticated commands.
- Explicit group mentions and handoffs produce actual peer work and scoped artifacts. No multi-human collaboration is implied.
- Revocation, stop, pause, duplicate admission and unknown external effects retain durable semantics across restart.
- The latest implementation is the sole runtime path. Superseded code is retired, while user data, migration history and verification evidence are preserved.

See [the implementation and acceptance report](docs/research/nma-025-026-acceptance-cutover.md) for tested behavior and remaining release gates. Historical V1 specifications do not constrain this implementation.
