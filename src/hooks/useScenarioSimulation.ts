import { useMemo, useState } from "react";
import type { HouseholdConfig } from "../config/householdConfig";
import {
  buildScenarioRunPlan,
  type ScenarioId,
  scenarios,
} from "../config/scenarios";
import { runScenarioEngine } from "../utils/finance/scenarioEngine";

export interface ExpenseSimulationInput {
  amountSek: number;
  type: "one_off" | "recurring";
}

const BUFFER_MIN_AMOUNT_SEK = 100_000;
const BUFFER_ABSOLUTE_FLOOR_SEK = 50_000;
const INITIAL_BUFFER_SEK = 220_000;

export function useScenarioSimulation(householdConfig: HouseholdConfig) {
  const [selectedScenarioId, setSelectedScenarioId] =
    useState<ScenarioId>("LoanPayoff");
  const [expenseInput, setExpenseInput] = useState<ExpenseSimulationInput>({
    amountSek: 0,
    type: "one_off",
  });

  const runPlan = useMemo(
    () =>
      buildScenarioRunPlan({
        config: householdConfig,
        scenarioId: selectedScenarioId,
      }),
    [householdConfig, selectedScenarioId],
  );

  const engineResult = useMemo(
    () =>
      runScenarioEngine({
        householdConfig,
        events: runPlan.events,
        projectionStartMonth: runPlan.projectionStartMonth,
        projectionMonths: runPlan.projectionMonths,
      }),
    [householdConfig, runPlan],
  );

  const currentMonthlyNetSek = engineResult.projections[0]?.netCashflowSek ?? 0;
  const recurringExpenseImpact =
    expenseInput.type === "recurring" ? expenseInput.amountSek : 0;

  const adjustedMonthlyNetSek = currentMonthlyNetSek - recurringExpenseImpact;

  const oneOffBufferAfterSek =
    expenseInput.type === "one_off"
      ? INITIAL_BUFFER_SEK - expenseInput.amountSek
      : INITIAL_BUFFER_SEK;

  const affordable =
    oneOffBufferAfterSek >= BUFFER_MIN_AMOUNT_SEK &&
    oneOffBufferAfterSek >= BUFFER_ABSOLUTE_FLOOR_SEK &&
    adjustedMonthlyNetSek >= 0;

  const blockingReason = !affordable
    ? oneOffBufferAfterSek < BUFFER_ABSOLUTE_FLOOR_SEK
      ? "Would breach absolute buffer floor."
      : oneOffBufferAfterSek < BUFFER_MIN_AMOUNT_SEK
        ? "Would push buffer below minimum planning threshold."
        : "Recurring monthly cash flow turns negative."
    : "No constraint is broken under current assumptions.";

  return {
    scenarios,
    selectedScenarioId,
    setSelectedScenarioId,
    runPlan,
    engineResult,
    expenseInput,
    setExpenseInput,
    summary: {
      currentMonthlyNetSek,
      adjustedMonthlyNetSek,
      cumulativeNetCashflowSek: engineResult.summary.cumulativeNetCashflowSek,
      lowestMonthlyNetCashflowSek: engineResult.summary.lowestMonthlyNetCashflowSek,
      initialBufferSek: INITIAL_BUFFER_SEK,
      bufferMinAmountSek: BUFFER_MIN_AMOUNT_SEK,
      bufferAbsoluteFloorSek: BUFFER_ABSOLUTE_FLOOR_SEK,
      oneOffBufferAfterSek,
      affordable,
      blockingReason,
    },
  };
}
