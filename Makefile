COMPOSE = docker compose --env-file .env -f infra/compose.yaml

.PHONY: install infra-up infra-down setup migrate dev web api check build docs-check e2b-templates e2b-browser-probe
install:
	bun install
	uv sync --project apps/backend

infra-up:
	$(COMPOSE) up -d --wait

infra-down:
	$(COMPOSE) down

setup migrate:
	uv run --project apps/backend python -m ngertiin.setup

dev:
	bun run dev

web:
	bun run dev:web

api:
	bun run dev:api

check:
	bun run check

build:
	bun run build

docs-check:
	python3 scripts/check_docs.py

e2b-templates:
	uv run --project apps/backend python scripts/build_e2b_templates.py

e2b-browser-probe:
	uv run --project apps/backend python scripts/probe_e2b_browser.py --live
