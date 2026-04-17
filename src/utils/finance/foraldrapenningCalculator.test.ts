import { describe, expect, it } from "vitest";
import { calculateForaldrapenning } from "./foraldrapenningCalculator";
import { FORALDERPENNING_DAILY_CAP_SEK } from "./swedishConstants";

describe("calculateForaldrapenning", () => {
  it("caps daily rate at 1078 SEK", () => {
    const r = calculateForaldrapenning({
      annualSgiSek: 592_000,
      daysRequested: 30,
    });
    expect(r.dailyRateSek).toBeLessThanOrEqual(FORALDERPENNING_DAILY_CAP_SEK + 1e-6);
    expect(r.capApplied).toBe(true);
  });

  it("scales monthly gross by daysRequested", () => {
    const r = calculateForaldrapenning({
      annualSgiSek: 300_000,
      daysRequested: 10,
    });
    expect(r.monthlyGrossSek).toBeCloseTo(r.dailyRateSek * 10, 5);
  });
});
