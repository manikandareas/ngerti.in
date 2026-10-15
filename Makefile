COMPOSE = docker compose --env-file .env -f infra/compose.yaml

.PHONY: install infra-up infra-down setup migrate dev web api worker check build content-inspect
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

content-inspect:
	uv run --project apps/backend python -m ngertiin.content inspect
