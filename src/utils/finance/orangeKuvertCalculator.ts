import { ORANGE_KUVERT_EMPLOYEE_ACCRUAL_RATE_DEFAULT } from "./swedishConstants";

export interface OrangeKuvertEstimateInput {
  monthlyBruttoIncomeSek: number;
  /** Share of brutto accrued monthly toward occupational pension (planning default). */
  employeeAccrualRate?: number;
}

export interface OrangeKuvertEstimateResult {
  monthlyAccrualSek: number;
  annualAccrualSek: number;
}

/**
 * Rough monthly accrual toward occupational pension (orange-envelope style planning).
 * Not a forecast of payout or official orange kuvert amount.
 */
export function estimateOrangeKuvertMonthlyAccrual(
  input: OrangeKuvertEstimateInput,
): OrangeKuvertEstimateResult {
  const rate = input.employeeAccrualRate ?? ORANGE_KUVERT_EMPLOYEE_ACCRUAL_RATE_DEFAULT;
  const b = Math.max(0, input.monthlyBruttoIncomeSek);
  const monthlyAccrualSek = Math.round(b * rate);
  return {
    monthlyAccrualSek,
    annualAccrualSek: monthlyAccrualSek * 12,
  };
}
