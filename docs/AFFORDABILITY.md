# Affordability Engine

Core feature: **can we afford this?** with an **explanation**, not just yes/no.

---

## Function

```
canAfford(expense | goal, incomeState) → result
```

- **Input:** An expense (one-off or recurring) or a goal, plus the income state to test against.
- **Output:** Structured result with explanation.

---

## Rules

1. **Monthly commitments** (recurring costs, car monthly, etc.) must fit **worst-case active income state**.
2. **One-offs** must not push buffer below `min_amount`.
3. **Buffer** must never go below `absolute_floor`.
4. **Investments** are never used for affordability — only liquidity (household_cash + housing_account + savings_buffer).

---

## Return Shape (Explanation)

The engine returns an **explanation**, not just a boolean. Suggested fields:

| Field | Description |
|-------|-------------|
| `affordable` | boolean |
| `buffer_after` | Buffer balance after the expense (if applicable). |
| `months_runway` | Months until buffer &lt; min_amount under this scenario. |
| `assumption_that_breaks` | If not affordable: which rule or assumption breaks (e.g. "buffer would fall below min_amount", "monthly surplus in worst-case income is negative"). |

Additional optional: `liquidity_after`, `message` (human-readable summary).

---

## Usage

- **Dashboard:** "Simulate expense" — user enters amount (and optionally one-off vs recurring), sees canAfford result.
- **Goals:** When adding or editing a goal, run canAfford for the selected income state.
- **Scenarios:** Change scenario (partner %, parental leave days, self-employment) and re-run affordability for key goals.
