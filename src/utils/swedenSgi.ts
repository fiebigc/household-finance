import type { Cashflow, Entity, PeriodType } from "@/types/schema";
import seSgiBasisJson from "@/data/benefit-programs/se-sgi-basis.json";

export type SeSgiBasisJson = typeof seSgiBasisJson;

export const SE_SGI_BASIS: SeSgiBasisJson = seSgiBasisJson;

/**
 * Annual SGI equivalent from a sum of qualifying **monthly** employment income over `referenceMonthCount`
 * months (commonly 6). Same as: average monthly income from that window × 12.
 */
export function annualSgiFromEmploymentIncomeSum(
  sumQualifyingEmploymentIncome: number,
  referenceMonthCount: number,
): number {
  const n = referenceMonthCount;
  if (!Number.isFinite(sumQualifyingEmploymentIncome) || n <= 0 || !Number.isFinite(n)) return 0;
  return (sumQualifyingEmploymentIncome / n) * 12;
}

/** When the last 6 calendar months of qualifying employment are summed (typical case). */
export function annualSgiFromSixMonthEmploymentSum(sumSixMonths: number): number {
  return annualSgiFromEmploymentIncomeSum(sumSixMonths, SE_SGI_BASIS.annualisation.typical_reference_months);
}

const META_ANNUAL_KEYS = ["annual_sgi", "sgi"] as const;
const META_SUM_KEYS = ["six_month_employment_income_sum", "six_month_income_sum"] as const;

/**
 * Resolve an annual SGI figure for benefit estimates (Sweden), from entity metadata.
 *
 * Priority:
 * 1. `metadata.annual_sgi` or `metadata.sgi` (SEK/year, already annual)
 * 2. `metadata.six_month_employment_income_sum` (or `six_month_income_sum`) with optional
 *    `metadata.sgi_reference_months` (defaults to 6) — last N months of employment income summed
 *    and annualised as (sum / N) * 12 per `se-sgi-basis.json`
 */
export function resolveEntityAnnualSgiFromMetadata(entity: Entity): number {
  const meta = entity.metadata as Record<string, unknown> | undefined;
  if (!meta) return 0;

  for (const k of META_ANNUAL_KEYS) {
    const v = meta[k];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) return v;
  }

  for (const k of META_SUM_KEYS) {
    const raw = meta[k];
    if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
      const nRaw = meta.sgi_reference_months;
      const n =
        typeof nRaw === "number" && Number.isFinite(nRaw) && nRaw > 0
          ? Math.round(nRaw)
          : SE_SGI_BASIS.annualisation.typical_reference_months;
      return annualSgiFromEmploymentIncomeSum(raw, n);
    }
  }

  return 0;
}

const SGI_QC_CATEGORIES = new Set<Cashflow["category"]>(["salary", "freelance"]);

/**
 * Nominal monthly gross equivalent for a saved income cashflow (ignores date_from / date_to).
 * Used so an ended employment row still defines SGI basis (e.g. same idea as a frozen SGI while unemployed).
 */
export function salaryCashflowMonthlyGrossEquivalent(cf: Cashflow): number {
  if (cf.archived_at != null) return 0;
  if (cf.direction !== "income" || !SGI_QC_CATEGORIES.has(cf.category)) return 0;
  if (!cf.is_gross) return 0;

  switch (cf.frequency) {
    case "monthly":
      return cf.amount;
    case "annually":
      return cf.amount / 12;
    case "quarterly":
      return cf.amount / 3;
    case "weekly":
      return cf.amount * 4.33;
    case "biweekly":
      return cf.amount * 2.17;
    case "daily":
      return cf.amount * 30;
    case "one_off":
      return 0;
    default:
      return 0;
  }
}

/**
 * When metadata has no SGI fields, infer annual SGI from gross **salary / freelance** income cashflows (sum of monthly equivalents × 12).
 * Matches the common case: 40 000 kr/mo gross → 480 000 kr/yr — the same mental model as FK’s sjukpenninggrundande inkomst figure on Mina sidor.
 */
export function estimateAnnualSgiFromQualifyingSalaryCashflows(
  entityId: string,
  cashflows: Cashflow[],
): number {
  let monthlySum = 0;
  for (const cf of cashflows) {
    if (cf.entity_id !== entityId) continue;
    monthlySum += salaryCashflowMonthlyGrossEquivalent(cf);
  }
  if (!Number.isFinite(monthlySum) || monthlySum <= 0) return 0;
  return monthlySum * 12;
}

/**
 * Annual SGI for benefit estimates: explicit metadata first, then qualifying gross employment-style cashflows (`salary`, `freelance`).
 */
export function resolveEntityAnnualSgiForBenefits(entity: Entity, cashflows: Cashflow[]): number {
  const fromMeta = resolveEntityAnnualSgiFromMetadata(entity);
  if (fromMeta > 0) return fromMeta;
  return estimateAnnualSgiFromQualifyingSalaryCashflows(entity.id, cashflows);
}

/** Period types commonly associated with SGI “freeze” / protection in summary copy (not legal classification). */
export function periodTypesMentionedAsSgiProtectionModes(): readonly PeriodType[] {
  const list = SE_SGI_BASIS.protection.period_types_for_modeling_in_app
    .often_treated_as_absence_with_frozen_or_protected_basis;
  return list as PeriodType[];
}

/** Short UI copy; full rules live in `src/data/benefit-programs/se-sgi-basis.json`. */
export function swedishSgiBenefitLevelFieldHint(): string {
  const basis = SE_SGI_BASIS.annualisation;
  return [
    "Annual SGI (SEK/year) for estimates, or leave 0.",
    "On the adult entity you can set metadata `annual_sgi`, or `six_month_employment_income_sum` (annualised as (sum ÷ months) × 12 — typically " +
      String(basis.typical_reference_months) +
      " months).",
    "Otherwise the app infers SGI from gross income lines with category Salary or Freelance (monthly equivalent × 12), e.g. to match Försäkringskassa when you had about 40 000 kr/mo before unemployment.",
    "SGI is typically protected during certain absences (leave, holiday, unemployment, etc.); see app data for wording — Försäkringskassa decides in real cases.",
  ].join(" ");
}
