# Bank data wiki (household imports)

How CSV exports in [`docs/bank/`](../docs/bank/) map to accounts in the app (`src/data/bankData.ts` bundled samples).

**As-of date:** 2026-04-08.

## Personas (private exports)

| Persona | Accounts |
|---------|----------|
| **Joint / household** | Household everyday, Shared/joint, mortgage buffer, all three loans. |
| **Adult 1 (personal)** | Primary checking, credit card, fund savings in sample CSVs. |
| **Adult 2** | Often joint-only in samples; no separate export. |
| **Child 1** | External investment products may not appear in bank CSVs. |
| **Child 2** | May appear only in transaction memos. |

## Cash accounts

| File | Account | Balance (SEK) |
|------|---------|---------------|
| `AccountChristian-24890618775-…` (sample: `AccountSampleAdult1.csv`) | Adult 1 personal | **13 312** |
| `AccountHousehold-12110506350-…` | Household everyday | **11 045** |
| `AccountShared-24890598057-…` | Shared joint | **62 526** |
| `AccountXLSavings-12110506342-…` | *Duplicate of Shared* | — |
| `MastercardGuld-24890598081-…` (sample: `CreditCardSample.csv`) | Adult 1 credit | **−3 493** |

## Mortgage accounts

There are **three loans** visible in Shared account as monthly `Lån:` debits:

| Loan | Monthly payment (Shared) | Outstanding balance | Source |
|------|--------------------------|---------------------|--------|
| 2450-03-43784 (Prem Hypotek) | ~547 SEK | **−750 000** | `Bol}nPremHypotek-24500343784-…` — interest-only, saldo stays at −750k. |
| 2450-03-43776 (Fast Hypotek) | ~1 819 SEK | **unknown** | CSV is only the **savings buffer** (saldo +5 363). Loan principal not exported. Enter from bank portal. |
| 1346-08-79831 | ~2 940 SEK | **unknown** | CSV file is a **duplicate of Mastercard** (wrong export). Re-export or enter from portal. |

The mortgage **buffer** account (`Bol}nFastHypotek-24500343776`) receives 1 000 SEK/mo (Monthly Savings CF + HV). It also paid renovation invoices (Hässelby Rör, Lekander golv). It is **not** the loan ledger.

**Sum of monthly payments ≈ 5 306 SEK/month** (`approximateMonthlyMortgagePaymentsSek()`).

## Investments

| Item | Evidence | Owner |
|------|----------|-------|
| Fund savings (e.g. monthly transfer) | Recurring debit on adult 1 account | Adult 1 |
| External pension / fund | Not in exports | Child 1 |
| Index products | Not in exports | Child 1 |

## App integration

- **Starting liquidity** in the app sums non-loan cash accounts with positive balances (see bundled `defaultBankAccounts` in `bankData.ts`).
- **Chart** shows per-account + combined EOM liquidity for cash accounts only.
- **Loan balances** appear in the Accounts card; payments are extracted as recurring expenses on the board.

## Privacy

CSVs contain personal text. Do not commit real exports to public repos.
