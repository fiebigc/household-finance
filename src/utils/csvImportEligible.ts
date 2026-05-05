import type { Account } from "@/types/schema";

/** Account types eligible for Danske ledger CSV imports in-app. */
export const CSV_ELIGIBLE_ACCOUNT_TYPES: ReadonlyArray<Account["type"]> = [
  "bank",
  "savings",
  "credit",
  "investment",
  "loan",
  "pension",
];

export function isCsvImportEligibleAccount(a: Pick<Account, "type" | "archived_at">): boolean {
  return !a.archived_at && CSV_ELIGIBLE_ACCOUNT_TYPES.includes(a.type);
}
