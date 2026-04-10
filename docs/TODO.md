# TODO

## Phase 0: Foundation

- [ ] Confirm domain scope: household + potential business accounts
- [ ] Confirm legal/tax scope remains net-income only for v1
- [ ] Finalize category list and naming conventions
- [ ] Define base income states to support day 1

## Phase 1: Data Model + Supabase

- [ ] Translate `ENTITIES.md` into SQL schema
- [ ] Add RLS policies for user/household isolation
- [ ] Seed essential categories (income + cost)
- [ ] Add month-close lock model for transactions

## Phase 2: Frontend (Vite)

- [ ] Scaffold app shell and navigation
- [ ] Build transactions monthly view + close-month action
- [ ] Build goals and target progress view
- [ ] Build scenarios panel and controls

## Phase 3: Affordability Engine

- [ ] Implement `canAfford(expense|goal, incomeState)`
- [ ] Add worst-case scenario check for recurring costs
- [ ] Add one-off buffer threshold checks
- [ ] Return explanation fields (runway, buffer_after, blocking assumption)

## Phase 4: Mobile Quality

- [ ] Validate all key screens at 360px width
- [ ] Ensure touch-friendly controls and readable tables/cards
- [ ] Add mobile nav and sticky key metrics row

## Phase 5: Deploy + Ops

- [ ] Deploy frontend to Cloudflare Pages (`finance.christianfiebig.de`)
- [ ] Connect env vars and Supabase keys
- [ ] Add smoke tests for dashboard and scenario simulation
