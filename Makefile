.PHONY: install setup migrate dev api check build docs-check
install:
	bun install --frozen-lockfile

setup migrate:
	bun run setup

dev:
	bun run dev

api:
	bun run dev:api

check:
	bun run check

build:
	bun run build

docs-check:
	bun run docs:check
