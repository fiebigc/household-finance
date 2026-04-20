import type { LoanConfig } from "@/config/householdConfig";

/**
 * Interest-only monthly cost from principal and nominal annual rate (planning simplification).
 * Amortization is not modeled in `LoanConfig`.
 */
export function loanMonthlyInterestCostSek(loan: LoanConfig): number {
  return Math.round((loan.principalSek * (loan.annualInterestRatePct / 100)) / 12);
}

export function totalLoansMonthlyInterestCostSek(loans: readonly LoanConfig[]): number {
  return loans.reduce((sum, loan) => sum + loanMonthlyInterestCostSek(loan), 0);
}
