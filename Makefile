COMPOSE = docker compose --env-file .env -f infra/compose.yaml

.PHONY: install infra-up infra-down setup migrate dev web api worker check build quota-inspect task-inspect files-inspect sandbox-inspect computer-inspect reset-dev docs-check
install:
	bun install
	uv sync --project apps/backend

infra-up:
	$(COMPOSE) up -d --wait

infra-down:
	$(COMPOSE) down

setup:
	uv run --project apps/backend python -m ngertiin.setup

migrate:
	uv run --project apps/backend python -m ngertiin.setup --database-only

dev:
	bun run dev

web:
	bun run dev:web

api:
	bun run dev:api

worker:
	bun run dev:worker

check:
	bun run check

build:
	bun run build

quota-inspect:
	uv run --project apps/backend python scripts/inspect_quotas.py

task-inspect:
	uv run --project apps/backend python scripts/inspect_tasks.py

files-inspect:
	uv run --project apps/backend python scripts/inspect_files.py

sandbox-inspect:
	uv run --project apps/backend python scripts/inspect_sandbox.py

computer-inspect:
	uv run --project apps/backend python scripts/inspect_computer.py

.PHONY: schedule-inspect
schedule-inspect:
	uv run --project apps/backend python scripts/inspect_schedules.py

reset-dev:
	uv run --project apps/backend python scripts/reset_dev.py --execute

docs-check:
	python3 scripts/check_docs.py

.PHONY: daytona-preflight daytona-inspect
daytona-preflight:
	uv run --project apps/backend python -m ngertiin.daytona_trial preflight

daytona-inspect:
	uv run --project apps/backend python scripts/inspect_daytona_trial.py
