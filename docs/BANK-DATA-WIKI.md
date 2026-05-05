# Bank data wiki (household imports)

Private exports from banks and agencies live under **`docs/bank/`**. That folder is **gitignored** (only `.gitignore` is tracked) so IBANs, balances, and benefit details never land in git.

This page describes **every supported source**, how it maps into the app snapshot (`household-finance-data.json`), and the **universal CSV** interchange format.

---

## Snapshot target

CLI importers write a **plaintext** snapshot JSON (`version: 1`, arrays for households, entities, accounts, …).

- Default path: `~/Documents/Finances/household-finance-data.json`  
- Override: `--snapshot /absolute/path.json` or env **`FINANCE_SNAPSHOT_PATH`**

If you use an **encrypted** local vault file, decrypt first (see **`scripts/export-plaintext-snapshot.mjs`**) or run imports against a plaintext copy, then replace/re-encrypt in the app as needed.

The snapshot must already contain at least **one household** and **entities** (adults / children) matching names expected by imports (e.g. parental-leave child names).

---

## Files typically placed in `docs/bank/`

| Pattern | Origin | Encoding | Importer |
|--------|--------|----------|----------|
| `Account*.csv` | Danske Bank account export | Usually **Latin-1** (`ISO-8859-1`) | `npm run import-accounts` → `scripts/import-danske-account-csvs.mjs` |
| `Screenshot-Bolan*.csv` | Danske mortgage “screenshot” / ledger CSV | UTF-8 or Latin-1 | `npm run import-loans` → `scripts/import-danske-loan-csvs.mjs` |
| `parental-leave-days-*.csv` | Försäkringskassan-style day export | UTF-8 comma CSV | `npm run import-parental-leave` → `scripts/import-parental-leave-csv.mjs` |
| `Expenses.csv` | Renovation spreadsheet (Room / Items / Paid) | UTF-8 | In-app **Renovation projects** card + **`npm run import-renovation`** |
| `*.png` | A‑kassa portal screenshot | binary | `npm run import-akassa` → **`scripts/import-akassa-screenshot.mjs`** (OCR, not CSV) |

Duplicate exports: if **`AccountXLSavings-*`** is byte-identical to **`AccountShared-*`**, the account importer skips XL Savings (same underlying account).

Loan CSVs require **`KNOWN_LOANS`** metadata in **`scripts/import-danske-loan-csvs.mjs`** for portal-only fields (interest rate, binding dates). Adjust when mortgage terms change.

---

## Danske account CSV (semicolon)

**Expected columns** (Swedish UI):

- `Bokföringsdag`, `Specifikation`, `Belopp`, `Saldo`, `Status`
- Optional: `Valuta`

Only rows with **`Status`** empty or **`Utförd`** are imported.

**Filename convention** (used to detect account kind and account number):

- `AccountChristian-{digits}-{yyyymmdd}.csv`
- `AccountHousehold-{digits}-{yyyymmdd}.csv`
- `AccountShared-{digits}-{yyyymmdd}.csv`
- `AccountXLSavings-{digits}-{yyyymmdd}.csv`

Digits identify the bank account; importer upserts **`accounts`** + **`transactions`** and tags metadata (`danske_account_number`, `shared`, etc.).

---

## Danske loan / bolån CSV (semicolon)

Same header style as accounts (ledger lines). Filename must contain **`Screenshot-Bolan…-{digits}.csv`** so the loan account number can be parsed.

Produces **`accounts`** (type `loan`) + **`loans`** + **`transactions`** tied to **`KNOWN_LOANS`** defaults.

---

## Parental leave CSV (comma)

Columns (header row, flexible casing):

- **`Child`**, **`Category`**, **`Subcategory`**, **`Owner`**, **`Days`**, **`TotalAllowance`**

Merged into matching **`child`** entity **`metadata.parental_leave_snapshot`**.

Optional: **`--du-adult-match Name`** or **`PARENTAL_LEAVE_DU_MATCH`** so FK “Du” maps to an adult entity.

---

## Renovation `Expenses.csv` (comma)

Flexible headers; parser resolves:

- **Room** column (or first column) — rolling “project” name  
- **Items** — description (dates may be embedded for `date_from`)  
- **Paid** / cost — Swedish amounts (`kr`, `.` thousands, `,` decimals)

Creates **`cashflows`** (one-offs) with **`metadata.renovation_import`** and batch **`docs_bank_expenses_csv`**. Re-import archives prior rows with that batch.

---

## A‑kassa screenshot

Not CSV: **`import-akassa-screenshot.mjs`** OCRs a PNG and writes **`metadata.unemployment_benefits`** on a matched adult.

---

## Universal CSV (single interchange file)

**Goal:** one CSV that can represent rows from **account**, **loan**, **parental**, and **renovation** sources so you can:

1. **Compile** everything under `docs/bank/` → one file  
   **`npm run build-universal-bank-csv`** → **`docs/universal-bank-import.merged.csv`** (gitignored; contains PII if run on real data)

2. **Import** that file into the snapshot  
   **`npm run import-universal-bank-csv -- --snapshot … docs/universal-bank-import.merged.csv`**  
   (internally rebuilds native CSVs in a temp dir and runs the existing importers in order: accounts → loans → parental → renovation)

### Header (exact column order)

```text
bank_family,source_filename,booking_date,description,amount_sek,saldo_sek,booking_status,currency,danske_account_digits,account_role,danske_loan_digits,renovation_room,renovation_items,renovation_cost_raw,parental_child,parental_category,parental_subcategory,parental_owner,parental_days,parental_allowance
```

| Column | Used when `bank_family` is |
|--------|----------------------------|
| `bank_family` | **`danske_account`** \| **`danske_loan`** \| **`parental_leave`** \| **`renovation`** |
| `source_filename` | Traceability (written when compiling from `docs/bank`) |
| `booking_date` | `YYYY-MM-DD` — account & loan ledger rows |
| `description` | Account/loan spec text |
| `amount_sek` | Numeric (use `.` as decimal in universal CSV) |
| `saldo_sek` | Account/loan running balance where applicable |
| `booking_status` | e.g. `Utförd` |
| `currency` | e.g. `SEK` |
| `danske_account_digits` | Account CSV grouping / synthetic filename |
| `account_role` | `christian` \| `household` \| `shared` \| `xlsavings` |
| `danske_loan_digits` | Loan CSV grouping |
| `renovation_room` | Current room/project |
| `renovation_items` | Items / receipt text |
| `renovation_cost_raw` | Swedish-style amount string as in bank CSV (`kr1.234,56`) |
| `parental_*` | One FK-style row per grid line |

**Specimen:** see **`docs/universal-bank-import.specimen.csv`** (safe synthetic examples).

---

## NPM scripts (summary)

| Script | Purpose |
|--------|---------|
| `npm run import-accounts` | Danske account CSVs |
| `npm run import-loans` | Danske loan CSVs |
| `npm run import-parental-leave` | FK parental day CSVs |
| `npm run import-akassa` | A‑kassa PNG OCR |
| `npm run import-renovation` | `docs/bank/Expenses.csv` → snapshot cashflows |
| `npm run build-universal-bank-csv` | Merge `docs/bank/*.csv` → universal CSV |
| `npm run import-universal-bank-csv` | Import one universal CSV |

---

## Related app paths

- Renovation bundled path in UI: **`docs/bank/Expenses.csv`** (Vite `?raw` import) — file must exist locally for dev builds that use it.
- Finance snapshot path helper: **`scripts/finance-snapshot-path.mjs`**
