import { describe, expect, it } from "vitest";
import { calculateAkassa } from "./akassaCalculator";
import {
  AKASSA_DAILY_CAP_SEK,
  AKASSA_MAX_MONTHLY_BASIS_SEK,
  AKASSA_WORKING_DAYS_PER_MONTH,
} from "./swedishConstants";

describe("calculateAkassa", () => {
  it("returns zero when membership is below income-related threshold", () => {
    const r = calculateAkassa({
      annualSgiSek: 558_000,
      membershipMonths: 6,
    });
    expect(r.monthlyGrossSek).toBe(0);
    expect(r.dailyRateSek).toBe(0);
  });

  it("applies daily cap via monthly ceiling (1200 * 22)", () => {
    const r = calculateAkassa({
      annualSgiSek: 558_000,
      membershipMonths: 14,
    });
    const expectedCap = AKASSA_DAILY_CAP_SEK * AKASSA_WORKING_DAYS_PER_MONTH;
    const basisMonthly = Math.min(558_000 / 12, AKASSA_MAX_MONTHLY_BASIS_SEK);
    expect(basisMonthly * 0.8).toBeGreaterThan(expectedCap);
    expect(r.monthlyGrossSek).toBeCloseTo(expectedCap, 5);
    expect(r.capApplied).toBe(true);
    expect(r.dailyRateSek).toBeCloseTo(
      r.monthlyGrossSek / AKASSA_WORKING_DAYS_PER_MONTH,
      5,
    );
  });
});
