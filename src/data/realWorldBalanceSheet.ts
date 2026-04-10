/**
 * Bank account data. When DB rows are available, builds from Supabase.
 * Investment placeholders and mortgage payment estimates remain static.
 */

export type PersonaKey = "christian" | "heli" | "aaro" | "unto" | "joint";

export type AccountCategory =
  | "checking" | "household_cash" | "joint_cash" | "mortgage_savings"
  | "mortgage_debt" | "credit_card" | "investment_transfer" | "investment_external";

export type BankAccountRow = {
  id: string;
  sourceFile: string;
  label: string;
  balanceSek: number | null;
  owners: PersonaKey[];
  category: AccountCategory;
  notes?: string;
};

export type DbBankAccount = {
  id: string;
  /** Owner for RLS; set by seed script. */
  user_id?: string | null;
  source_file: string | null;
  label: string;
  balance_sek: number | null;
  owners: string[];
  category: string;
  notes: string | null;
};

export const BALANCE_SHEET_AS_OF = "2026-04-08";

const OWNER_MAP: Record<string, PersonaKey> = {
  christian: "christian", heli: "heli", aaro: "aaro", unto: "unto", joint: "joint",
};

/**
 * When `balance_sek` is missing in DB (seed/import gap), show documented principal as of
 * BALANCE_SHEET_AS_OF. See docs/BANK-DATA-WIKI.md.
 */
const ACCOUNT_BALANCE_FALLBACK_SEK: Record<string, number> = {
  "bolan-prem-24500343784": -750_000,
};

/** Full row if the account was never inserted (e.g. partial seed) — keeps loan visible in balances. */
const DEFAULT_DB_ROWS_FOR_MISSING_IDS: DbBankAccount[] = [
  {
    id: "bolan-prem-24500343784",
    user_id: null,
    source_file: null,
    label: "Loan Prem (interest-only)",
    balance_sek: ACCOUNT_BALANCE_FALLBACK_SEK["bolan-prem-24500343784"]!,
    owners: ["joint"],
    category: "mortgage_debt",
    notes: null,
  },
];

export function buildBankAccountsFromDb(rows: DbBankAccount[]): BankAccountRow[] {
  const ids = new Set(rows.map((r) => r.id));
  const merged = [
    ...rows,
    ...DEFAULT_DB_ROWS_FOR_MISSING_IDS.filter((d) => !ids.has(d.id)),
  ];

  return merged.map((r) => ({
    id: r.id,
    sourceFile: r.source_file ?? "",
    label: r.label,
    balanceSek: r.balance_sek ?? ACCOUNT_BALANCE_FALLBACK_SEK[r.id] ?? null,
    owners: r.owners.map((o) => OWNER_MAP[o] ?? "joint") as PersonaKey[],
    category: r.category as AccountCategory,
    notes: r.notes ?? undefined,
  }));
}

export function defaultLiquidityFromAccounts(accounts: BankAccountRow[]): number {
  const ids = new Set(["christian-24890618775", "household-12110506350", "shared-24890598057"]);
  return Math.round(
    accounts.filter((a) => ids.has(a.id)).reduce((sum, a) => sum + (a.balanceSek ?? 0), 0),
  );
}

export const investmentTransfers = [
  { id: "june-spara", label: "June Spara", monthlySek: 2_500, owner: "christian" as PersonaKey, source: "AccountChristian (recurring)" },
];

export function approximateMonthlyMortgagePaymentsSek(): number {
  return Math.round(547.44 + 1_818.54 + 2_939.66);
}
