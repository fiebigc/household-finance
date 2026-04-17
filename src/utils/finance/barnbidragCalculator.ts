import type { ChildInvestmentAllocation } from "../../config/householdConfig";

export interface BarnbidragCalculatorInput {
  numberOfChildren: number;
  baseMonthlyAmountPerChildSek: number;
  allocation: ChildInvestmentAllocation;
}

export interface BarnbidragCalculatorResult {
  monthlyTotalSek: number;
  monthlyAllocationSek: {
    indexFundSek: number;
    amfShortRateSek: number;
    amfLongRateSek: number;
  };
}

/**
 * Monthly barnbidrag total and split by investment allocation (percent of total).
 */
export function calculateBarnbidrag(
  input: BarnbidragCalculatorInput,
): BarnbidragCalculatorResult {
  const n = Math.max(0, Math.floor(input.numberOfChildren));
  const monthlyTotalSek = n * Math.max(0, input.baseMonthlyAmountPerChildSek);

  const sumPct =
    input.allocation.indexFundPct +
    input.allocation.amfShortRatePct +
    input.allocation.amfLongRatePct;

  if (sumPct <= 0 || monthlyTotalSek === 0) {
    return {
      monthlyTotalSek,
      monthlyAllocationSek: {
        indexFundSek: 0,
        amfShortRateSek: 0,
        amfLongRateSek: 0,
      },
    };
  }

  return {
    monthlyTotalSek,
    monthlyAllocationSek: {
      indexFundSek: (monthlyTotalSek * input.allocation.indexFundPct) / sumPct,
      amfShortRateSek: (monthlyTotalSek * input.allocation.amfShortRatePct) / sumPct,
      amfLongRateSek: (monthlyTotalSek * input.allocation.amfLongRatePct) / sumPct,
    },
  };
}
