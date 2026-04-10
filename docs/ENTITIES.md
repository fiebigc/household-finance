# Data Model (Entities)

Core entities for the household finance app.

---

## 1. Account

- **Type** (enum): `personal_cash` | `household_cash` | `housing_account` | `savings_buffer` | `investment_long_term` | `investment_kids`
- **Name**, **balance** (or derived from transactions)
- For `savings_buffer`: `min_amount`, `absolute_floor`

---

## 2. Transaction

- **Actuals only** (no forecasts in transaction table for v1).
- **Month-locked**: once a month is closed, transactions for that month are locked.
- Fields: amount, date, account (or account_id), category_id, memo, month (or derived), locked (boolean or closed-month rule).

---

## 3. Category

- **Max 10–12** categories.
- Used to tag transactions (and optionally goals).
- Examples: Groceries, Housing, Transport, Childcare, etc.

---

## 4. IncomeState

Represents a **scenario** for income (not a single forecast).

- **Name** (e.g. "Current", "Stretched parental leave", "Partner 100%", "Self-employed (risk)").
- **Active** (or default) flag for “current” scenario.
- Links to **IncomeComponent** rows that define the monthly picture for this state.

---

## 5. IncomeComponent

- **Type**: `salary` | `parental_leave` | `child_benefit` | `self_employed_estimate` (and any others needed).
- **Certainty**: `guaranteed` | `entitlement` | `estimated`.
- **Amount** (monthly or configurable).
- **Income_state_id** (or similar) to attach to an IncomeState.

---

## 6. Goal

- **Type**: `one_off` | `recurring` | `bucket`.
- **Priority**: 1–3 (1 = highest).
- **Source**: `cashflow` | `buffer` | `savings` (which pool pays for it).
- **Target amount**, **deadline** (optional), **monthly contribution** (optional).
- Used by affordability engine: one-offs vs recurring vs bucket behaviour.

---

## 7. Buffer

- Represents the **savings buffer** account + its rules.
- **min_amount** — planning threshold (runway = months until buffer &lt; min).
- **absolute_floor** — must never be breached.
- Current balance can be derived from the `savings_buffer` account or stored here for quick access.

---

## Relationships (Summary)

- **Account** → many **Transaction** (by account).
- **Transaction** → one **Category**.
- **IncomeState** → many **IncomeComponent**.
- **Goal** → source (cashflow / buffer / savings); no direct FK to Account required for v1, but source implies which pool.
- **Buffer** → effectively the `savings_buffer` account + min_amount, absolute_floor.
