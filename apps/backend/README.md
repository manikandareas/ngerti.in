# Historical Python backend

This tree is retained for source audit and selective reuse under the harness-first plan. The active HTTP API, lifecycle authority and background services live in [apps/server](../server/README.md).

`ngertiin.api.app` and the provisioner `main()` reject startup. The active development command, package dependencies and CI do not load this tree. Accounts/billing, browser, integration and historical persistence modules have not automatically become accepted harness-first implementations. Audit them against the owning active ticket before reuse; remove irrelevant modules once their replacement boundary exists.

Historical migrations, tests and evidence are retained. No PostgreSQL data, Compose volume, secrets or user files were reset by NMA-047.
