import type { EmploymentMode, HouseholdConfig } from "./householdConfig";

export type ScenarioId =
  | "LoanPayoff"
  | "StartaBusiness50Now"
  | "StartaBusiness100Later"
  | "ReturnToAkassa"
  | "WifeFullTime";

export type ScenarioEventType =
  | "employment_change"
  | "benefit_change"
  | "loan_change"
  | "cashflow_adjustment";

export interface ScenarioEvent {
  id: string;
  scenarioId: ScenarioId;
  effectiveDate: string;
  type: ScenarioEventType;
  description: string;
  payload: Record<string, unknown>;
}

export interface ScenarioDefinition {
  id: ScenarioId;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  transitionDateOverride?: string;
  assumptions: string[];
  events: ScenarioEvent[];
}

export interface EmploymentChangePayload {
  adultId: "adult1" | "adult2";
  employmentMode: EmploymentMode;
  workingPercentage: number;
}

export const scenarios: ScenarioDefinition[] = [
  {
    id: "LoanPayoff",
    name: "Pay Off Floating Loan 3",
    description:
      "Model immediate payoff of floating loan 3 and compare monthly interest savings against opportunity cost from alternative investment returns.",
    startDate: "2026-05-01",
    endDate: "2027-04-30",
    transitionDateOverride: "2026-08-15",
    assumptions: [
      "Loan 3 principal of 266500 SEK is paid in full at scenario start.",
      "Opportunity cost benchmark is a configurable blended portfolio return.",
    ],
    events: [
      {
        id: "loan3-payoff",
        scenarioId: "LoanPayoff",
        effectiveDate: "2026-05-01",
        type: "loan_change",
        description: "Loan 3 paid off immediately",
        payload: {
          loanId: "loan3",
          principalDeltaSek: -266500,
          newPrincipalSek: 0,
        },
      },
    ],
  },
  {
    id: "StartaBusiness50Now",
    name: "Adult 1 Starts Business at 50% on August 15",
    description:
      "Adult 1 starts self-employment at 50% on transition date and keeps 50% parental leave, modelling starta eget eligibility, A-kassa impact, and SGI effects.",
    startDate: "2026-06-01",
    endDate: "2027-05-31",
    transitionDateOverride: "2026-08-15",
    assumptions: [
      "Adult 1 transitions to mixed self-employment and parental leave on August 15.",
      "A-kassa protection and SGI continuity are evaluated by finance utilities.",
    ],
    events: [
      {
        id: "adult1-starta-eget-50",
        scenarioId: "StartaBusiness50Now",
        effectiveDate: "2026-08-15",
        type: "employment_change",
        description: "Adult 1 moves to 50% self-employed and 50% parental leave",
        payload: {
          adultId: "adult1",
          employmentMode: "self_employed",
          workingPercentage: 50,
          parentalLeavePercentage: 50,
        } satisfies EmploymentChangePayload & { parentalLeavePercentage: number },
      },
    ],
  },
  {
    id: "StartaBusiness100Later",
    name: "Adult 1 A-kassa Then Full-Time Business",
    description:
      "Adult 1 enters A-kassa in August and starts full-time business after a qualifying period with full starta eget support.",
    startDate: "2026-06-01",
    endDate: "2027-08-31",
    transitionDateOverride: "2026-08-15",
    assumptions: [
      "Adult 1 goes to A-kassa status in August before business launch.",
      "Full starta eget support begins only after qualifying period is met.",
    ],
    events: [
      {
        id: "adult1-akassa-start",
        scenarioId: "StartaBusiness100Later",
        effectiveDate: "2026-08-15",
        type: "benefit_change",
        description: "Adult 1 starts A-kassa period",
        payload: {
          adultId: "adult1",
          benefit: "a_kassa",
          status: "active",
        },
      },
      {
        id: "adult1-business-100",
        scenarioId: "StartaBusiness100Later",
        effectiveDate: "2026-11-15",
        type: "employment_change",
        description:
          "Adult 1 starts business at 100% with full starta eget bidrag",
        payload: {
          adultId: "adult1",
          employmentMode: "self_employed",
          workingPercentage: 100,
          startaEgetBidrag: "full",
        } satisfies EmploymentChangePayload & { startaEgetBidrag: string },
      },
    ],
  },
  {
    id: "ReturnToAkassa",
    name: "Parental Leave to A-kassa on August 15",
    description:
      "Adult 1 transitions from parental leave to A-kassa on August 15 to evaluate payment timing mismatch and cash flow gap risk.",
    startDate: "2026-06-01",
    endDate: "2027-01-31",
    transitionDateOverride: "2026-08-15",
    assumptions: [
      "Last foraldrapenning and first A-kassa payment dates can be offset.",
      "Scenario highlights liquidity buffer requirements during transition.",
    ],
    events: [
      {
        id: "adult1-parental-stop",
        scenarioId: "ReturnToAkassa",
        effectiveDate: "2026-08-15",
        type: "benefit_change",
        description: "Adult 1 parental leave benefit ends",
        payload: {
          adultId: "adult1",
          benefit: "foraldrapenning",
          status: "inactive",
        },
      },
      {
        id: "adult1-akassa-start-gap",
        scenarioId: "ReturnToAkassa",
        effectiveDate: "2026-08-20",
        type: "benefit_change",
        description: "Adult 1 A-kassa starts after waiting period",
        payload: {
          adultId: "adult1",
          benefit: "a_kassa",
          status: "active",
        },
      },
    ],
  },
  {
    id: "WifeFullTime",
    name: "Adult 2 from 80% to 100%",
    description:
      "Model adult 2 moving from 80% to 100% now or on August 15 and track net household income delta after tax.",
    startDate: "2026-05-01",
    endDate: "2027-04-30",
    transitionDateOverride: "2026-08-15",
    assumptions: [
      "Current base profile starts at 80% employment for adult 2.",
      "Tax delta and net uplift are calculated by Swedish finance utilities.",
    ],
    events: [
      {
        id: "adult2-fulltime-now",
        scenarioId: "WifeFullTime",
        effectiveDate: "2026-05-01",
        type: "employment_change",
        description: "Adult 2 goes full-time immediately",
        payload: {
          adultId: "adult2",
          employmentMode: "employed",
          workingPercentage: 100,
          variant: "now",
        } satisfies EmploymentChangePayload & { variant: string },
      },
      {
        id: "adult2-fulltime-transition",
        scenarioId: "WifeFullTime",
        effectiveDate: "2026-08-15",
        type: "employment_change",
        description: "Adult 2 goes full-time on transition date",
        payload: {
          adultId: "adult2",
          employmentMode: "employed",
          workingPercentage: 100,
          variant: "august_15",
        } satisfies EmploymentChangePayload & { variant: string },
      },
    ],
  },
];

export function getScenarioById(
  scenarioId: ScenarioId,
): ScenarioDefinition | undefined {
  return scenarios.find((scenario) => scenario.id === scenarioId);
}

export function buildScenarioInput(
  config: HouseholdConfig,
  scenarioId: ScenarioId,
): { config: HouseholdConfig; scenario: ScenarioDefinition } {
  const scenario = getScenarioById(scenarioId);
  if (!scenario) {
    throw new Error(`Unknown scenario id: ${scenarioId}`);
  }

  return { config, scenario };
}

export interface ScenarioValidationIssue {
  scenarioId: ScenarioId;
  eventId?: string;
  message: string;
}

function isoDateToMonthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

/**
 * Inclusive month span between two ISO dates represented as YYYY-MM.
 */
export function getProjectionMonthSpan(
  startDateIso: string,
  endDateIso: string,
): number {
  const startParts = startDateIso.slice(0, 7).split("-").map(Number);
  const endParts = endDateIso.slice(0, 7).split("-").map(Number);
  const sy = startParts[0] ?? 0;
  const sm = startParts[1] ?? 1;
  const ey = endParts[0] ?? 0;
  const em = endParts[1] ?? 1;
  return (ey - sy) * 12 + (em - sm) + 1;
}

/**
 * Validates scenario event consistency and basic date bounds.
 */
export function validateScenarioDefinitions(
  scenarioList: ScenarioDefinition[],
): ScenarioValidationIssue[] {
  const issues: ScenarioValidationIssue[] = [];

  for (const scenario of scenarioList) {
    if (scenario.endDate < scenario.startDate) {
      issues.push({
        scenarioId: scenario.id,
        message: "endDate must be on or after startDate.",
      });
    }

    if (!scenario.assumptions.length) {
      issues.push({
        scenarioId: scenario.id,
        message: "At least one assumption is required.",
      });
    }

    for (const event of scenario.events) {
      if (event.scenarioId !== scenario.id) {
        issues.push({
          scenarioId: scenario.id,
          eventId: event.id,
          message: "Event scenarioId must match parent scenario id.",
        });
      }
      if (event.effectiveDate < scenario.startDate || event.effectiveDate > scenario.endDate) {
        issues.push({
          scenarioId: scenario.id,
          eventId: event.id,
          message: "Event effectiveDate must be within scenario start/end date bounds.",
        });
      }
      if (!event.description.trim()) {
        issues.push({
          scenarioId: scenario.id,
          eventId: event.id,
          message: "Event description must not be empty.",
        });
      }
    }
  }

  return issues;
}

export interface ScenarioRunInput {
  config: HouseholdConfig;
  scenarioId: ScenarioId;
}

export interface ScenarioRunPlan {
  scenario: ScenarioDefinition;
  projectionStartMonth: string;
  projectionMonths: number;
  events: ScenarioEvent[];
}

/**
 * Builds a normalized run plan that can be passed directly to the scenario engine.
 */
export function buildScenarioRunPlan(input: ScenarioRunInput): ScenarioRunPlan {
  const scenario = getScenarioById(input.scenarioId);
  if (!scenario) {
    throw new Error(`Unknown scenario id: ${input.scenarioId}`);
  }

  return {
    scenario,
    projectionStartMonth: isoDateToMonthKey(scenario.startDate),
    projectionMonths: getProjectionMonthSpan(scenario.startDate, scenario.endDate),
    events: scenario.events,
  };
}
