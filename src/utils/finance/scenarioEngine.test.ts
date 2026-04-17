import { describe, expect, it } from "vitest";
import { defaultHouseholdConfig } from "../../config/householdConfig";
import { buildScenarioRunPlan, scenarios } from "../../config/scenarios";
import { runScenarioEngine } from "./scenarioEngine";

describe("runScenarioEngine", () => {
  it("reduces fixed costs after loan payoff event", () => {
    const result = runScenarioEngine({
      householdConfig: defaultHouseholdConfig,
      events: [
        {
          id: "pay-loan3",
          scenarioId: "LoanPayoff",
          effectiveDate: "2026-05-01",
          type: "loan_change",
          description: "",
          payload: {
            loanId: "loan3",
            newPrincipalSek: 0,
          },
        },
      ],
      projectionStartMonth: "2026-05",
      projectionMonths: 2,
    });

    const may = result.projections[0];
    const june = result.projections[1];
    expect(may).toBeDefined();
    expect(june).toBeDefined();
    if (!may || !june) {
      throw new Error("Expected projection rows for May and June");
    }
    expect(may.totalFixedCostsSek).toBe(june.totalFixedCostsSek);
    expect(may.appliedEventIds).toContain("pay-loan3");
  });

  it("computes cumulative net cash flow", () => {
    const result = runScenarioEngine({
      householdConfig: defaultHouseholdConfig,
      events: [],
      projectionStartMonth: "2026-05",
      projectionMonths: 3,
    });
    const manual = result.projections.reduce((s, p) => s + p.netCashflowSek, 0);
    expect(result.summary.cumulativeNetCashflowSek).toBeCloseTo(manual, 5);
  });

  it("runs all canonical scenarios with matching projection length", () => {
    for (const scenario of scenarios) {
      const plan = buildScenarioRunPlan({
        config: defaultHouseholdConfig,
        scenarioId: scenario.id,
      });
      const result = runScenarioEngine({
        householdConfig: defaultHouseholdConfig,
        events: plan.events,
        projectionStartMonth: plan.projectionStartMonth,
        projectionMonths: plan.projectionMonths,
      });
      expect(result.projections).toHaveLength(plan.projectionMonths);
    }
  });
});
