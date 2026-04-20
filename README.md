# Household Finance App

A **financial control panel** for a household with income uncertainty. Focus: **liquidity**, **targets**, and **scenario-based affordability** — not traditional budgeting.

**Core question:** *"What can we afford now, what blocks us, and how long are we safe in each scenario?"*

---

## Stack (Planned)

- **Frontend:** [Vite](https://vitejs.dev/) (React + TypeScript).
- **Backend / DB / Auth:** [Supabase](https://supabase.com/).
- **Deployment:** [finance.christianfiebig.de](https://finance.christianfiebig.de) (subdomain).

The Vite app lives in `src/`; product docs remain in `docs/`.

---

## Docs

| Doc | Purpose |
|-----|--------|
| [docs/SPEC.md](docs/SPEC.md) | Full product spec, context, non-negotiables, doc index |
| [docs/ACCOUNTS.md](docs/ACCOUNTS.md) | Account types, liquidity formula, buffer rules |
| [docs/ENTITIES.md](docs/ENTITIES.md) | Data model: Account, Transaction, Category, IncomeState, Goal, Buffer |
| [docs/GOALS.md](docs/GOALS.md) | Goal types, priority, source, example goals |
| [docs/AFFORDABILITY.md](docs/AFFORDABILITY.md) | canAfford engine, rules, return shape |
| [docs/UI-REQUIREMENTS.md](docs/UI-REQUIREMENTS.md) | Dashboard, goals, transactions, scenario controls |
| [docs/OUT-OF-SCOPE.md](docs/OUT-OF-SCOPE.md) | v1 exclusions (bank sync, investment perf, tax, long forecasts) |
| [docs/SETUP.md](docs/SETUP.md) | Project setup: Vite + Supabase |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture and module boundaries |
| [docs/TODO.md](docs/TODO.md) | Implementation roadmap by phase |
| [docs/THINGS-TO-CLARIFY.md](docs/THINGS-TO-CLARIFY.md) | Open product and modeling questions |
| [docs/MOBILE.md](docs/MOBILE.md) | Mobile-first requirements and acceptance checks |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Git + Cloudflare + Supabase deployment setup |
| [docs/ASSETS-CHECKLIST.md](docs/ASSETS-CHECKLIST.md) | Required assets for a rigid framework |
| [docs/BANK-DATA-WIKI.md](docs/BANK-DATA-WIKI.md) | Real bank CSV imports: account mapping, sample personas, gaps |

---

## Rules (Summary)

- **Liquidity** = household_cash + housing_account + savings_buffer. Investments are never used for affordability.
- **Buffer** has `min_amount` (planning threshold) and `absolute_floor` (never breach). Runway = months until buffer &lt; min.
- **canAfford(expense | goal, incomeState)** returns an explanation (buffer after, runway, what breaks), not just yes/no.

Start with [docs/SPEC.md](docs/SPEC.md) for full context.
