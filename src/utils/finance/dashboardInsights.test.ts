import { describe, expect, it } from "vitest";
import { defaultHouseholdConfig } from "../../config/householdConfig";
import {
  buildDashboardInsights,
  computeFinancialHealthScore,
  recurringNetOutflowSek,
} from "./dashboardInsights";

describe("computeFinancialHealthScore", () => {
  it("scores higher with positive margin and lower LTV", () => {
    const a = computeFinancialHealthScore({
      incomeSek: 80_000,
      netAfterRecurringSek: 10_000,
      ltvRatio: 0.5,
      scenarioLowestNet: 5_000,
    });
    const b = computeFinancialHealthScore({
      incomeSek: 80_000,
      netAfterRecurringSek: -2_000,
      ltvRatio: 0.88,
      scenarioLowestNet: -3_000,
    });
    expect(a.score).toBeGreaterThan(b.score);
  });
});

describe("recurringNetOutflowSek", () => {
  it("subtracts recurring incomes from expense total", () => {
    expect(
      recurringNetOutflowSek([
        { amountSek: 1000, kind: "expense" },
        { amountSek: 300, kind: "income" },
      ]),
    ).toBe(700);
  });
});

describe("buildDashboardInsights", () => {
  it("flags negative cash flow after recurring", () => {
    const res = buildDashboardInsights({
      householdConfig: defaultHouseholdConfig,
      recurringCostsMonthlySek: 500_000,
      recurringItems: [
        { id: "r1", label: "Huge", amountSek: 500_000, kind: "expense" },
      ],
      scenarioLowestMonthlyNetSek: null,
      liquidBalancesSek: 100_000,
    });
    expect(res.netAfterRecurringSek).toBeLessThan(0);
    expect(res.insights.some((i) => i.id === "negative-after-recurring")).toBe(true);
  });
});
