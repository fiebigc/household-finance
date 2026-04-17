import { describe, expect, it } from "vitest";
import { calculateStartaEgetBidrag } from "./startaEgetCalculator";
import { calculateAkassa } from "./akassaCalculator";

describe("calculateStartaEgetBidrag", () => {
  it("mirrors A-kassa gross when eligible", () => {
    const sgi = 558_000;
    const grant = calculateStartaEgetBidrag({
      isAkassaMember: true,
      akassaMembershipMonths: 14,
      plannedStartDate: "2026-09-01",
      annualSgiSek: sgi,
    });
    const akassa = calculateAkassa({ annualSgiSek: sgi, membershipMonths: 14 });
    expect(grant.isEligible).toBe(true);
    expect(grant.monthlyGrantSek).toBeCloseTo(akassa.monthlyGrossSek, 5);
  });

  it("is not eligible without membership length", () => {
    const grant = calculateStartaEgetBidrag({
      isAkassaMember: true,
      akassaMembershipMonths: 6,
      plannedStartDate: "2026-09-01",
      annualSgiSek: 400_000,
    });
    expect(grant.isEligible).toBe(false);
    expect(grant.monthlyGrantSek).toBe(0);
  });
});
