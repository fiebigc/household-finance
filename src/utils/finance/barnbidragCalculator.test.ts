import { describe, expect, it } from "vitest";
import { calculateBarnbidrag } from "./barnbidragCalculator";

describe("calculateBarnbidrag", () => {
  it("sums children and splits by allocation weights", () => {
    const r = calculateBarnbidrag({
      numberOfChildren: 2,
      baseMonthlyAmountPerChildSek: 1250,
      allocation: {
        indexFundPct: 80,
        amfShortRatePct: 10,
        amfLongRatePct: 10,
      },
    });
    expect(r.monthlyTotalSek).toBe(2500);
    const sum =
      r.monthlyAllocationSek.indexFundSek +
      r.monthlyAllocationSek.amfShortRateSek +
      r.monthlyAllocationSek.amfLongRateSek;
    expect(sum).toBeCloseTo(2500, 5);
    expect(r.monthlyAllocationSek.indexFundSek).toBeCloseTo(2000, 5);
  });
});
