import type { AdultProfile, EmploymentMode, HouseholdConfig } from "../../config/householdConfig";
import type { ScenarioEvent } from "../../config/scenarios";
import { calculateAkassa } from "./akassaCalculator";
import { calculateForaldrapenning } from "./foraldrapenningCalculator";

export interface MonthCashflowProjection {
  month: string;
  totalIncomeSek: number;
  totalFixedCostsSek: number;
  totalVariableCostsSek: number;
  netCashflowSek: number;
  /** Starting liquidity plus cumulative net up to and including this month (scenario runway path). */
  cumulativeLiquiditySek: number;
  appliedEventIds: string[];
}

/** Monthly add-ons to modeled income / variable “envelope” costs (SEK/mo), not persisted to household config. */
export interface ScenarioEntityAdjustments {
  adult1IncomeDeltaSek: number;
  adult1CostDeltaSek: number;
  adult2IncomeDeltaSek: number;
  adult2CostDeltaSek: number;
  companyIncomeDeltaSek: number;
}

export const ZERO_SCENARIO_ENTITY_ADJUSTMENTS: ScenarioEntityAdjustments = {
  adult1IncomeDeltaSek: 0,
  adult1CostDeltaSek: 0,
  adult2IncomeDeltaSek: 0,
  adult2CostDeltaSek: 0,
  companyIncomeDeltaSek: 0,
};

export const DEFAULT_SCENARIO_STARTING_LIQUIDITY_SEK = 220_000;

/**
 * Anchors are usually month-0 modeled values from Current Finances; user edits shift every month
 * by (edited − anchor) for income/loan interest, while recurring is a flat monthly add to variable costs.
 */
export interface ScenarioExplorationFromAnchors {
  loanInterestMonthlySek: number;
  loanInterestAnchorSek: number;
  incomeMonthlySek: number;
  incomeAnchorSek: number;
  recurringNetMonthlySek: number;
}

export interface ScenarioEngineInput {
  householdConfig: HouseholdConfig;
  events: ScenarioEvent[];
  projectionStartMonth: string;
  projectionMonths: number;
  entityAdjustments?: ScenarioEntityAdjustments;
  /** Buffer (SEK) before month 1; each row adds monthly net to this path. */
  startingLiquiditySek?: number;
  exploration?: ScenarioExplorationFromAnchors | null;
}

export interface ScenarioEngineResult {
  projections: MonthCashflowProjection[];
  summary: {
    cumulativeNetCashflowSek: number;
    lowestMonthlyNetCashflowSek: number;
    startingLiquiditySek: number;
    minCumulativeLiquiditySek: number;
    /** 1-based month index from projection start when liquidity first hits ≤ 0, or null if never. */
    monthsUntilDepleted: number | null;
    /**
     * Months the starting buffer would last if every month matched the worst projected net (burn only).
     * Null when worst month is not a loss.
     */
    worstMonthBurnRunwayMonths: number | null;
  };
}

/** When simulating unemployed + A-kassa without a stored membership duration, use this default. */
const DEFAULT_AKASSA_MEMBERSHIP_MONTHS = 14;

function cloneHouseholdConfig(config: HouseholdConfig): HouseholdConfig {
  return JSON.parse(JSON.stringify(config)) as HouseholdConfig;
}

function lastDayOfMonth(monthKeyYYYYMM: string): string {
  const [ys, ms] = monthKeyYYYYMM.split("-");
  const y = Number(ys);
  const m = Number(ms);
  const d = new Date(Date.UTC(y, m, 0));
  return d.toISOString().slice(0, 10);
}

function compareIsoDate(a: string, b: string): number {
  return a.localeCompare(b);
}

function addCalendarMonths(monthKeyYYYYMM: string, offset: number): string {
  const parts = monthKeyYYYYMM.split("-").map(Number);
  const ys = parts[0] ?? 1970;
  const ms = parts[1] ?? 1;
  const d = new Date(Date.UTC(ys, ms - 1 + offset, 1));
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

function sumFixedCostsFromConfig(c: HouseholdConfig): number {
  const f = c.monthlyFixedCosts;
  return (
    f.brfAvgiftSek +
    f.heatingSek +
    f.electricitySek +
    f.fundContributionJune80Sek +
    f.fundContributionJune40Sek
  );
}

export function sumLoanInterestMonthly(c: HouseholdConfig): number {
  return c.loans.reduce((sum, loan) => {
    return sum + (loan.principalSek * (loan.annualInterestRatePct / 100)) / 12;
  }, 0);
}

/** One month of modeled income, loan interest, non-loan fixed, and variable envelopes (before exploration shifts). */
export function computeScenarioMonthCore(
  householdConfig: HouseholdConfig,
  events: ScenarioEvent[],
  monthKeyYYYYMM: string,
  incomeAdjSek: number,
  variableAdjSek: number,
): {
  totalIncomeSek: number;
  loanInterestSek: number;
  nonLoanFixedSek: number;
  variableCostsSek: number;
} {
  const config = buildConfigAtEndOfMonth(householdConfig, events, monthKeyYYYYMM);
  return {
    totalIncomeSek: totalIncome(config) + incomeAdjSek,
    loanInterestSek: sumLoanInterestMonthly(config),
    nonLoanFixedSek: sumFixedCostsFromConfig(config),
    variableCostsSek: sumVariableCosts(config) + variableAdjSek,
  };
}

/** Month-0 anchors for exploration sliders (Current Finances–aligned scenario start). */
export function scenarioExplorationAnchorsFromMonth0(params: {
  householdConfig: HouseholdConfig;
  events: ScenarioEvent[];
  projectionStartMonth: string;
  entityAdjustments?: ScenarioEntityAdjustments;
}): { loanInterestAnchorSek: number; incomeAnchorSek: number } {
  const adj = params.entityAdjustments ?? ZERO_SCENARIO_ENTITY_ADJUSTMENTS;
  const incomeAdj =
    adj.adult1IncomeDeltaSek + adj.adult2IncomeDeltaSek + adj.companyIncomeDeltaSek;
  const variableAdj = adj.adult1CostDeltaSek + adj.adult2CostDeltaSek;
  const core = computeScenarioMonthCore(
    params.householdConfig,
    params.events,
    params.projectionStartMonth,
    incomeAdj,
    variableAdj,
  );
  return {
    loanInterestAnchorSek: core.loanInterestSek,
    incomeAnchorSek: core.totalIncomeSek,
  };
}

function sumVariableCosts(c: HouseholdConfig): number {
  const v = c.monthlyVariableCosts;
  return v.adult1HouseholdEnvelopeSek + v.adult2HouseholdEnvelopeSek;
}

function childrenBarnbidragMonthly(c: HouseholdConfig): number {
  return c.children.reduce((s, ch) => s + ch.monthlyBarnbidragSek, 0);
}

function estimateAdultMonthlyIncome(adult: AdultProfile): number {
  switch (adult.employmentMode) {
    case "employed":
    case "self_employed":
      return (adult.monthlyBruttoIncomeSek * adult.workingPercentage) / 100;
    case "studying":
      return (adult.monthlyBruttoIncomeSek * adult.workingPercentage) / 100;
    case "parental_leave": {
      const paidDays = Math.round((30 * adult.workingPercentage) / 100);
      return calculateForaldrapenning({
        annualSgiSek: adult.annualSgiSek,
        daysRequested: Math.max(0, paidDays),
      }).monthlyGrossSek;
    }
    case "unemployed": {
      if (!adult.isAkassaMember) return 0;
      return calculateAkassa({
        annualSgiSek: adult.annualSgiSek,
        membershipMonths: DEFAULT_AKASSA_MEMBERSHIP_MONTHS,
      }).monthlyGrossSek;
    }
    default:
      return 0;
  }
}

function totalIncome(c: HouseholdConfig): number {
  const adults = c.adults.reduce((s, a) => s + estimateAdultMonthlyIncome(a), 0);
  const company = Math.max(0, c.companyTypologyMonthlyEstimateSek);
  return adults + childrenBarnbidragMonthly(c) + company;
}

function applyEvent(config: HouseholdConfig, event: ScenarioEvent): void {
  const payload = event.payload as Record<string, unknown>;
  switch (event.type) {
    case "employment_change": {
      const adultId = payload.adultId as "adult1" | "adult2" | undefined;
      const adult = config.adults.find((a) => a.id === adultId);
      if (!adult) break;
      if (typeof payload.employmentMode === "string") {
        adult.employmentMode = payload.employmentMode as EmploymentMode;
      }
      if (typeof payload.workingPercentage === "number") {
        adult.workingPercentage = payload.workingPercentage;
      }
      break;
    }
    case "loan_change": {
      const loanId = payload.loanId as string | undefined;
      const loan = config.loans.find((l) => l.id === loanId);
      if (!loan) break;
      if (typeof payload.newPrincipalSek === "number") {
        loan.principalSek = Math.max(0, payload.newPrincipalSek);
      } else if (typeof payload.principalDeltaSek === "number") {
        loan.principalSek = Math.max(0, loan.principalSek + payload.principalDeltaSek);
      }
      break;
    }
    case "benefit_change": {
      const adultId = payload.adultId as "adult1" | "adult2" | undefined;
      const adult = config.adults.find((a) => a.id === adultId);
      if (!adult) break;

      const benefit = payload.benefit as string | undefined;
      const status = payload.status as string | undefined;

      if (benefit === "a_kassa" && status === "active") {
        adult.isAkassaMember = true;
        adult.employmentMode = "unemployed";
        if (adult.workingPercentage === 0) {
          adult.workingPercentage = 100;
        }
      }

      if (
        benefit === "foraldrapenning" &&
        status === "inactive" &&
        adult.employmentMode === "parental_leave"
      ) {
        adult.employmentMode = "unemployed";
        if (adult.workingPercentage === 0) {
          adult.workingPercentage = 100;
        }
      }
      break;
    }
    default:
      break;
  }
}

function buildConfigAtEndOfMonth(
  base: HouseholdConfig,
  events: ScenarioEvent[],
  monthKeyYYYYMM: string,
): HouseholdConfig {
  const cutoff = lastDayOfMonth(monthKeyYYYYMM);
  const relevant = events
    .filter((e) => compareIsoDate(e.effectiveDate.slice(0, 10), cutoff) <= 0)
    .sort((a, b) => {
      const dc = compareIsoDate(a.effectiveDate, b.effectiveDate);
      return dc !== 0 ? dc : a.id.localeCompare(b.id);
    });

  const config = cloneHouseholdConfig(base);
  for (const e of relevant) {
    applyEvent(config, e);
  }
  return config;
}

function eventIdsEffectiveInCalendarMonth(
  events: ScenarioEvent[],
  monthKeyYYYYMM: string,
): string[] {
  const start = `${monthKeyYYYYMM}-01`;
  const end = lastDayOfMonth(monthKeyYYYYMM);
  return events
    .filter((e) => {
      const d = e.effectiveDate.slice(0, 10);
      return compareIsoDate(d, start) >= 0 && compareIsoDate(d, end) <= 0;
    })
    .map((e) => e.id);
}

/**
 * Month-by-month cash flow: income (employment + benefits + barnbidrag) minus
 * fixed costs (incl. loan interest) and variable envelopes. Events are applied in
 * date order up to the last day of each month.
 */
export function runScenarioEngine(input: ScenarioEngineInput): ScenarioEngineResult {
  const projections: MonthCashflowProjection[] = [];
  let cumulative = 0;
  let lowest = Number.POSITIVE_INFINITY;
  const adj = input.entityAdjustments ?? ZERO_SCENARIO_ENTITY_ADJUSTMENTS;
  const starting =
    typeof input.startingLiquiditySek === "number" && Number.isFinite(input.startingLiquiditySek)
      ? input.startingLiquiditySek
      : DEFAULT_SCENARIO_STARTING_LIQUIDITY_SEK;

  const incomeAdj =
    adj.adult1IncomeDeltaSek +
    adj.adult2IncomeDeltaSek +
    adj.companyIncomeDeltaSek;
  const variableAdj = adj.adult1CostDeltaSek + adj.adult2CostDeltaSek;

  let cumulativeLiquidity = starting;
  let minLiquidity = starting;
  let monthsUntilDepleted: number | null = null;

  const exploration = input.exploration ?? null;

  for (let i = 0; i < input.projectionMonths; i++) {
    const monthKey = addCalendarMonths(input.projectionStartMonth, i);
    const core = computeScenarioMonthCore(
      input.householdConfig,
      input.events,
      monthKey,
      incomeAdj,
      variableAdj,
    );

    let totalIncomeSek = core.totalIncomeSek;
    let loanInterestEff = core.loanInterestSek;
    let totalVariableCostsSek = core.variableCostsSek;
    let totalFixedCostsSek = core.nonLoanFixedSek + loanInterestEff;

    if (exploration) {
      totalIncomeSek =
        core.totalIncomeSek + (exploration.incomeMonthlySek - exploration.incomeAnchorSek);
      loanInterestEff =
        core.loanInterestSek +
        (exploration.loanInterestMonthlySek - exploration.loanInterestAnchorSek);
      totalFixedCostsSek = core.nonLoanFixedSek + loanInterestEff;
      totalVariableCostsSek = core.variableCostsSek + exploration.recurringNetMonthlySek;
    }

    const netCashflowSek =
      totalIncomeSek - totalFixedCostsSek - totalVariableCostsSek;

    cumulative += netCashflowSek;
    cumulativeLiquidity += netCashflowSek;
    if (cumulativeLiquidity < minLiquidity) minLiquidity = cumulativeLiquidity;
    if (monthsUntilDepleted === null && cumulativeLiquidity <= 0) {
      monthsUntilDepleted = i + 1;
    }
    if (netCashflowSek < lowest) lowest = netCashflowSek;

    projections.push({
      month: monthKey,
      totalIncomeSek,
      totalFixedCostsSek,
      totalVariableCostsSek,
      netCashflowSek,
      cumulativeLiquiditySek: cumulativeLiquidity,
      appliedEventIds: eventIdsEffectiveInCalendarMonth(input.events, monthKey),
    });
  }

  const lowestNet = projections.length ? lowest : 0;
  const worstMonthBurnRunwayMonths =
    lowestNet < 0 && starting > 0
      ? Math.floor(starting / Math.abs(lowestNet))
      : null;

  return {
    projections,
    summary: {
      cumulativeNetCashflowSek: cumulative,
      lowestMonthlyNetCashflowSek: lowestNet,
      startingLiquiditySek: starting,
      minCumulativeLiquiditySek: projections.length ? minLiquidity : starting,
      monthsUntilDepleted,
      worstMonthBurnRunwayMonths,
    },
  };
}
