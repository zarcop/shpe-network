.PHONY: setup reset test test-db test-app web

# Installs dependencies, starts local Supabase (ports 553xx), applies migrations and loads the seed.
setup:
	npm ci
	npm --prefix app ci
	cp -n app/.env.example app/.env.local || true
	npx supabase start

# Expo web on http://localhost:8081. Sign-in codes land in Mailpit: http://127.0.0.1:55324
web:
	npm --prefix app run web -- --port 8081

reset:
	npx supabase db reset --local

test: test-db test-app

test-db:
	npx supabase test db

test-app:
	npm --prefix app test
	npm --prefix app run typecheck
