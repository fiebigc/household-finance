# Accounts

Accounts are classified **by function**, not ownership.

---

## Account Types

| Type | Description | Used in liquidity? |
|------|-------------|--------------------|
| `personal_cash` | 2 individual accounts | No |
| `household_cash` | Groceries, daily spend | **Yes** |
| `housing_account` | Mortgage, utilities, big bills | **Yes** |
| `savings_buffer` | Common savings / emergency fund | **Yes** |
| `investment_long_term` | Joint retirement | **No** (read-only) |
| `investment_kids` | Kids | **No** (read-only) |

---

## Liquidity (Affordability Only)

**Only** these account types are used for affordability:

```
liquidity = household_cash + housing_account + savings_buffer
```

- **Investments are never used for affordability.**

---

## Savings Buffer Rules

The **savings buffer** has two thresholds:

| Field | Meaning |
|-------|--------|
| `min_amount` | Planning threshold. Runway = “months until buffer &lt; min_amount”. |
| `absolute_floor` | Must **never** be breached. Hard safety line. |

Decisions are governed by **runway** (months until buffer &lt; min).
