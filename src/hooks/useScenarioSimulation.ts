import { useCallback, useEffect, useMemo, useState } from "react";
import type { HouseholdConfig } from "../config/householdConfig";
import {
  buildScenarioRunPlan,
  type ScenarioDefinition,
} from "../config/scenarios";
import {
  DEFAULT_SCENARIO_STARTING_LIQUIDITY_SEK,
  runScenarioEngine,
  scenarioExplorationAnchorsFromMonth0,
  type ScenarioExplorationFromAnchors,
} from "../utils/finance/scenarioEngine";

export interface ExpenseSimulationInput {
  amountSek: number;
  type: "one_off" | "recurring";
}

export interface UseScenarioSimulationCfInput {
  /** Net recurring outflow from Current Finances list (same as dashboard). */
  recurringNetMonthlySek: number;
  /** Sum of non-loan account balances from Current Finances (starting liquidity path). */
  liquidBalancesSek: number;
}

const BUFFER_MIN_AMOUNT_SEK = 100_000;
const BUFFER_ABSOLUTE_FLOOR_SEK = 50_000;

export function useScenarioSimulation(
  householdConfig: HouseholdConfig,
  cf: UseScenarioSimulationCfInput,
  scenarioList: ScenarioDefinition[],
  selectedScenarioId: string,
) {
  const [expenseInput, setExpenseInput] = useState<ExpenseSimulationInput>({
    amountSek: 0,
    type: "one_off",
  });

  const resolvedScenarioId = useMemo(() => {
    if (scenarioList.some((s) => s.id === selectedScenarioId)) {
      return selectedScenarioId;
    }
    return scenarioList[0]?.id ?? selectedScenarioId;
  }, [scenarioList, selectedScenarioId]);

  const activeScenario = useMemo(
    () => scenarioList.find((s) => s.id === resolvedScenarioId) ?? scenarioList[0],
    [scenarioList, resolvedScenarioId],
  );

  /** Drifts from Current Finances / month-0 anchors (reset when those baselines change). */
  const [loanDriftSek, setLoanDriftSek] = useState(0);
  const [incomeDriftSek, setIncomeDriftSek] = useState(0);
  const [recurringDriftSek, setRecurringDriftSek] = useState(0);

  const runPlan = useMemo(() => {
    if (!scenarioList.length || !activeScenario) {
      throw new Error("useScenarioSimulation requires at least one scenario.");
    }
    return buildScenarioRunPlan({
      config: householdConfig,
      scenarioId: activeScenario.id,
      scenarios: scenarioList,
    });
  }, [householdConfig, activeScenario, scenarioList]);

  const anchors = useMemo(
    () =>
      scenarioExplorationAnchorsFromMonth0({
        householdConfig,
        events: runPlan.events,
        projectionStartMonth: runPlan.projectionStartMonth,
      }),
    [householdConfig, runPlan.events, runPlan.projectionStartMonth],
  );

  useEffect(() => {
    setLoanDriftSek(0);
    setIncomeDriftSek(0);
    setRecurringDriftSek(0);
  }, [
    anchors.loanInterestAnchorSek,
    anchors.incomeAnchorSek,
    cf.recurringNetMonthlySek,
    resolvedScenarioId,
    runPlan.projectionStartMonth,
  ]);

  const loanInterestMonthlySek = anchors.loanInterestAnchorSek + loanDriftSek;
  const incomeMonthlySek = anchors.incomeAnchorSek + incomeDriftSek;
  const recurringNetMonthlySek = cf.recurringNetMonthlySek + recurringDriftSek;

  const exploration: ScenarioExplorationFromAnchors = useMemo(
    () => ({
      loanInterestMonthlySek,
      loanInterestAnchorSek: anchors.loanInterestAnchorSek,
      incomeMonthlySek,
      incomeAnchorSek: anchors.incomeAnchorSek,
      recurringNetMonthlySek,
    }),
    [
      anchors.incomeAnchorSek,
      anchors.loanInterestAnchorSek,
      incomeMonthlySek,
      loanInterestMonthlySek,
      recurringNetMonthlySek,
    ],
  );

  const startingLiquiditySek =
    typeof cf.liquidBalancesSek === "number" && Number.isFinite(cf.liquidBalancesSek)
      ? Math.max(0, cf.liquidBalancesSek)
      : DEFAULT_SCENARIO_STARTING_LIQUIDITY_SEK;

  const engineResult = useMemo(
    () =>
      runScenarioEngine({
        householdConfig,
        events: runPlan.events,
        projectionStartMonth: runPlan.projectionStartMonth,
        projectionMonths: runPlan.projectionMonths,
        entityAdjustments: undefined,
        startingLiquiditySek,
        exploration,
      }),
    [householdConfig, runPlan, startingLiquiditySek, exploration],
  );

  const currentMonthlyNetSek = engineResult.projections[0]?.netCashflowSek ?? 0;
  const recurringExpenseImpact =
    expenseInput.type === "recurring" ? expenseInput.amountSek : 0;

  const adjustedMonthlyNetSek = currentMonthlyNetSek - recurringExpenseImpact;

  const oneOffBufferAfterSek =
    expenseInput.type === "one_off"
      ? startingLiquiditySek - expenseInput.amountSek
      : startingLiquiditySek;

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

  const resetScenarioExploration = useCallback(() => {
    setLoanDriftSek(0);
    setIncomeDriftSek(0);
    setRecurringDriftSek(0);
  }, []);

  const setLoanInterestMonthlySek = useCallback(
    (v: number) => setLoanDriftSek(v - anchors.loanInterestAnchorSek),
    [anchors.loanInterestAnchorSek],
  );
  const setIncomeMonthlySek = useCallback(
    (v: number) => setIncomeDriftSek(v - anchors.incomeAnchorSek),
    [anchors.incomeAnchorSek],
  );
  const setRecurringNetMonthlySek = useCallback(
    (v: number) => setRecurringDriftSek(v - cf.recurringNetMonthlySek),
    [cf.recurringNetMonthlySek],
  );

  const summary = useMemo(
    () => ({
      currentMonthlyNetSek,
      adjustedMonthlyNetSek,
      cumulativeNetCashflowSek: engineResult.summary.cumulativeNetCashflowSek,
      lowestMonthlyNetCashflowSek: engineResult.summary.lowestMonthlyNetCashflowSek,
      initialBufferSek: startingLiquiditySek,
      bufferMinAmountSek: BUFFER_MIN_AMOUNT_SEK,
      bufferAbsoluteFloorSek: BUFFER_ABSOLUTE_FLOOR_SEK,
      oneOffBufferAfterSek,
      affordable,
      blockingReason,
      startingLiquiditySek: engineResult.summary.startingLiquiditySek,
      minCumulativeLiquiditySek: engineResult.summary.minCumulativeLiquiditySek,
      monthsUntilDepleted: engineResult.summary.monthsUntilDepleted,
      worstMonthBurnRunwayMonths: engineResult.summary.worstMonthBurnRunwayMonths,
    }),
    [
      affordable,
      adjustedMonthlyNetSek,
      blockingReason,
      currentMonthlyNetSek,
      engineResult.summary,
      oneOffBufferAfterSek,
      startingLiquiditySek,
    ],
  );

  return {
    resolvedScenarioId,
    activeScenario,
    runPlan,
    engineResult,
    expenseInput,
    setExpenseInput,
    explorationAnchors: anchors,
    loanInterestMonthlySek,
    setLoanInterestMonthlySek,
    incomeMonthlySek,
    setIncomeMonthlySek,
    recurringNetMonthlySek,
    setRecurringNetMonthlySek,
    cfRecurringBaselineSek: cf.recurringNetMonthlySek,
    resetScenarioExploration,
    summary,
  };
}
