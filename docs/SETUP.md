# Project Setup

Implementation stack and setup instructions (for when we build).

---

## Stack

| Layer | Choice |
|-------|--------|
| **Frontend** | **Vite** (React + TypeScript recommended). |
| **Backend / DB / Auth** | **Supabase** (PostgreSQL, Auth, optional Edge Functions). |
| **Styling** | **Tailwind CSS + shadcn/ui** with design tokens from root `DESIGN.md`. |

Use **Vite** instead of Create React App or Next.js for this app.

---

## Initial Setup (When Implementing)

1. **Vite**
   - Create app: `npm create vite@latest . -- --template react-ts` (or in a subfolder and move).
   - Install deps: `npm install`.
   - Add Supabase client: `npm install @supabase/supabase-js`.
   - Tailwind and shadcn are preconfigured in this repository (`tailwind.config.ts`, `components.json`, `src/components/ui/`).

2. **Supabase**
   - Create project at [supabase.com](https://supabase.com).
   - Get project URL and anon key; store in `.env` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
   - Create tables from [ENTITIES.md](./ENTITIES.md) (Account, Transaction, Category, IncomeState, IncomeComponent, Goal, Buffer config).
   - Enable Auth if needed (email/password or similar for household).

3. **Repo**
   - No code in this phase; docs only. When implementing, use `docs/` as the single source of truth for spec, entities, affordability, and UI.

---

## Deployment / Hosting

- **Production URL:** [finance.christianfiebig.de](https://finance.christianfiebig.de)
- Configure DNS (CNAME or A for `finance.christianfiebig.de`) and hosting (e.g. Vercel, Netlify, or your own) to serve the Vite build from this subdomain.
- If using Supabase Auth: add `https://finance.christianfiebig.de` (and `https://finance.christianfiebig.de/**`) to Redirect URLs in Supabase Dashboard → Authentication → URL Configuration.

---

## Scripts (Vite Defaults)

- `npm run dev` — dev server.
- `npm run build` — production build.
- `npm run preview` — preview production build.

---

## Doc Reference

- [SPEC.md](./SPEC.md) — product spec and index.
- [ENTITIES.md](./ENTITIES.md) — data model for Supabase schema.
- [AFFORDABILITY.md](./AFFORDABILITY.md) — canAfford engine (implement in frontend or Edge Function).
- [UI-REQUIREMENTS.md](./UI-REQUIREMENTS.md) — pages and features.
