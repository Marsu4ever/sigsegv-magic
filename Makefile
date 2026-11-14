# Shortcuts for the Money Coach app. Needs Node.js 20.9+ (with nvm: `nvm use`).
#
#   make         install + run the app → http://localhost:3000
#   make phone   same, but a phone on the same wifi can open it (use the "Network" address it prints)
#   make check   typecheck + lint — run before pushing
#   make data    rebuild data/demo/ from the raw CSVs in data/raw/ (see README)
#
# Pick the demo customer in the app itself (top of the screen).

.PHONY: dev phone check data

dev: .env.local
	npm install
	npm run dev

phone: .env.local
	npm install
	npm run dev -- -H 0.0.0.0

check:
	npm run typecheck
	npm run lint

data:
	npm run prepare-data

# Only made if missing, so your keys are never overwritten.
.env.local:
	cp .env.example .env.local
