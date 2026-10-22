.PHONY: setup reset test-db

# Installs dependencies, starts local Supabase (ports 553xx), applies migrations and loads the seed.
setup:
	npm ci
	npx supabase start

reset:
	npx supabase db reset --local

test-db:
	npx supabase test db
