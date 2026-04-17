# TODO (Canonical 6-Phase Framework)

## Phase 1: Project Architecture & Rules

- [x] Add root rules for separation of concerns, Swedish logic isolation, and mobile-first direction.
- [x] Lock central household config as single source for seeded values.
- [x] Set default transition date model (August 15) with scenario-aware behavior.

## Phase 2: Household Data Model & Config

- [x] Create typed `householdConfig` with two adults, two children, three loans, fixed/variable costs, and house value.
- [x] Add realistic placeholder values only (no personal hardcoded data).
- [x] Add LTV helper and env-based default transition date override.

## Phase 3: Supabase Schema (Hybrid)

- [x] Create scenario-first schema: households, profiles, loans, monthly_costs, assets, scenarios, scenario_events.
- [x] Extend to transaction-led entities: accounts, categories, transactions, month_locks, income_states, income_components, goals.
- [x] Add RLS policies for household isolation and shared updated_at triggers.
- [ ] Apply schema/migrations to remote Supabase once DB connectivity is available.
- [ ] Execute cleanup migration to drop old finance-app tables in remote DB.

## Phase 4: Swedish Finance Utility Scaffolding

- [x] Add typed utility placeholders in `src/utils/finance`:
  - `sgiCalculator`
  - `akassaCalculator`
  - `foraldrapenningCalculator`
  - `ranteavdragCalculator`
  - `barnbidragCalculator`
  - `startaEgetCalculator`
  - `scenarioEngine`
- [x] Implement utility logic with deterministic formulas and Vitest coverage (`npm test`).

## Phase 5: Scenario Definitions

- [x] Add five canonical scenarios in `src/config/scenarios.ts`.
- [x] Support `transitionDateOverride` per scenario (default Aug 15 behavior).
- [x] Validate scenario assumptions and run plans against household/benefit logic inputs.

## Phase 6: Review, Approval, and Build

- [x] Present architecture, interfaces, schema, and scenarios for review.
- [x] Align docs to 6-phase canonical framework and hybrid model.
- [x] Implement Swedish finance calculation utilities (approved scope: planning approximations).
- [x] Implement minimal UI components and connect scenario engine outputs.
- [x] Add smoke tests for rendered scenario dashboard.
- [ ] Run manual mobile QA at 360px in browser.
