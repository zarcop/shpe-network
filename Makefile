.PHONY: setup reset test test-db test-app web push-staging push-production build-staging build-production

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

# ───────────── Hosted projects (staging: fake people; production: real attendees) ─────────────
# Settings come from .env.deploy (see .env.deploy.example). Run `npx supabase login` once first.

# Loads .env.deploy and refuses to continue unless both projects are set and different, so a staging
# command can never be pointed at production.
deploy-env = test -f .env.deploy || { echo "Missing .env.deploy: copy .env.deploy.example and fill it in."; exit 1; }; \
	set -a && . ./.env.deploy && set +a && \
	test -n "$$STAGING_PROJECT_REF" && test -n "$$PRODUCTION_PROJECT_REF" || { echo "Set both project refs in .env.deploy."; exit 1; }; \
	test "$$STAGING_PROJECT_REF" != "$$PRODUCTION_PROJECT_REF" || { echo "Staging and production are the same project. Stopping."; exit 1; }

# Migrations plus the 300 fake people.
push-staging:
	@$(deploy-env); SUPABASE_DB_PASSWORD="$$STAGING_DB_PASSWORD" npx supabase db push --project-ref "$$STAGING_PROJECT_REF" --include-seed

# Migrations only: production is never seeded. The CLI lists the migrations and asks before applying them.
push-production:
	@$(deploy-env); SUPABASE_DB_PASSWORD="$$PRODUCTION_DB_PASSWORD" npx supabase db push --project-ref "$$PRODUCTION_PROJECT_REF"

# Static web builds in app/dist/<env>, each pointing at its own project. EXPO_NO_DOTENV keeps app/.env.local
# (your local database) out of the build.
build-staging:
	@$(deploy-env); cd app && EXPO_NO_DOTENV=1 EXPO_PUBLIC_SUPABASE_URL="https://$$STAGING_PROJECT_REF.supabase.co" \
		EXPO_PUBLIC_SUPABASE_KEY="$$STAGING_PUBLISHABLE_KEY" npx expo export --platform web --output-dir dist/staging

build-production:
	@$(deploy-env); cd app && EXPO_NO_DOTENV=1 EXPO_PUBLIC_SUPABASE_URL="https://$$PRODUCTION_PROJECT_REF.supabase.co" \
		EXPO_PUBLIC_SUPABASE_KEY="$$PRODUCTION_PUBLISHABLE_KEY" npx expo export --platform web --output-dir dist/production
