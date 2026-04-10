/**
 * Swedish social-benefit calculator for **2026**, Stockholm residence.
 *
 * Sources:
 *  - Prisbasbelopp 2026: 59 200 SEK  (SCB)
 *  - Föräldrapenning: Försäkringskassan (sjukpenningnivå / lägstanivå / grundnivå)
 *  - A-kassa: new rules from 1 Oct 2025 (income-based qualification)
 *  - Starta eget bidrag: Arbetsförmedlingen (same daily rate as a-kassa)
 *  - Stockholm total municipal+regional tax: 30.55%
 *
 * These are **planning approximations**, not exact Försäkringskassan / Skatteverket outputs.
 */

export const PRISBASBELOPP = 59_200;
export const SGI_CEILING = PRISBASBELOPP * 10;              // 592 000
export const STOCKHOLM_TAX_RATE = 0.3055;

// ── Föräldrapenning ────────────────────────────────────────────────────

const FP_FACTOR = 0.776;                                     // 80% × 0.97
const FP_MAX_DAILY = 1_288;
const FP_LAGSTA_DAILY = 180;
const FP_GRUND_DAILY = 250;
const CALENDAR_DAYS_PER_MONTH = 30;

/** Daily föräldrapenning at sjukpenningnivå. */
export function parentalDailySjukpenningniva(sgiAnnual: number): number {
  const capped = Math.min(sgiAnnual, SGI_CEILING);
  if (capped <= 0) return FP_GRUND_DAILY;
  const daily = (capped * FP_FACTOR) / 365;
  return Math.min(daily, FP_MAX_DAILY);
}

/**
 * Monthly parental-leave payment (gross, before tax).
 * @param sgiAnnual  SGI in SEK/year
 * @param percent    0–100 share of time on parental leave
 * @param useLagsta  true → use lägstanivå (180/day) instead of sjukpenningnivå
 */
export function monthlyParentalLeaveGross(sgiAnnual: number, percent: number, useLagsta = false): number {
  if (percent <= 0) return 0;
  const daily = useLagsta ? FP_LAGSTA_DAILY : parentalDailySjukpenningniva(sgiAnnual);
  return daily * CALENDAR_DAYS_PER_MONTH * (percent / 100);
}

// ── A-kassa (unemployment insurance) ────────────────────────────────

const AKASSA_MAX_MONTHLY_BASIS = 34_000;
const AKASSA_MAX_DAILY = 1_236;
const WORKING_DAYS_PER_MONTH = 22;

/**
 * Simplified a-kassa monthly gross — models the **first 100 days** bracket (80%).
 * For longer-term scenarios, call with the step-down rate manually.
 *
 * @param previousMonthlyGross  Last employment gross before unemployment
 * @param percent               0–100 share of time on a-kassa
 * @param replacementRate       0.80 (day 1–100), 0.70 (day 101–200), 0.65 (day 201+)
 */
export function monthlyAkassaGross(
  previousMonthlyGross: number,
  percent: number,
  replacementRate = 0.80,
): number {
  if (percent <= 0) return 0;
  const basis = Math.min(previousMonthlyGross, AKASSA_MAX_MONTHLY_BASIS);
  const monthlyFull = Math.min(basis * replacementRate, AKASSA_MAX_DAILY * WORKING_DAYS_PER_MONTH);
  return monthlyFull * (percent / 100);
}

// ── Starta eget bidrag ──────────────────────────────────────────────

/**
 * Monthly starta-eget subsidy (equals a-kassa level).
 * @param previousMonthlyGross  Last employment gross before starting the business
 * @param percent               0–100 share of time receiving subsidy
 */
export function monthlyStartaEgetGross(previousMonthlyGross: number, percent: number): number {
  return monthlyAkassaGross(previousMonthlyGross, percent, 0.80);
}

// ── Employment income ───────────────────────────────────────────────

/**
 * Monthly employment gross scaled by work-hour fraction (0–40 h/week).
 */
export function monthlyEmploymentGross(fullTimeGross: number, hoursPerWeek: number): number {
  const fraction = Math.max(0, Math.min(hoursPerWeek, 40)) / 40;
  return fullTimeGross * fraction;
}

// ── Daycare cost (maxtaxa) ──────────────────────────────────────────

const DAYCARE_MONTHLY = [1_688, 1_125, 563];

/**
 * Total monthly daycare cost under maxtaxa for `n` children (ages 1–5).
 * Child 1 = 1 688 SEK, child 2 = 1 125, child 3 = 563, child 4+ = 0.
 */
export function monthlyDaycareCost(numberOfChildren: number): number {
  let total = 0;
  for (let i = 0; i < numberOfChildren; i++) {
    total += DAYCARE_MONTHLY[i] ?? 0;
  }
  return total;
}

// ── Aggregate scenario builder ──────────────────────────────────────

export type BenefitBreakdown = {
  employmentGross: number;
  parentalLeaveGross: number;
  akassaGross: number;
  startaEgetGross: number;
  totalGross: number;
  daycareCost: number;
};

export type ScenarioInput = {
  sgiAnnual: number;
  fullTimeMonthlyGross: number;
  workHoursPerWeek: number;
  parentalLeavePercent: number;
  akassaPercent: number;
  startaEgetPercent: number;
  daycareChildren: number;
};

export function computeBenefitBreakdown(input: ScenarioInput): BenefitBreakdown {
  const employmentGross = monthlyEmploymentGross(input.fullTimeMonthlyGross, input.workHoursPerWeek);
  const parentalLeaveGross = monthlyParentalLeaveGross(input.sgiAnnual, input.parentalLeavePercent);
  const akassaGross = monthlyAkassaGross(input.fullTimeMonthlyGross, input.akassaPercent);
  const startaEgetGross = monthlyStartaEgetGross(input.fullTimeMonthlyGross, input.startaEgetPercent);
  const totalGross = employmentGross + parentalLeaveGross + akassaGross + startaEgetGross;
  const daycareCost = monthlyDaycareCost(input.daycareChildren);
  return { employmentGross, parentalLeaveGross, akassaGross, startaEgetGross, totalGross, daycareCost };
}
