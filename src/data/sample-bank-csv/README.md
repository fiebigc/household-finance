# Sample bank CSVs (build / CI)

These **fictional** Swedish-format exports are **committed** so `npm run build` works on Cloudflare Pages and in CI without private files.

- **Local real exports**: keep under `docs/bank/` (gitignored). For local-only overrides you can temporarily point `bankData.ts` imports at copies there, or replace these samples after backup — do not commit personal exports.

- **Supabase**: persists entities, bank accounts, recurring rows, and household config — **not** raw transaction time series. The chart’s monthly series is still derived from these bundled CSVs (or future API).
