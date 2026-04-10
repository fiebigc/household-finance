/**
 * Merged transaction list from all bank accounts.
 * Pure function — accepts DB rows, no CSV imports.
 */
import type { DbTransaction } from "@/data/bankLiquidityHistory";

export type MergedTransaction = {
  dateStr: string;
  account: string;
  specifikation: string;
  belopp: number;
  saldo: number | null;
};

const ACCOUNT_LABELS: Record<string, string> = {
  "household-12110506350": "Household",
  "shared-24890598057": "Shared",
  "christian-24890618775": "Christian",
  "mastercard-guld-24890598081": "Mastercard",
  "bolan-fast-24500343776-buffer": "Mortgage buffer",
  "bolan-prem-24500343784": "Loan Prem",
};

export function buildAllTransactions(
  transactions: DbTransaction[],
): MergedTransaction[] {
  const all: MergedTransaction[] = transactions.map((tx) => ({
    dateStr: tx.transaction_date,
    account: ACCOUNT_LABELS[tx.bank_account_id] ?? tx.bank_account_id,
    specifikation: tx.specifikation,
    belopp: tx.belopp,
    saldo: tx.saldo,
  }));
  all.sort((a, b) => b.dateStr.localeCompare(a.dateStr));
  return all;
}
