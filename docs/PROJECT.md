# Household Finance App — Project Plan

> **Status**: Architecture complete. Implementation not started.
> **Schema version**: 1.1.0
> **Last updated**: 2026-04

---

## Project structure

```
household-finance/
├── .cursorrules                    # Cursor AI rules (this project's laws)
├── docs/
│   ├── schema.json                 # Database schema v1.1.0
│   ├── ui-structure.json           # Tab + card definitions
│   └── PROJECT.md                  # This file
├── src/
│   ├── adapter/
│   │   ├── index.ts                # BackendAdapter interface
│   │   ├── supabase.ts             # Supabase implementation
│   │   ├── local.ts                # IndexedDB fallback
│   │   └── mock.ts                 # In-memory adapter for dev/testing
│   ├── engine/
│   │   ├── projection.ts           # Core month-by-month projection engine
│   │   ├── scheduling.ts           # Period + day-override resolution
│   │   ├── amortization.ts         # Loan amortization schedules
│   │   ├── benefits.ts             # Benefit eligibility + amount computation
│   │   └── tax.ts                  # Tax application (flat rate + brackets)
│   ├── hooks/
│   │   ├── useEntities.ts
│   │   ├── useAccounts.ts
│   │   ├── usePeriods.ts
│   │   ├── useCashflows.ts
│   │   ├── useLoans.ts
│   │   ├── useBenefits.ts
│   │   ├── useTransactions.ts
│   │   └── useProjection.ts
│   ├── stores/
│   │   ├── appStore.ts             # Active household, selected tab, UI preferences
│   │   └── scenarioStore.ts        # Active scenario for Planning tab
│   ├── components/
│   │   ├── cards/
│   │   │   ├── overview/
│   │   │   │   ├── NetIncomeCard.tsx
│   │   │   │   ├── RecurringCostsCard.tsx
│   │   │   │   ├── CashflowBarCard.tsx
│   │   │   │   ├── ActiveBenefitsCard.tsx
│   │   │   │   ├── EntityStatusCard.tsx
│   │   │   │   ├── LoanOverviewCard.tsx
│   │   │   │   ├── NetWorthCard.tsx
│   │   │   │   └── SavingsRateCard.tsx
│   │   │   ├── planning/
│   │   │   │   ├── PeriodPlannerCard.tsx
│   │   │   │   ├── IncomeProjectionCard.tsx
│   │   │   │   ├── BenefitTimelineCard.tsx
│   │   │   │   ├── ChildcareForecastCard.tsx
│   │   │   │   ├── ScenarioComparisonCard.tsx
│   │   │   │   ├── RunwayCard.tsx
│   │   │   │   └── TaxModellerCard.tsx
│   │   │   ├── data/
│   │   │   │   ├── EntityManagerCard.tsx
│   │   │   │   ├── AccountManagerCard.tsx
│   │   │   │   ├── CashflowManagerCard.tsx
│   │   │   │   ├── LoanManagerCard.tsx
│   │   │   │   ├── CsvImportBankCard.tsx
│   │   │   │   ├── CsvImportBenefitsCard.tsx
│   │   │   │   ├── TransactionLedgerCard.tsx
│   │   │   │   └── BackendConfigCard.tsx
│   │   │   └── retirement/
│   │   │       ├── PensionProjectionCard.tsx
│   │   │       ├── ContributionInputsCard.tsx
│   │   │       ├── InvestmentGrowthCard.tsx
│   │   │       ├── FireNumberCard.tsx
│   │   │       ├── NetWorthTrajectoryCard.tsx
│   │   │       └── LeavePensionImpactCard.tsx
│   │   ├── planner/
│   │   │   ├── MonthGrid.tsx       # Core period planner grid
│   │   │   ├── PeriodCell.tsx      # Single month cell
│   │   │   ├── DayOverridePopover.tsx
│   │   │   └── PeriodTypePicker.tsx
│   │   └── shared/
│   │       ├── Card.tsx
│   │       ├── MetricDisplay.tsx
│   │       ├── CurrencyValue.tsx
│   │       ├── EntityBadge.tsx
│   │       ├── ArchiveButton.tsx
│   │       └── EmptyState.tsx
│   ├── pages/
│   │   ├── OverviewPage.tsx
│   │   ├── PlanningPage.tsx
│   │   ├── DataSettingsPage.tsx
│   │   └── RetirementPage.tsx
│   ├── types/
│   │   ├── schema.ts               # All DB row types (generated from schema.json)
│   │   ├── engine.ts               # Projection result types
│   │   └── adapter.ts              # BackendAdapter interface types
│   └── utils/
│       ├── currency.ts             # Intl.NumberFormat wrappers
│       ├── dates.ts                # date-fns helpers
│       ├── csv.ts                  # Papa Parse wrappers + column mappers
│       └── activeOnly.ts           # archived_at IS NULL filter helper
├── supabase/
│   ├── migrations/
│   │   └── 001_initial_schema.sql  # Generated from schema.json
│   └── seed.sql                    # Empty — no hardcoded seed data
└── tests/
    ├── engine/
    │   ├── projection.test.ts
    │   ├── scheduling.test.ts
    │   └── amortization.test.ts
    └── adapter/
        └── mock.test.ts
```

---

## Phases

### Phase 0 — Foundation
**Goal**: Runnable app with backend connected, no content yet.

- [ ] Scaffold Vite + React + TypeScript + Tailwind
- [ ] Set up Supabase project (or local Supabase via Docker)
- [ ] Generate initial SQL migration from `schema.json`
- [ ] Implement `BackendAdapter` interface and Supabase adapter
- [ ] Implement `activeOnly()` helper and enforce in all queries
- [ ] Implement IndexedDB local adapter as offline fallback
- [ ] Set up tab routing (Overview / Planning / Data & settings / Retirement)
- [ ] `BackendConfigCard` — connect Supabase URL + anon key, test connection
- [ ] Basic `Card` shell component (title, loading state, error state)

**Done when**: App loads, connects to Supabase, shows four empty tabs.

---

### Phase 1 — Entity & account management
**Goal**: Full CRUD for the household's people, companies, and accounts.

- [ ] `EntityManagerCard` — add/edit/archive adult, child, company
- [ ] `AccountManagerCard` — add/edit/archive accounts per entity, link CSV parser config
- [ ] `CashflowManagerCard` — add/edit/archive recurring income and expenses
- [ ] `LoanManagerCard` — add fixed and floating loans with amortization preview
- [ ] Soft-delete UI: archive button + archived toggle to restore
- [ ] Entity type validation: enforce correct period types per entity type
- [ ] `EntityBadge` shared component for consistent entity labelling across cards

**Done when**: Household structure can be fully entered and edited without touching the DB directly.

---

### Phase 2 — Period planner
**Goal**: Schedule who is doing what, when, at what FTE.

- [ ] `MonthGrid` — one row per entity, one cell per month, scrollable horizontally
- [ ] `PeriodCell` — click to assign period type, show current type as colour block
- [ ] `PeriodTypePicker` — context-aware (adult vs child vs company types only)
- [ ] Drag to extend period across months
- [ ] Weekly pattern editor — set which days are active within a period
- [ ] `DayOverridePopover` — mark individual days as active/inactive with reason
- [ ] Scheduling resolution logic in `engine/scheduling.ts`
- [ ] Period overlap validation — warn if two periods overlap for same entity
- [ ] `EntityStatusCard` on Overview tab — derives from active periods

**Done when**: Full household schedule for the next 12 months can be planned and edited.

---

### Phase 3 — Projection engine
**Goal**: Month-by-month income, cost, and surplus projections driven entirely by data.

- [ ] `engine/projection.ts` — pure function, no side effects
- [ ] Apply periods to cashflows (prorate by FTE and working days)
- [ ] Apply `weekly_pattern` + `period_day_overrides` to compute active days per month
- [ ] Apply tax profiles (flat rate and bracket methods)
- [ ] Include benefits in income projection
- [ ] Include loan repayments in cost projection
- [ ] `engine/amortization.ts` — annuity, straight-line, interest-only schedules
- [ ] `IncomeProjectionCard` — 12-month stacked area chart
- [ ] `RunwayCard` — cumulative surplus/deficit curve
- [ ] `ChildcareForecastCard` — derives from child periods and birth dates

**Done when**: Projections update live when periods or cashflows change.

---

### Phase 4 — CSV import pipeline
**Goal**: Import bank statements and benefit CSVs from real Swedish banks and Försäkringskassan.

- [ ] `CsvImportBankCard` — 5-step wizard: upload → account → map columns → preview → confirm
- [ ] `CsvImportBenefitsCard` — same wizard, benefit-specific field mapping
- [ ] `csv_parser_configs` CRUD — save and reuse column mappings per bank
- [ ] Papa Parse integration with delimiter and encoding detection
- [ ] Column mapping UI — drag or select which CSV column maps to which field
- [ ] Preview table — show first 10 rows before confirming
- [ ] Import status tracking via `csv_imports` table
- [ ] Duplicate detection — skip rows already imported (match on date + amount + description)
- [ ] `TransactionLedgerCard` — full transaction list with filter, search, category edit
- [ ] Auto-categorisation — simple rule-based matching on description keywords (configurable)
- [ ] Manual category override and cashflow linking

**Done when**: Bank CSV from SEB and benefit CSV from Försäkringskassan import cleanly.

---

### Phase 5 — Planning scenarios
**Goal**: Named what-if scenarios with side-by-side comparison.

- [ ] `projection_scenarios` CRUD in Data & settings
- [ ] Scenario selector in Planning tab header
- [ ] `ScenarioComparisonCard` — two scenarios side by side, delta metrics
- [ ] `BenefitTimelineCard` — Gantt view of benefit eligibility across scenarios
- [ ] `TaxModellerCard` — per-entity tax rate override within a scenario
- [ ] Scenario period overrides respect the same scheduling resolution as base periods

**Done when**: "Christian back to work in September" vs "stays on leave until January" can be compared.

---

### Phase 6 — Overview tab completion
**Goal**: All 8 Overview cards populated and reactive.

- [ ] `NetIncomeCard` — sum of net cashflows this month, by entity
- [ ] `RecurringCostsCard` — total expenses by category
- [ ] `CashflowBarCard` — income/costs/surplus bar for last 4 months
- [ ] `ActiveBenefitsCard` — current benefits with expiry countdown
- [ ] `LoanOverviewCard` — total debt, monthly repayment, payoff timeline
- [ ] `NetWorthCard` — assets minus liabilities, delta vs last month
- [ ] `SavingsRateCard` — rolling savings rate % with target line

**Done when**: Overview tab gives a complete snapshot without any manual input.

---

### Phase 7 — Retirement tab
**Goal**: Long-range financial modelling.

- [ ] `ContributionInputsCard` — pension contributions per entity with employer match
- [ ] `PensionProjectionCard` — projected pension at retirement age, 3 scenarios
- [ ] `InvestmentGrowthCard` — compound growth of investment accounts, adjustable rate
- [ ] `FireNumberCard` — FIRE target, gap, years-to-FIRE
- [ ] `NetWorthTrajectoryCard` — 30-year net worth projection with confidence band
- [ ] `LeavePensionImpactCard` — pension gap from leave periods + voluntary top-up calculator

**Done when**: Retirement tab gives a credible long-range picture based on actual household data.

---

### Phase 8 — Polish and hardening
**Goal**: Production-ready for daily household use.

- [ ] Responsive layout — usable on tablet and mobile
- [ ] Empty states for all cards with actionable prompts
- [ ] Full offline mode via IndexedDB adapter
- [ ] JSON export of entire household dataset
- [ ] JSON import / restore
- [ ] Error boundaries on all cards (card failure must not crash the tab)
- [ ] Loading skeletons for all cards
- [ ] Accessibility audit (keyboard nav, ARIA labels, colour contrast)
- [ ] Unit tests for projection engine, scheduling resolution, and amortization
- [ ] E2E test for CSV import wizard (happy path + malformed file)

---

## Open questions — must be clarified before building

### Tax & benefits (Sweden-specific)
- [ ] **Swedish income tax**: Municipal tax (~32%) + state tax (20% above ~613k SEK/year). Should the app compute these from brackets, or require the user to enter their effective rate manually? Bracket rules change annually — how should updates be handled?
- [ ] **Parental leave (föräldrapenning)**: Calculated as ~77.6% of SGI (sjukpenninggrundande inkomst), not of salary. Does the app need to track SGI separately per adult, or is a manual input sufficient?
- [ ] **Child benefit (barnbidrag)**: Auto-computable from child birth dates (SEK 1,250/child/month). Should this be computed automatically and shown as a suggested benefit, or only when the user confirms it?
- [ ] **Unemployment benefit (a-kassa)**: Depends on union membership and prior income. Does the app need to model this, or just accept an imported CSV amount?
- [ ] **VAT / F-skatt for self-employment**: If Christian is self-employed via a company entity, does the app need to model VAT flows and corporate tax, or only personal income from the company?

### Childcare (Sweden-specific)
- [ ] **Maxtaxa**: Swedish childcare fees are capped (maxtaxa). Does the app compute the fee from the child's care hours and household income, or does the user enter the monthly fee manually?
- [ ] **Kindergarten start date**: The 11-month-old starts daycare Aug 15. This is a known fact — should it be pre-entered as a suggested period override on first setup, or treated like any other period?

### Planning model
- [ ] **Parental leave days as a quota**: Swedish parental leave has a capped number of days (390 days per child, shared between parents). Should the planner track remaining quota days, or just treat it as an open-ended period type?
- [ ] **Concurrent periods**: Can an adult be on 80% parental leave AND 20% self-employed simultaneously? If yes, the period model needs to support overlapping periods with different FTE — currently it only validates no overlap.
- [ ] **Public holidays**: Should Swedish public holidays be pre-loaded as day overrides, or ignored (leave it to the user)?

### Data model
- [ ] **Multi-currency**: The schema supports per-account currency. Does the app need FX conversion for the overview metrics, or is everything assumed to be SEK?
- [ ] **Historical net worth**: `balance_snapshot` is a point-in-time value per account. To build a net worth history chart, should the app store a `balance_history` table (one row per import date), or derive it from imported transactions?
- [ ] **Shared accounts**: Can one account be linked to multiple entities (e.g. a joint bank account for both adults)? Currently the schema has `account.entity_id` as a single FK — this would need to become a many-to-many.

### CSV import
- [ ] **Which Swedish banks need to be supported on day one?** SEB? Swedbank? Handelsbanken? Each has a different CSV format.
- [ ] **Försäkringskassan CSV format**: What columns does the actual FK export provide? Has this been checked?
- [ ] **Duplicate detection strategy**: Match on `(account_id, date, amount, description)` — is this reliable enough, or do Swedish bank exports include transaction IDs?

### Auth & multi-device
- [ ] **Authentication**: Is this single-user (just you), or should multiple household members be able to log in and see the same data? If multi-user, Supabase Auth + RLS policies are needed from day one.
- [ ] **Household isolation**: If ever shared, each household must be fully isolated. RLS policy: `household_id = auth.uid()` or a separate `user_households` join table?

### UI
- [ ] **Tab naming**: "Data & settings" conflates entity management (frequent) with backend config (once). Consider splitting into "Household" (entities/accounts/cashflows/loans) and "Settings" (imports/backend/config).
- [ ] **Mobile**: Is mobile a real use case (checking balances on the go) or is this desktop-only?
- [ ] **Language**: Swedish or English UI? Or a toggle?

---

## Known constraints

- All monetary amounts in the projection engine are **gross before tax unless `is_gross = false`** on the cashflow. The engine applies tax — the UI never does.
- The projection engine is **called once per tab render** with all data passed in — not per card. Cards receive slices of the projection result.
- `period_day_overrides` are **only meaningful when the parent period has a `weekly_pattern`**. If `weekly_pattern` is null, overrides are ignored by the engine.
- Archived entities **still appear in historical charts** (their past transactions and cashflows remain). They are **excluded from forward projections**.
- `balance_snapshot` on accounts is **not authoritative** — it is the latest known balance from a CSV import. The source of truth for actual balance history is the `transactions` table.
