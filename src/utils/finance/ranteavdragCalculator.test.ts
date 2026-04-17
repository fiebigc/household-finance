import { describe, expect, it } from "vitest";
import { calculateRanteavdrag } from "./ranteavdragCalculator";

describe("calculateRanteavdrag", () => {
  it("applies 30% on first 100k and 21% on remainder", () => {
    const r = calculateRanteavdrag({ annualInterestPaidSek: 150_000 });
    expect(r.deductionSek).toBeCloseTo(100_000 * 0.3 + 50_000 * 0.21, 5);
    expect(r.effectiveDeductionRatePct).toBeCloseTo(
      (r.deductionSek / 150_000) * 100,
      5,
    );
  });

  it("returns zero deduction for zero interest", () => {
    const r = calculateRanteavdrag({ annualInterestPaidSek: 0 });
    expect(r.deductionSek).toBe(0);
    expect(r.effectiveDeductionRatePct).toBe(0);
  });
});
