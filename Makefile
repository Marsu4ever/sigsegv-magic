# Shortcuts for the Money Coach app. Needs Node.js 20.9+ (with nvm: `nvm use`).
#
#   make         list these commands
#   make dev     run the app → http://localhost:3000 (installs packages only when needed)
#   make phone   same, but a phone on the same wifi can open it (use the "Network" address it prints)
#   make check   typecheck + lint — run before pushing
#   make data    rebuild data/demo/ from the raw CSVs in data/raw/ (see README)
#
# Pick the demo customer in the app itself (top of the screen).

# WHY: plain `make` lists the commands instead of starting something.
.DEFAULT_GOAL := help
.PHONY: help dev phone check data

help:
	@echo "make dev     run the app with live reload → http://localhost:3000"
	@echo "make phone   same, reachable from a phone on the same wifi (use the Network address)"
	@echo "make check   typecheck + lint — run before pushing"
	@echo "make data    rebuild data/demo/ from the raw CSVs in data/raw/ (see README)"

dev: node_modules .env.local
	npm run dev

phone: node_modules .env.local
	npm run dev -- -H 0.0.0.0

check:
	npm run typecheck
	npm run lint

data:
	npm run prepare-data

# Installs only if node_modules is missing or package.json / package-lock.json changed
# (e.g. after a git pull that adds a package). WHY touch: marks the install as up to date.
node_modules: package.json package-lock.json
	npm install
	@touch node_modules

# Only made if missing, so your keys are never overwritten.
.env.local:
	cp .env.example .env.local
