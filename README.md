# Household Finance

Privacy-first dashboard for modelling household finances: accounts, loans, recurring cashflows, benefits, parental leave planning, and long-range projections. **All household facts belong to your database or local vault**—the app renders from data, not from hard-coded people or balances.

## Stack

React (TypeScript), Vite, Tailwind, Zustand, Recharts, date-fns, Papa Parse. Backend is abstracted behind an adapter interface; Supabase is the default implementation.

## Quick start

```bash
npm install
cp .env.example .env   # optional: cloud storage keys
npm run dev
```

- **Local (default):** unlock a folder-backed JSON vault from the sign-in screen (encryption optional).
- **Cloud:** set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env` after creating a Supabase project and applying your own Postgres schema migrations (this repo ignores `supabase/` for local-only setups—bring your migrations or regenerate from schema docs you keep privately).

Commands: `npm run build`, `npm run preview`, `npm test`.

## CI & hosting (typical Vite SPA path)

- **Continuous integration:** push / pull request to `main` or `master` runs [GitHub Actions](.github/workflows/ci.yml): `npm ci` → `npm run build` → `npm test`. Tests are only collected from `src/**/*.{test,spec}.{ts,tsx}` (local `backup/` and other stray trees are excluded); if none exist yet, the test step still passes.
- **Production build:** static output in `dist/`. Point any static host at that folder:
  - [Cloudflare Pages](https://pages.cloudflare.com/), [Netlify](https://www.netlify.com/), or [Vercel](https://vercel.com/) — build command `npm run build`, install `npm ci`, Node 20+.
  - Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the host’s env if you use cloud mode (same as local `.env`).

## Security & OSS hygiene

- Never commit `.env` or plaintext exports with real account data.
- Tax/benefit **parameter JSON** under `src/data/` is illustrative public reference data—not your household ledger.
- For pre-push checklist (secrets scan, deps, ignores), maintain your own hygiene; `npm audit` should be clean on this tree.

See `.env.example` for supported environment variables.

## License

MIT—see [LICENSE](./LICENSE).
