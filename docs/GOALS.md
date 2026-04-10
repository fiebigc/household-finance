# Goals & Targets

---

## Goal Types

| Type | Description | Example |
|------|-------------|---------|
| `one_off` | Single purchase or expense | Couch, one-off repair |
| `recurring` | Ongoing monthly cost | Car (monthly cost), subscription |
| `bucket` | Sinking fund / savings toward a target | Bathroom renovation, laptops, phones |

---

## Priority

- **1** — Highest (must be safe in worst-case income).
- **2** — Medium.
- **3** — Lowest (e.g. optional purchases).

---

## Source (Funding Pool)

| Source | Meaning |
|-------|--------|
| `cashflow` | Paid from monthly surplus. |
| `buffer` | Can use buffer if safe (e.g. one-off, buffer-funded if runway OK). |
| `savings` | From dedicated savings/bucket, not from buffer floor. |

---

## Major Goals to Support

| Goal | Type | Notes |
|------|------|-------|
| **Car** | Upfront + recurring | Upfront cost + monthly cost; **must fit worst-case income state**. |
| **Bathroom renovation** | Bucket | Long-term; **never directly from buffer**. |
| **Couch** | One-off | **Buffer-funded if safe** (runway stays above threshold). |
| **Laptops / phones** | Bucket (sinking fund) | Monthly contribution. |
| **Window cleaning robot** | One-off or bucket | **Optional, lowest priority** (3). |

---

## Affordability vs Goals

- **Monthly commitments** (recurring, car monthly) must fit **worst-case active income state**.
- **One-offs** must not push buffer below `min_amount`.
- **Bucket goals** (bathroom, etc.) are funded from dedicated savings/cashflow, not from buffer floor.
