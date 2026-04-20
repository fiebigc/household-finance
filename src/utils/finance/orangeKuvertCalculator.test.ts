import { describe, expect, it } from "vitest";
import { estimateOrangeKuvertMonthlyAccrual } from "./orangeKuvertCalculator";

describe("estimateOrangeKuvertMonthlyAccrual", () => {
  it("applies default accrual rate to brutto", () => {
    const r = estimateOrangeKuvertMonthlyAccrual({ monthlyBruttoIncomeSek: 100_000 });
    expect(r.monthlyAccrualSek).toBe(4500);
    expect(r.annualAccrualSek).toBe(54_000);
  });
});
