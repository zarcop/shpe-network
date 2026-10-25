.PHONY: setup reset test test-db test-app web push-staging push-production build-staging build-production deploy-staging deploy-production email-setup search-function backup-production restore-local hub-logos hub-logos-apply test-scripts

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

test: test-db test-app test-scripts

test-db:
	npx supabase test db

test-app:
	npm --prefix app test
	npm --prefix app run typecheck

test-scripts:
	node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test "scripts/*.test.ts" "supabase/functions/**/*.test.ts"

# ───────────── Hosted projects (staging: fake people; production: real attendees) ─────────────
# Settings come from .env.deploy (see .env.deploy.example). Run `npx supabase login` once first.

# Loads .env.deploy and refuses to continue unless both projects are set and different, so a staging
# command can never be pointed at production.
deploy-env = test -f .env.deploy || { echo "Missing .env.deploy: copy .env.deploy.example and fill it in."; exit 1; }; \
	set -a && . ./.env.deploy && set +a && \
	test -n "$$STAGING_PROJECT_REF" && test -n "$$PRODUCTION_PROJECT_REF" || { echo "Set both project refs in .env.deploy."; exit 1; }; \
	test "$$STAGING_PROJECT_REF" != "$$PRODUCTION_PROJECT_REF" || { echo "Staging and production are the same project. Stopping."; exit 1; }

# For commands that talk to the Supabase Management API: production by default, ENV=staging for staging. Uses your
# Supabase CLI login (npx supabase login), read from the macOS keychain unless SUPABASE_ACCESS_TOKEN is set.
api-target = PROJECT_REF="$$( [ "$(ENV)" = staging ] && echo "$$STAGING_PROJECT_REF" || echo "$$PRODUCTION_PROJECT_REF" )"; \
	export PROJECT_REF; echo "Using $${ENV:-production} ($$PROJECT_REF)"; \
	if [ -z "$$SUPABASE_ACCESS_TOKEN" ]; then t=$$(security find-generic-password -s "Supabase CLI" -w 2>/dev/null); \
	case "$$t" in go-keyring-base64:*) t=$$(echo "$${t\#go-keyring-base64:}" | base64 -d);; esac; export SUPABASE_ACCESS_TOKEN="$$t"; fi

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
		EXPO_PUBLIC_SUPABASE_KEY="$$STAGING_PUBLISHABLE_KEY" EXPO_PUBLIC_LOGO_DEV_KEY="$$LOGO_DEV_PUBLISHABLE_KEY" npx expo export --platform web --output-dir dist/staging

build-production:
	@$(deploy-env); cd app && EXPO_NO_DOTENV=1 EXPO_PUBLIC_SUPABASE_URL="https://$$PRODUCTION_PROJECT_REF.supabase.co" \
		EXPO_PUBLIC_SUPABASE_KEY="$$PRODUCTION_PUBLISHABLE_KEY" EXPO_PUBLIC_LOGO_DEV_KEY="$$LOGO_DEV_PUBLISHABLE_KEY" npx expo export --platform web --output-dir dist/production

# Puts each build on its own Vercel project (D20), created on the first deploy. Run `npx vercel login` once first.
VERCEL := npx --yes vercel@65.2.0
deploy-staging: build-staging
	$(VERCEL) deploy app/dist/staging --prod --yes --project who-is-going-to-shpe-staging --create-if-missing

deploy-production: build-production
	$(VERCEL) deploy app/dist/production --prod --yes --project who-is-going-to-shpe --create-if-missing

# Sign-in emails through Gmail with the templates from supabase/config.toml (D19). Once per project, and again after
# changing a template. Needs SMTP_USER and SMTP_PASS in .env.deploy.
email-setup:
	@$(deploy-env); $(api-target); node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/email-setup.ts

# Smart search (D21): uploads the Anthropic key from supabase/functions/.env (git-ignored) as a project secret, then
# deploys the function. Production by default, ENV=staging for staging. Again after changing the function.
search-function:
	@$(deploy-env); $(api-target); test -f supabase/functions/.env || { echo "Put ANTHROPIC_API_KEY=... in supabase/functions/.env first."; exit 1; }; \
	npx supabase secrets set --env-file supabase/functions/.env --project-ref "$$PROJECT_REF" && \
	npx supabase functions deploy smart-search --project-ref "$$PROJECT_REF"

# ───────────── Hub pictures (D18) ─────────────
# Daily, with the backup: finds logos for colleges/companies people added and flags for new countries, writes
# hub-logos.json to check, then hub-logos-apply saves it. Production by default; ENV=staging for staging.
hub-logos:
	@$(deploy-env); $(api-target); node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/hub-logos.ts find

hub-logos-apply:
	@$(deploy-env); $(api-target); node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/hub-logos.ts apply

# ───────────── Backups (the Free plan has none) ─────────────
# Data only: the table structure is rebuilt from supabase/migrations. Keeps everyone's profile, background and
# sign-in identity (auth.users, auth.identities); skips sessions, tokens and logs, which only matter while live.
# Files hold real people's data: they stay in backups/ (git-ignored, owner-only), never in GitHub or chat.
BACKUP_SKIP_TABLES := auth.instances auth.schema_migrations auth.audit_log_entries auth.refresh_tokens auth.sessions \
	auth.flow_state auth.one_time_tokens auth.saml_relay_states auth.saml_providers auth.sso_providers auth.sso_domains \
	auth.mfa_factors auth.mfa_challenges auth.mfa_amr_claims auth.mfa_recovery_code_sets auth.mfa_recovery_codes \
	auth.oauth_authorizations auth.oauth_consents auth.oauth_client_states auth.oauth_clients auth.custom_oauth_providers \
	auth.webauthn_credentials auth.webauthn_challenges auth.scim_users auth.scim_tokens
empty :=
comma := ,
BACKUP_SKIP := $(subst $(empty) $(empty),$(comma),$(strip $(BACKUP_SKIP_TABLES)))

backup-production:
	@$(deploy-env); mkdir -p backups && chmod 700 backups && file="backups/production-$$(date +%Y-%m-%d-%H%M).sql" && \
		SUPABASE_DB_PASSWORD="$$PRODUCTION_DB_PASSWORD" npx supabase db dump --project-ref "$$PRODUCTION_PROJECT_REF" \
		--data-only --use-copy --schema public,auth --exclude "$(BACKUP_SKIP)" --file "$$file" && \
		chmod 600 "$$file" && echo "Saved $$file"

# Practice restore: wipes the LOCAL database, rebuilds it from the migrations and loads a backup into it.
# Usage: make restore-local FILE=backups/production-....sql
restore-local:
	@test -f "$(FILE)" || { echo "Usage: make restore-local FILE=backups/<file>.sql"; exit 1; }
	npx supabase db reset --local --no-seed
	@# The reference-hubs migration already inserted the hubs; the backup has them too, with the same ids.
	@{ echo "truncate public.entities cascade;"; cat "$(FILE)"; } | \
		docker exec -i supabase_db_shpe-network psql -U postgres -q -v ON_ERROR_STOP=1 >/dev/null && \
		echo "Restored $(FILE) into the local database."
