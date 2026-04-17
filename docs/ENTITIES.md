# Data Model (Entities)

Core entities for the household finance app, using a hybrid model
(transaction-led + scenario-first).

---

## 1. Household

- Root household scope for all finance records.
- Household cardinality in v1: **2 adults + 2 children**.
- Holds default scenario transition date (default: August 15).

---

## 2. Profile (Adult / Child)

- Adult profile fields include income, SGI, A-kassa membership, employment mode, working percentage.
- Child profile fields include birthdate, barnbidrag, and investment allocation split.
- Profiles belong to one household.

---

## 3. Loan

- Principal, interest rate, loan type (fixed/floating), fixed-rate expiry date.
- Belongs to one household.

---

## 4. MonthlyCost

- Fixed and variable costs (e.g. BRF avgift, heating, electricity, adult envelopes).
- Belongs to one household and may optionally reference a profile.

---

## 5. Asset

- House value and investment/cash asset records.
- Supports LTV and scenario comparison.

---

## 6. Scenario

- Named scenario snapshot with assumptions and result summary.
- May override household default transition date.
- Belongs to one household.

---

## 7. ScenarioEvent

- Time-phased event records (effective date + payload), e.g.:
  - employment mode change
  - benefit start/stop
  - loan change
  - cashflow adjustment
- Belongs to one scenario and household.

---

## 8. Account

- **Type** (enum): `personal_cash` | `household_cash` | `housing_account` | `savings_buffer` | `investment_long_term` | `investment_kids`
- **Name**, **balance** (or derived from transactions)
- For `savings_buffer`: `min_amount`, `absolute_floor`

---

## 9. Transaction

- **Actuals only** (no forecasts in transaction table for v1).
- **Month-locked**: once a month is closed, transactions for that month are locked.
- Fields: amount, date, account (or account_id), category_id, memo, month (or derived), locked (boolean or closed-month rule).

---

## 10. Category

- **Max 10–12** categories.
- Used to tag transactions (and optionally goals).
- Examples: Groceries, Housing, Transport, Childcare, etc.

---

## 11. IncomeState

Represents a **scenario** for income (not a single forecast).

- **Name** (e.g. "Current", "Stretched parental leave", "Partner 100%", "Self-employed (risk)").
- **Active** (or default) flag for “current” scenario.
- Links to **IncomeComponent** rows that define the monthly picture for this state.

---

## 12. IncomeComponent

- **Type**: `salary` | `parental_leave` | `child_benefit` | `self_employed_estimate` (and any others needed).
- **Certainty**: `guaranteed` | `entitlement` | `estimated`.
- **Amount** (monthly or configurable).
- **Income_state_id** (or similar) to attach to an IncomeState.

---

## 13. Goal

- **Type**: `one_off` | `recurring` | `bucket`.
- **Priority**: 1–3 (1 = highest).
- **Source**: `cashflow` | `buffer` | `savings` (which pool pays for it).
- **Target amount**, **deadline** (optional), **monthly contribution** (optional).
- Used by affordability engine: one-offs vs recurring vs bucket behaviour.

---

## 14. Buffer

- Represents the **savings buffer** account + its rules.
- **min_amount** — planning threshold (runway = months until buffer &lt; min).
- **absolute_floor** — must never be breached.
- Current balance can be derived from the `savings_buffer` account or stored here for quick access.

---

## Relationships (Summary)

- **Household** → many **profiles**, **loans**, **monthly_costs**, **assets**, **scenarios**.
- **Scenario** → many **scenario_events**.
- **Account** → many **Transaction** (by account).
- **Transaction** → one **Category**.
- **IncomeState** → many **IncomeComponent**.
- **Goal** → source (cashflow / buffer / savings); no direct FK to Account required for v1, but source implies which pool.
- **Buffer** → effectively the `savings_buffer` account + min_amount, absolute_floor.
