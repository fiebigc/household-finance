# UI Requirements (Minimal v1)

---

## 1. Dashboard

- **Current income state** (name + summary).
- **Monthly surplus/deficit** (for current or selected scenario).
- **Buffer runway** (months until buffer &lt; min_amount).
- **"Simulate expense"** — input amount (and type: one-off / recurring), see canAfford result (affordable?, buffer after, runway, what breaks if not).

---

## 2. Goals & Targets

- List goals with **progress** (e.g. saved vs target for buckets).
- **Priority ordering** (1–3).
- Add / edit goals (type, priority, source, target, deadline or monthly contribution).

---

## 3. Transactions

- **Monthly view** (choose month).
- List transactions; link to account and category.
- **Close month** → lock that month’s transactions (no more edits).

---

## 4. Scenario Controls

- **Partner work %**: 75 | 80 | 100 (or slider).
- **Paid parental leave days** (e.g. per month or remaining).
- **Toggle self-employment** — e.g. "Consider self-employment (starta eget)" — **locked unless buffer sufficient** (or runway above threshold).

Scenarios drive which **IncomeState** is used for surplus and canAfford calculations.

---

## Navigation

- Dashboard (home)
- Goals & targets
- Transactions
- Scenarios (or scenario controls embedded in Dashboard + a dedicated page)

Keep UI minimal; no bank sync, no investment performance, no long forecasts in v1.
