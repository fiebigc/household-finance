import {
  AKASSA_DAILY_CAP_SEK,
  AKASSA_MAX_MONTHLY_BASIS_SEK,
  AKASSA_REPLACEMENT_RATE_DEFAULT,
  AKASSA_WORKING_DAYS_PER_MONTH,
} from "./swedishConstants";

export interface AkassaCalculatorInput {
  annualSgiSek: number;
  membershipMonths: number;
  taxRatePct?: number;
}

export interface AkassaCalculatorResult {
  dailyRateSek: number;
  monthlyGrossSek: number;
  monthlyNetSek: number;
  capApplied: boolean;
}

/** Minimum membership months for income-related benefit (planning default). */
export const AKASSA_INCOME_RELATED_MIN_MEMBERSHIP_MONTHS = 12;

/**
 * A-kassa: basis from monthly income implied by annual SGI (≈ SGI/12), capped,
 * replacement 80% first bracket, daily cap 1200 SEK.
 * If membership &lt; 12 months, income-related amount is 0 (basic rules not modeled).
 */
export function calculateAkassa(input: AkassaCalculatorInput): AkassaCalculatorResult {
  const membershipMonths = Math.max(0, Math.floor(input.membershipMonths));

  if (membershipMonths < AKASSA_INCOME_RELATED_MIN_MEMBERSHIP_MONTHS) {
    const tax = input.taxRatePct ?? 0;
    return {
      dailyRateSek: 0,
      monthlyGrossSek: 0,
      monthlyNetSek: 0,
      capApplied: false,
    };
  }

  const impliedMonthlyFromSgi = Math.max(0, input.annualSgiSek) / 12;
  const basisMonthly = Math.min(impliedMonthlyFromSgi, AKASSA_MAX_MONTHLY_BASIS_SEK);
  const replacement = AKASSA_REPLACEMENT_RATE_DEFAULT;

  const uncappedMonthly = basisMonthly * replacement;
  const monthlyCap = AKASSA_DAILY_CAP_SEK * AKASSA_WORKING_DAYS_PER_MONTH;
  const monthlyGrossSek = Math.min(uncappedMonthly, monthlyCap);
  const capApplied = uncappedMonthly > monthlyCap + 1e-9;

  const dailyRateSek = monthlyGrossSek / AKASSA_WORKING_DAYS_PER_MONTH;

  const tax = input.taxRatePct ?? 0;
  const monthlyNetSek = monthlyGrossSek * (1 - Math.min(100, Math.max(0, tax)) / 100);

  return {
    dailyRateSek,
    monthlyGrossSek,
    monthlyNetSek,
    capApplied,
  };
}
