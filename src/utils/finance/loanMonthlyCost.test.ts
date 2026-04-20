import { describe, expect, it } from "vitest";
import { loanMonthlyInterestCostSek, totalLoansMonthlyInterestCostSek } from "./loanMonthlyCost";
import type { LoanConfig } from "@/config/householdConfig";

const sample: LoanConfig = {
  id: "loan1",
  label: "Test",
  principalSek: 1_200_000,
  annualInterestRatePct: 3.6,
  rateType: "floating",
  fixedRateExpiryDate: null,
};

describe("loanMonthlyCost", () => {
  it("computes interest-only monthly SEK", () => {
    // 1_200_000 * 0.036 / 12 = 3600
    expect(loanMonthlyInterestCostSek(sample)).toBe(3600);
  });

  it("sums multiple loans", () => {
    const b: LoanConfig = { ...sample, id: "loan2", principalSek: 600_000, annualInterestRatePct: 3.6 };
    expect(totalLoansMonthlyInterestCostSek([sample, b])).toBe(3600 + 1800);
  });
});
