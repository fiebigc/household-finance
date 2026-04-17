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
  appliedEventIds: string[];
}

export interface ScenarioEngineInput {
  householdConfig: HouseholdConfig;
  events: ScenarioEvent[];
  projectionStartMonth: string;
  projectionMonths: number;
}

export interface ScenarioEngineResult {
  projections: MonthCashflowProjection[];
  summary: {
    cumulativeNetCashflowSek: number;
    lowestMonthlyNetCashflowSek: number;
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

function sumLoanInterestMonthly(c: HouseholdConfig): number {
  return c.loans.reduce((sum, loan) => {
    return sum + (loan.principalSek * (loan.annualInterestRatePct / 100)) / 12;
  }, 0);
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
  return adults + childrenBarnbidragMonthly(c);
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

  for (let i = 0; i < input.projectionMonths; i++) {
    const monthKey = addCalendarMonths(input.projectionStartMonth, i);
    const config = buildConfigAtEndOfMonth(
      input.householdConfig,
      input.events,
      monthKey,
    );

    const totalIncomeSek = totalIncome(config);
    const totalFixedCostsSek =
      sumFixedCostsFromConfig(config) + sumLoanInterestMonthly(config);
    const totalVariableCostsSek = sumVariableCosts(config);
    const netCashflowSek =
      totalIncomeSek - totalFixedCostsSek - totalVariableCostsSek;

    cumulative += netCashflowSek;
    if (netCashflowSek < lowest) lowest = netCashflowSek;

    projections.push({
      month: monthKey,
      totalIncomeSek,
      totalFixedCostsSek,
      totalVariableCostsSek,
      netCashflowSek,
      appliedEventIds: eventIdsEffectiveInCalendarMonth(input.events, monthKey),
    });
  }

  return {
    projections,
    summary: {
      cumulativeNetCashflowSek: cumulative,
      lowestMonthlyNetCashflowSek: projections.length ? lowest : 0,
    },
  };
}
