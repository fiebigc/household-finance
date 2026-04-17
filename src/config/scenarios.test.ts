import { describe, expect, it } from "vitest";
import {
  buildScenarioRunPlan,
  getProjectionMonthSpan,
  scenarios,
  validateScenarioDefinitions,
} from "./scenarios";
import { defaultHouseholdConfig } from "./householdConfig";

describe("scenario definitions", () => {
  it("validateScenarioDefinitions reports no issues for canonical scenarios", () => {
    const issues = validateScenarioDefinitions(scenarios);
    expect(issues).toEqual([]);
  });

  it("buildScenarioRunPlan normalizes start month and month span", () => {
    const plan = buildScenarioRunPlan({
      config: defaultHouseholdConfig,
      scenarioId: "StartaBusiness100Later",
    });
    expect(plan.projectionStartMonth).toBe("2026-06");
    expect(plan.projectionMonths).toBe(
      getProjectionMonthSpan("2026-06-01", "2027-08-31"),
    );
    expect(plan.events.length).toBeGreaterThan(0);
  });
});
