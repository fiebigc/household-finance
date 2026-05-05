import type { SwedishBenefitProgramYear } from "@/types/swedishBenefitProgram";
import se2026Json from "@/data/benefit-programs/se-2026.json";

export const SWEDISH_BENEFIT_PROGRAM_2026: SwedishBenefitProgramYear =
  se2026Json as SwedishBenefitProgramYear;

type DailyParams = {
  calculation_factor: number;
  sgi_adjustment_factor: number;
  max_annual_sgi: number;
  max_daily_payout?: number;
};

/**
 * Matches the documented logic:
 * ((Min(Annual_Income, Max_Annual_SGI) * sgi_adjustment_factor) * calculation_factor) / 365
 */
export function estimatedDailyBenefitBeforeCap(
  annualIncome: number,
  params: Pick<DailyParams, "calculation_factor" | "sgi_adjustment_factor" | "max_annual_sgi">,
): number {
  const capped = Math.min(Math.max(0, annualIncome), params.max_annual_sgi);
  return (capped * params.sgi_adjustment_factor * params.calculation_factor) / 365;
}

export function estimatedDailyBenefitRounded(
  annualIncome: number,
  params: DailyParams,
): number {
  const raw = estimatedDailyBenefitBeforeCap(annualIncome, params);
  const capped =
    params.max_daily_payout != null ? Math.min(raw, params.max_daily_payout) : raw;
  return Math.round(capped);
}

/** Sickness benefit (sjukpenning) — same core formula as in program JSON. */
export function estimatedSjukpenningDailySek(
  annualIncome: number,
  program: SwedishBenefitProgramYear = SWEDISH_BENEFIT_PROGRAM_2026,
): number {
  const b = program.benefits.sjukpenning;
  return estimatedDailyBenefitRounded(annualIncome, {
    calculation_factor: b.calculation_factor,
    sgi_adjustment_factor: b.sgi_adjustment_factor,
    max_annual_sgi: b.max_annual_sgi,
    max_daily_payout: b.max_daily_payout,
  });
}

/** VAB — capped annual SGI differs from sjukpenning; no max_daily_payout in source JSON. */
export function estimatedVabDailySek(
  annualIncome: number,
  program: SwedishBenefitProgramYear = SWEDISH_BENEFIT_PROGRAM_2026,
): number {
  const b = program.benefits.vab;
  return Math.round(
    estimatedDailyBenefitBeforeCap(annualIncome, {
      calculation_factor: b.calculation_factor,
      sgi_adjustment_factor: b.sgi_adjustment_factor,
      max_annual_sgi: b.max_annual_sgi,
    }),
  );
}

export type ForaldrapenningEstimate = {
  tier: "sgi_level" | "grundniva";
  /** Approximate föräldrapenning per benefit day before tax (SEK), whole crowns. */
  dailySek: number;
};

/**
 * Föräldrapenning on SGI level uses the same core formula as sjukpenning (per program block).
 * When annual SGI is absent/zero, grundniva applies (per JSON notes).
 */
export function estimatedForaldrapenningDailySek(
  annualSgi: number,
  program: SwedishBenefitProgramYear = SWEDISH_BENEFIT_PROGRAM_2026,
): ForaldrapenningEstimate {
  const fp = program.benefits.foraldrapenning;
  if (!Number.isFinite(annualSgi) || annualSgi <= 0) {
    return { tier: "grundniva", dailySek: fp.grundniva.daily_amount };
  }
  const sg = fp.sgi_level;
  const daily = estimatedDailyBenefitRounded(annualSgi, {
    calculation_factor: sg.calculation_factor,
    sgi_adjustment_factor: sg.sgi_adjustment_factor,
    max_annual_sgi: sg.max_annual_sgi,
    max_daily_payout: sg.max_daily_payout,
  });
  return { tier: "sgi_level", dailySek: daily };
}
