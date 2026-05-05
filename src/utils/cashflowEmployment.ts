import type { Cashflow } from "@/types/schema";
import {
  startOfMonth,
  endOfMonth,
  isAfter,
  isBefore,
} from "date-fns";
import { parseISO } from "date-fns";

/** Salary / freelance lines can carry an employment period; other income ignores these fields. */
const EMPLOYMENT_WINDOW_CATEGORIES = new Set<Cashflow["category"]>(["salary", "freelance"]);

function hasEmploymentWindow(cf: Cashflow): boolean {
  return !!(cf.employment_active_from ?? cf.employment_active_until);
}

/**
 * Whether this gross employment-style income counts toward P&amp;L in `monthStart`’s projection month.
 * Open-ended periods (both fields empty) behave like legacy rows: always on.
 */
export function employmentIncomeCountsInProjectionMonth(cf: Cashflow, monthStart: Date): boolean {
  if (cf.direction !== "income") return true;
  if (!EMPLOYMENT_WINDOW_CATEGORIES.has(cf.category)) return true;
  if (!hasEmploymentWindow(cf)) return true;

  try {
    const fromRaw = cf.employment_active_from?.trim();
    if (fromRaw) {
      const from = parseISO(fromRaw);
      if (Number.isFinite(from.getTime())) {
        if (isBefore(monthStart, startOfMonth(from))) return false;
      }
    }
    const untilRaw = cf.employment_active_until?.trim();
    if (untilRaw) {
      const until = parseISO(untilRaw);
      if (Number.isFinite(until.getTime())) {
        if (isAfter(monthStart, endOfMonth(until))) return false;
      }
    }
    return true;
  } catch {
    return true;
  }
}

/** Shown under Data → Cashflows Income streams when employment applies to **this** calendar month (reference: today). */
export function employmentIncomeShownInCashflowsManager(cf: Cashflow): boolean {
  return employmentIncomeCountsInProjectionMonth(cf, startOfMonth(new Date()));
}

/** Fade past/future salary lines in People & Companies (inactive for «now» projections). */
export function employmentIncomeInactiveForUi(cf: Cashflow): boolean {
  if (cf.direction !== "income" || !EMPLOYMENT_WINDOW_CATEGORIES.has(cf.category)) return false;
  if (!hasEmploymentWindow(cf)) return false;
  return !employmentIncomeCountsInProjectionMonth(cf, startOfMonth(new Date()));
}
