import type { Cashflow } from "@/types/schema";
import { isRenovationImportCashflow } from "@/utils/renovationExpensesCsv";

/** When true on a cashflow row, omit that side from Finance Flow diagrams, headline totals on Data, overview cash bars, and P&L in projections (pairs with symmetric income/expense for internal transfers). */
export const CASHFLOW_INTERNAL_INCOME_HIDE_KEY = "internal_hide_from_flow";

export function cashflowIncomeInternalHideFromFlow(cf: Cashflow): boolean {
  const m = cf.metadata;
  if (!m || typeof m !== "object" || Array.isArray(m)) return false;
  return (m as Record<string, unknown>)[CASHFLOW_INTERNAL_INCOME_HIDE_KEY] === true;
}

/** Renovation CSV imports are stored as cashflows for the Expenses tab only — exclude from all household P&L-style sums. */
export function cashflowExcludedFromHouseholdTotals(cf: Cashflow): boolean {
  return isRenovationImportCashflow(cf);
}

/** Merge/delete the internal-hide flag; returns null when the object would be empty. */
export function buildCashflowIncomeMetadata(
  prev: Cashflow["metadata"],
  internalOnly: boolean,
): Record<string, unknown> | null {
  const prevObj =
    prev && typeof prev === "object" && !Array.isArray(prev)
      ? { ...(prev as Record<string, unknown>) }
      : {};
  if (internalOnly) {
    prevObj[CASHFLOW_INTERNAL_INCOME_HIDE_KEY] = true;
  } else {
    delete prevObj[CASHFLOW_INTERNAL_INCOME_HIDE_KEY];
  }
  return Object.keys(prevObj).length ? prevObj : null;
}
