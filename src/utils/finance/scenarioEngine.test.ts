import { describe, expect, it } from "vitest";
import { defaultHouseholdConfig } from "../../config/householdConfig";
import {
  buildScenarioRunPlan,
  createBlankScenario,
} from "../../config/scenarios";
import {
  runScenarioEngine,
  scenarioExplorationAnchorsFromMonth0,
  ZERO_SCENARIO_ENTITY_ADJUSTMENTS,
} from "./scenarioEngine";

describe("runScenarioEngine", () => {
  it("reduces fixed costs after loan payoff event", () => {
    const result = runScenarioEngine({
      householdConfig: defaultHouseholdConfig,
      events: [
        {
          id: "pay-loan3",
          scenarioId: "test-scenario",
          effectiveDate: "2026-05-01",
          type: "loan_change",
          description: "Pay off loan 3",
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

  it("runs a blank scenario plan with matching projection length", () => {
    const list = [
      createBlankScenario({
        id: "plan-test",
        name: "Plan test",
        household: defaultHouseholdConfig,
      }),
    ];
    const plan = buildScenarioRunPlan({
      config: defaultHouseholdConfig,
      scenarioId: "plan-test",
      scenarios: list,
    });
    const result = runScenarioEngine({
      householdConfig: defaultHouseholdConfig,
      events: plan.events,
      projectionStartMonth: plan.projectionStartMonth,
      projectionMonths: plan.projectionMonths,
    });
    expect(result.projections).toHaveLength(plan.projectionMonths);
  });

  it("includes company typology cashflow in income", () => {
    const cfg = structuredClone(defaultHouseholdConfig);
    cfg.companyTypologyMonthlyEstimateSek = 10_000;
    const result = runScenarioEngine({
      householdConfig: cfg,
      events: [],
      projectionStartMonth: "2026-05",
      projectionMonths: 1,
    });
    const base = runScenarioEngine({
      householdConfig: defaultHouseholdConfig,
      events: [],
      projectionStartMonth: "2026-05",
      projectionMonths: 1,
    });
    expect(result.projections[0]!.totalIncomeSek).toBeCloseTo(
      base.projections[0]!.totalIncomeSek + 10_000,
      5,
    );
  });

  it("applies entity adjustments and cumulative liquidity from starting buffer", () => {
    const result = runScenarioEngine({
      householdConfig: defaultHouseholdConfig,
      events: [],
      projectionStartMonth: "2026-05",
      projectionMonths: 2,
      startingLiquiditySek: 100_000,
      entityAdjustments: {
        ...ZERO_SCENARIO_ENTITY_ADJUSTMENTS,
        adult1IncomeDeltaSek: 5_000,
        adult2CostDeltaSek: 2_000,
      },
    });
    const p0 = result.projections[0]!;
    const p1 = result.projections[1]!;
    expect(p0.netCashflowSek).toBeCloseTo(p0.totalIncomeSek - p0.totalFixedCostsSek - p0.totalVariableCostsSek, 5);
    expect(p0.cumulativeLiquiditySek).toBeCloseTo(100_000 + p0.netCashflowSek, 5);
    expect(p1.cumulativeLiquiditySek).toBeCloseTo(p0.cumulativeLiquiditySek + p1.netCashflowSek, 5);
  });

  it("adds recurring exploration to variable costs each month", () => {
    const anchors = scenarioExplorationAnchorsFromMonth0({
      householdConfig: defaultHouseholdConfig,
      events: [],
      projectionStartMonth: "2026-05",
    });
    const withRec = runScenarioEngine({
      householdConfig: defaultHouseholdConfig,
      events: [],
      projectionStartMonth: "2026-05",
      projectionMonths: 1,
      exploration: {
        loanInterestAnchorSek: anchors.loanInterestAnchorSek,
        incomeAnchorSek: anchors.incomeAnchorSek,
        loanInterestMonthlySek: anchors.loanInterestAnchorSek,
        incomeMonthlySek: anchors.incomeAnchorSek,
        recurringNetMonthlySek: 12_000,
      },
    });
    const base = runScenarioEngine({
      householdConfig: defaultHouseholdConfig,
      events: [],
      projectionStartMonth: "2026-05",
      projectionMonths: 1,
    });
    expect(withRec.projections[0]!.totalVariableCostsSek).toBeCloseTo(
      base.projections[0]!.totalVariableCostsSek + 12_000,
      5,
    );
  });
});
