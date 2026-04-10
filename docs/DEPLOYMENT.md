# Deployment (Git + Cloudflare + Supabase)

## Recommended Setup

- GitHub hosts source repository.
- Cloudflare Pages hosts Vite frontend at `finance.christianfiebig.de`.
- Supabase hosts Postgres/Auth/API.

## Flow

1. Push to GitHub
2. Cloudflare Pages builds on push
3. Cloudflare serves static frontend
4. Frontend connects to Supabase via environment variables

## Environment Variables

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (anon or publishable key only)

## Database and auth

- Apply Supabase migrations (including `20260412_production_rls_auth.sql`). **Anonymous** clients can no longer read bank or persona settings; the app uses **Supabase Auth** (`signInWithPassword`).
- Create users under **Authentication → Users** (or enable sign-up). Persona settings rows are keyed by `auth.users.id` (`user_id`).
- Bank CSV seed (`npx tsx scripts/seed-bank-data.ts`) requires `SEED_OWNER_USER_ID` set to that user’s UUID so `bank_accounts.user_id` is populated (service role bypasses RLS).

## Domain

- Add DNS record for `finance.christianfiebig.de` in Cloudflare
- Attach custom domain to Pages project

## Security

- Keep service role key out of frontend
- Use RLS for all user-owned data
- Restrict CORS/origin settings to expected domains
