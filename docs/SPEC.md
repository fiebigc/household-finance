# Household Finance App — Product Specification

## Goal

A **financial control panel** that answers:

> *"What can we afford now, what blocks us, and how long are we safe in each scenario?"*

Focus: **liquidity**, **targets**, and **scenario-based affordability** — not traditional budgeting.

---

## Context

- **Household:** 2 adults, 2 kids (newborn since May 2025).
- **Income uncertainty:**
  - One partner at **75–100% employment** (currently 80%).
  - One partner on **parental leave** (mix of paid/unpaid days), unemployed since May 2025.
  - Possible **self-employment** ("starta eget") if no job after parental leave.
- **Need:** Model **income states**, not a single forecast.
- **Location:** Sweden (model Swedish-specific logic: SGI, A-kassa, foraldrapenning, ranteavdrag, barnbidrag, starta eget bidrag).

---

## Non-Negotiable Rules

1. **Investments are never used for affordability.**  
   Only liquidity accounts count.
2. **Savings buffer** has:
   - `min_amount` — planning threshold (runway is “months until buffer &lt; min”).
   - `absolute_floor` — must never be breached.
3. **Decisions** are governed by **runway** (months until buffer &lt; min).

---

## Core Concepts

| Concept | Description |
|--------|-------------|
| **Liquidity** | `household_cash + housing_account + savings_buffer` — only these for affordability. |
| **Runway** | Months until buffer falls below `min_amount`. |
| **Income state** | A scenario (e.g. current, stretched parental leave, partner 100%, self-employed). |
| **canAfford** | Engine that answers whether an expense/goal fits; returns explanation, not just yes/no. |

---

## What We Build

- **Backend:** Supabase (auth, DB, optional Edge Functions).
- **Frontend:** Vite-based web app (React or similar).
- **Docs:** See `docs/` for entities, accounts, goals, affordability engine, UI, and out-of-scope.

## Authoritative Framework

- The 6-phase architecture is the canonical implementation framework.
- Household cardinality for v1 is fixed to **2 adults + 2 children**.
- Data model direction is **hybrid**:
  - Scenario-first entities for simulation (`scenarios`, `scenario_events`, household profiles, costs, assets, loans).
  - Transaction-led entities for bookkeeping and affordability actuals (`accounts`, `transactions`, `categories`, locks).
- Transition date defaults to **August 15** at household level, with **per-scenario override** support.

---

## Doc Index

| Doc | Purpose |
|-----|--------|
| [ACCOUNTS.md](./ACCOUNTS.md) | Account types, liquidity, buffer rules |
| [ENTITIES.md](./ENTITIES.md) | Data model: Account, Transaction, Category, IncomeState, Goal, Buffer |
| [GOALS.md](./GOALS.md) | Goal types, priority, source, example goals |
| [AFFORDABILITY.md](./AFFORDABILITY.md) | `canAfford` engine, rules, return shape |
| [UI-REQUIREMENTS.md](./UI-REQUIREMENTS.md) | Dashboard, goals, transactions, scenarios |
| [OUT-OF-SCOPE.md](./OUT-OF-SCOPE.md) | v1 exclusions |
| [SETUP.md](./SETUP.md) | Project setup: Vite + Supabase |
