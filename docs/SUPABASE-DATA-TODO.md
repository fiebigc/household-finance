# Moving hardcoded household and finance data to Supabase

This checklist tracks **sample / default data still in the repo** that should eventually come from the database (or env-driven config) so the app stays deployable without personal identifiers or amounts in source control.

## Already on Supabase (good)

- Household JSON draft (`app_household_config`), entities (`app_entities`), recurring rows (`app_recurring_costs`), planning calendar (`app_household_planning`).
- User-built scenarios (`app_scenarios`) — name, date window, description, `events`, and builder `tiles`.

## TODO: default seeds and samples

1. **`src/data/bankData.ts` — `defaultEntities`, `defaultBankAccounts`, `defaultRecurringCosts`**
   - Contains fictional names (e.g. first names on adults/children) and numeric balances from bundled CSV samples.
   - **Move:** treat as empty arrays when `loadAppPersistedState` returns data; keep bundled CSV only for CI fixtures under `src/data/sample-bank-csv/` without copying real people’s names into defaults. Optionally seed a generic “Adult A / Child A” template via migration SQL, not TypeScript literals.

2. **`src/config/householdConfig.ts` — `defaultHouseholdConfig`**
   - Default adult/child **labels**, incomes, SGI, loans, fixed costs, and house figures are literals for local demo.
   - **Move:** after first login, insert a minimal template row in `app_household_config` (or read from env `VITE_*` placeholders) and never ship real surnames or amounts in `defaultHouseholdConfig`; keep defaults structurally valid but zeroed or clearly labeled “Example”.

3. **`src/config/householdConfig.ts` — `normalizeHouseholdFromRemote`**
   - Any fallback strings for missing child labels should stay generic (“Child 1”), not personal names.

4. **Bundled CSVs under `src/data/sample-bank-csv/`**
   - Fictional but realistic; ensure they are not copies of real exports. **Move:** optional `docs/bank/` gitignored path for real data; app loads from Supabase only in production-like flows.

5. **`DEFAULT_HOUSEHOLD_ID` in `src/lib/appDataService.ts`**
   - Hardcoded `demo-household-se-001` matches RLS demo policies.
   - **Move:** map authenticated user → `household_id` from a profile table (or JWT claim) and tighten RLS to `household_id = auth.uid()`-backed lookup instead of a constant.

6. **Scenario engine events**
   - Events are user-authored in DB JSON; avoid reintroducing preset arrays in `src/config/scenarios.ts`. If you add templates, store them as optional rows in `app_scenarios` or a separate `app_scenario_templates` table.

7. **Display names**
   - `src/config/authDisplayNames.ts` correctly prefers `user_metadata`; no change required beyond encouraging users to set metadata in Supabase Auth.

## Suggested order of work

1. Zero or generic defaults in `bankData` + `householdConfig` for open-source builds.
2. Multi-tenant `household_id` + RLS (replace demo constant).
3. Optional SQL seed for a single anonymous demo household for marketing deploys.
