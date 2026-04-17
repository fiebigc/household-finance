# Things To Clarify

## Ownership & Access

- [ ] Single login vs multiple family users?
- [ ] Should second adult have separate login and permissions from day 1?
- [x] Should business data be separated by entity or mixed in one view?  
      Decision: mixed household view with scenario modeling support.

## Data Scope

- [ ] Do you want historical import (CSV/manual) at launch?
- [ ] Should investments be tracked as income, or only cash-out events (dividends/sales)?
- [ ] Should tax returns be one-off income events or annual recurring template?
- [x] Household cardinality in v1?  
      Decision: 2 adults + 2 children.

## Income Factors

- [ ] Work time modeled monthly (50/75/80/100) or event-driven daily effective dates?
- [ ] Parental leave modeled as paid days/month only, or include unpaid-day sequencing?
- [ ] Subsidies modeled as scenario toggles or fixed components?
- [x] Swedish logic in v1 or staged later?  
      Decision: include Swedish logic in v1 (future-proof path).
- [x] Transition date model?  
      Decision: household default August 15 with per-scenario override support.

## Costs

- [ ] Which costs are always recurring vs variable?
- [ ] Should renovation be treated as one-off, bucket, or both?
- [ ] Do we need shared cost split between household and business?

## Mobile UX

- [ ] Most-used action on phone: add transaction, check runway, or simulate expense?
- [ ] Should quick-add transaction be available from dashboard?

## Integrations

- [ ] Any bank sync planned for v2 (if yes, which providers)?
- [ ] Should hub app receive full docs mirror or a subset only?

## Architecture Decisions (Locked)

- [x] Source of truth for implementation approach?  
      Decision: 6-phase architecture is canonical.
- [x] Database direction?  
      Decision: hybrid model (scenario-first + transaction-led).
- [x] Security handling for now?  
      Decision: keep current `.env` credentials workflow temporarily.
