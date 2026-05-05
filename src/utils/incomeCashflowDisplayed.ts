import type { Cashflow, Period, PeriodDayOverride, TaxProfile, Household, Account } from "@/types/schema";
import {
  resolveDefaultEstimatedWithholdingFraction,
  type HouseholdTaxLocationInput,
} from "@/utils/locationIncomeTaxDefaults";
import {
  getSwedenCityTaxProfile,
  swedenEffectiveEmploymentTax,
  type SwedenCityTaxProfile,
} from "@/utils/swedenIncomeTax";
import { cashflowContributesToPnLTotals } from "@/utils/cashflowAccounts";
import {
  cashflowExcludedFromHouseholdTotals,
  cashflowIncomeInternalHideFromFlow,
} from "@/utils/cashflowIncomeVisibility";
import { employmentIncomeCountsInProjectionMonth } from "@/utils/cashflowEmployment";
import { cashflowMonthlyAmount, resolveActivePeriodForMonth } from "@/utils/incomeCashflowMonth";
import { endOfMonth, startOfMonth } from "date-fns";

/** Mirrors projection engine tax step on scaled gross employment-style income. */
export function employmentNetFromScaledGross(
  cf: Cashflow,
  scaledGross: number,
  householdLocation: HouseholdTaxLocationInput | null,
  taxProfile: TaxProfile | undefined,
  fallbackFraction: number,
  seTax: SwedenCityTaxProfile | null,
): number {
  if (!cf.is_gross) return scaledGross;
  if (cf.tax_rate_override != null && Number.isFinite(cf.tax_rate_override)) {
    return scaledGross * (1 - Math.min(1, Math.max(0, cf.tax_rate_override)));
  }
  if (seTax) {
    return scaledGross - swedenEffectiveEmploymentTax(scaledGross, seTax);
  }
  if (taxProfile) {
    if (taxProfile.method === "flat_rate" && taxProfile.flat_rate != null) {
      return scaledGross * (1 - taxProfile.flat_rate);
    }
    if (taxProfile.method === "brackets" && taxProfile.brackets) {
      let remaining = scaledGross * 12;
      let totalTax = 0;
      for (const bracket of taxProfile.brackets) {
        const upper = bracket.to ?? Infinity;
        const taxable = Math.min(remaining, upper - bracket.from);
        if (taxable <= 0) break;
        totalTax += taxable * bracket.rate;
        remaining -= taxable;
      }
      return scaledGross - totalTax / 12;
    }
  }
  return scaledGross * (1 - fallbackFraction);
}

function householdToTaxLoc(h: Household | null): HouseholdTaxLocationInput | null {
  if (!h) return null;
  return { country: h.country, city: h.city };
}

/**
 * Net monthly income shown in Cashflows / Finance Flow for `referenceMonth`:
 * calendar FTE × monthly-equivalent stored gross, then Stockholm/Sweden illustrative withholding when applicable.
 */
export function displayedNetMonthlyIncomeForCashflow(
  cf: Cashflow,
  accounts: Account[],
  periods: Period[],
  dayOverrides: PeriodDayOverride[],
  household: Household | null,
  taxProfile: TaxProfile | undefined,
  referenceMonth: Date,
): number {
  if (cf.direction !== "income") return 0;
  if (cashflowExcludedFromHouseholdTotals(cf)) return 0;
  if (!cashflowContributesToPnLTotals(cf, accounts)) return 0;
  if (cashflowIncomeInternalHideFromFlow(cf)) return 0;
  if (!employmentIncomeCountsInProjectionMonth(cf, referenceMonth)) return 0;

  const monthStart = startOfMonth(referenceMonth);
  const monthEnd = endOfMonth(monthStart);
  const monthlyAmt = cashflowMonthlyAmount(cf, monthStart, monthEnd);
  if (monthlyAmt <= 0) return 0;

  const entityPeriods = periods.filter((p) => p.entity_id === cf.entity_id);
  const { fte } = resolveActivePeriodForMonth(entityPeriods, dayOverrides, monthStart, monthEnd);
  const scaled = monthlyAmt * fte;
  if (!(scaled > 0) || !Number.isFinite(scaled)) return 0;

  const loc = householdToTaxLoc(household);
  const fallbackFraction = resolveDefaultEstimatedWithholdingFraction(loc ?? {});
  const isSE = loc?.country?.toUpperCase() === "SE";
  const seTax = isSE ? getSwedenCityTaxProfile(loc?.city ?? null) : null;

  return employmentNetFromScaledGross(cf, scaled, loc ?? null, taxProfile, fallbackFraction, seTax);
}
