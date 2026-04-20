import { describe, expect, it } from "vitest";
import {
  buildScenarioRunPlan,
  createBlankScenario,
  getProjectionMonthSpan,
  INITIAL_BASELINE_SCENARIO_ID,
  newScenarioEntityId,
  validateScenarioDefinitions,
  type ScenarioTile,
} from "./scenarios";
import { defaultHouseholdConfig } from "./householdConfig";

describe("scenario definitions", () => {
  it("validateScenarioDefinitions reports no issues for a blank scenario", () => {
    const s = createBlankScenario({
      id: INITIAL_BASELINE_SCENARIO_ID,
      name: "Baseline",
      household: defaultHouseholdConfig,
    });
    const issues = validateScenarioDefinitions([s]);
    expect(issues).toEqual([]);
  });

  it("buildScenarioRunPlan normalizes start month and month span", () => {
    const s = createBlankScenario({
      id: "plan-test",
      name: "Plan test",
      household: defaultHouseholdConfig,
    });
    const plan = buildScenarioRunPlan({
      config: defaultHouseholdConfig,
      scenarioId: "plan-test",
      scenarios: [s],
    });
    expect(plan.projectionStartMonth).toBe(s.startDate.slice(0, 7));
    expect(plan.projectionMonths).toBe(
      getProjectionMonthSpan(s.startDate, s.endDate),
    );
    expect(plan.events.length).toBe(0);
  });

  it("validateScenarioDefinitions flags invalid custom_monthly amount", () => {
    const s = createBlankScenario({
      id: "custom-tile-test",
      name: "Custom tile test",
      household: defaultHouseholdConfig,
    });
    const badTile: ScenarioTile = {
      id: newScenarioEntityId("tile"),
      name: "Extra cost",
      category: "cost",
      validFrom: s.startDate.slice(0, 10),
      validTo: null,
      sourceKind: "custom_monthly",
      sourceRef: null,
      customMonthlyAmountSek: -50,
    };
    const issues = validateScenarioDefinitions([{ ...s, tiles: [...s.tiles, badTile] }]);
    expect(issues.some((i) => i.message.includes("non-negative custom amount"))).toBe(true);
  });
});
