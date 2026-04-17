import {
  RANTEAVDRAG_FIRST_TIER_ANNUAL_CAP_SEK,
  RANTEAVDRAG_FIRST_TIER_RATE,
  RANTEAVDRAG_SECOND_TIER_RATE,
} from "./swedishConstants";

export interface RanteavdragCalculatorInput {
  annualInterestPaidSek: number;
}

export interface RanteavdragCalculatorResult {
  deductionSek: number;
  effectiveDeductionRatePct: number;
}

/**
 * Applies Swedish interest deduction on private housing loans:
 * 30% on interest up to 100,000 SEK/year, 21% on the remainder.
 */
export function calculateRanteavdrag(
  input: RanteavdragCalculatorInput,
): RanteavdragCalculatorResult {
  const interest = Math.max(0, input.annualInterestPaidSek);

  const firstTierInterest = Math.min(interest, RANTEAVDRAG_FIRST_TIER_ANNUAL_CAP_SEK);
  const secondTierInterest = Math.max(0, interest - RANTEAVDRAG_FIRST_TIER_ANNUAL_CAP_SEK);

  const deductionSek =
    firstTierInterest * RANTEAVDRAG_FIRST_TIER_RATE +
    secondTierInterest * RANTEAVDRAG_SECOND_TIER_RATE;

  const effectiveDeductionRatePct =
    interest > 0 ? (deductionSek / interest) * 100 : 0;

  return {
    deductionSek,
    effectiveDeductionRatePct,
  };
}
