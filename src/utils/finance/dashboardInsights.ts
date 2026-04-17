import type { HouseholdConfig } from "../../config/householdConfig";
import type { RecurringKind } from "../../data/bankData";
import type { MonthCashflowProjection } from "./scenarioEngine";
import { runScenarioEngine } from "./scenarioEngine";

export type InsightSeverity = "info" | "warning" | "critical";

export interface DashboardInsight {
  id: string;
  severity: InsightSeverity;
  title: string;
  detail: string;
  suggestion: string;
}

export function recurringNetOutflowSek(
  items: { amountSek: number; kind: RecurringKind }[],
): number {
  return items.reduce(
    (s, c) => s + (c.kind === "expense" ? c.amountSek : -c.amountSek),
    0,
  );
}

export interface DashboardInsightsInput {
  householdConfig: HouseholdConfig;
  /** Net cash impact of recurring list: expenses minus incomes (both stored as positive magnitudes). */
  recurringCostsMonthlySek: number;
  recurringItems: { id: string; label: string; amountSek: number; kind: RecurringKind }[];
  /** Optional: worst month from an active scenario projection (can be negative). */
  scenarioLowestMonthlyNetSek: number | null;
  /** Sum of non-loan account balances for a simple liquidity runway. */
  liquidBalancesSek: number;
}

export interface DashboardInsightsResult {
  baselineMonth: MonthCashflowProjection;
  recurringCostsMonthlySek: number;
  netAfterRecurringSek: number;
  /** Rough months of liquid balances at the current net-after-recurring pace. */
  runwayMonths: number;
  /** 0–100, higher is healthier. */
  healthScore: number;
  healthLabel: string;
  insights: DashboardInsight[];
}

const RECURRING_SHARE_OF_INCOME_WARN = 0.22;
const RECURRING_SHARE_OF_INCOME_CRITICAL = 0.32;
const LTV_WARN = 0.75;
const LTV_CRITICAL = 0.85;
const ENVELOPE_SHARE_WARN = 0.28;

export function estimateLiquidityRunwayMonths(
  liquidBalancesSek: number,
  monthlyNetAfterRecurringSek: number,
): number {
  if (monthlyNetAfterRecurringSek <= 0) return 0;
  return Math.max(0, Math.round(liquidBalancesSek / monthlyNetAfterRecurringSek));
}

export function baselineHouseholdMonth(
  householdConfig: HouseholdConfig,
): MonthCashflowProjection | null {
  const projectionStartMonth = householdConfig.transitionDate.slice(0, 7);
  const result = runScenarioEngine({
    householdConfig,
    events: [],
    projectionStartMonth,
    projectionMonths: 1,
  });
  return result.projections[0] ?? null;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function computeFinancialHealthScore(params: {
  incomeSek: number;
  netAfterRecurringSek: number;
  ltvRatio: number;
  scenarioLowestNet: number | null;
}): { score: number; label: string } {
  const { incomeSek, netAfterRecurringSek, ltvRatio, scenarioLowestNet } = params;
  const margin = incomeSek > 0 ? netAfterRecurringSek / incomeSek : netAfterRecurringSek >= 0 ? 0.5 : -0.5;

  let score = 42 + margin * 95;
  if (ltvRatio >= LTV_CRITICAL) score -= 22;
  else if (ltvRatio >= LTV_WARN) score -= 10;

  if (scenarioLowestNet !== null && scenarioLowestNet < 0) {
    score -= 12;
  }

  score = clamp(Math.round(score), 0, 100);

  let label = "Balanced";
  if (score >= 72) label = "Comfortable";
  else if (score >= 55) label = "Manageable";
  else if (score >= 38) label = "Tight";
  else label = "Stressed";

  return { score, label };
}

export function buildDashboardInsights(input: DashboardInsightsInput): DashboardInsightsResult {
  const baselineMonth = baselineHouseholdMonth(input.householdConfig);
  if (!baselineMonth) {
    return {
      baselineMonth: {
        month: "",
        totalIncomeSek: 0,
        totalFixedCostsSek: 0,
        totalVariableCostsSek: 0,
        netCashflowSek: 0,
        appliedEventIds: [],
      },
      recurringCostsMonthlySek: input.recurringCostsMonthlySek,
      netAfterRecurringSek: 0,
      runwayMonths: 0,
      healthScore: 0,
      healthLabel: "Unknown",
      insights: [
        {
          id: "no-baseline",
          severity: "warning",
          title: "Could not compute baseline month",
          detail: "Check that the transition date is set to a valid calendar month.",
          suggestion: "Open Account Settings and set a valid transition date (YYYY-MM-DD).",
        },
      ],
    };
  }

  const recurringCostsMonthlySek = input.recurringCostsMonthlySek;
  const netAfterRecurringSek =
    baselineMonth.netCashflowSek - recurringCostsMonthlySek;

  const runwayMonths = estimateLiquidityRunwayMonths(
    input.liquidBalancesSek,
    netAfterRecurringSek,
  );

  const totalLoanPrincipalSek = input.householdConfig.loans.reduce(
    (s, l) => s + l.principalSek,
    0,
  );
  const ltvRatio =
    input.householdConfig.house.currentEstimatedValueSek > 0
      ? totalLoanPrincipalSek / input.householdConfig.house.currentEstimatedValueSek
      : 0;

  const envelopeTotal =
    input.householdConfig.monthlyVariableCosts.adult1HouseholdEnvelopeSek +
    input.householdConfig.monthlyVariableCosts.adult2HouseholdEnvelopeSek;

  const { score: healthScore, label: healthLabel } = computeFinancialHealthScore({
    incomeSek: baselineMonth.totalIncomeSek,
    netAfterRecurringSek,
    ltvRatio,
    scenarioLowestNet: input.scenarioLowestMonthlyNetSek,
  });

  const insights: DashboardInsight[] = [];
  const income = baselineMonth.totalIncomeSek;

  if (netAfterRecurringSek < 0) {
    insights.push({
      id: "negative-after-recurring",
      severity: "critical",
      title: "Cash flow turns negative with recurring bills",
      detail: `After modeled income and household costs, the net of recurring bank lines (outflows minus inflows) is about ${Math.round(
        recurringCostsMonthlySek,
      ).toLocaleString("sv-SE")} SEK/month, which pushes the margin negative.`,
      suggestion:
        "Rank recurring costs by size and cut or renegotiate the top items first; if income is understated, update employment modes and SGI in settings.",
    });
  } else if (netAfterRecurringSek < income * 0.05 && income > 0) {
    insights.push({
      id: "thin-margin",
      severity: "warning",
      title: "Very thin monthly margin",
      detail: "Less than about 5% of modeled income remains after recurring items.",
      suggestion:
        "Treat this as a planning floor: delay new recurring commitments until the margin improves.",
    });
  }

  if (ltvRatio >= LTV_CRITICAL) {
    insights.push({
      id: "ltv-high",
      severity: "critical",
      title: "Loan-to-value is very high",
      detail: `LTV is about ${(ltvRatio * 100).toFixed(1)}% using current home value and loan principals.`,
      suggestion:
        "Prioritize amortization on the highest-rate tranche when surplus allows; avoid increasing secured debt until LTV improves.",
    });
  } else if (ltvRatio >= LTV_WARN) {
    insights.push({
      id: "ltv-elevated",
      severity: "warning",
      title: "Elevated leverage on the home",
      detail: `LTV is around ${(ltvRatio * 100).toFixed(1)}%, which leaves less buffer if prices or rates move.`,
      suggestion: "Keep a larger liquidity buffer and review interest rate risk on floating tranches.",
    });
  }

  const expenseOnly = input.recurringItems.filter((i) => i.kind === "expense");
  const sortedRecurring = [...expenseOnly].sort((a, b) => b.amountSek - a.amountSek);
  const top = sortedRecurring[0];
  if (top && income > 0) {
    const share = top.amountSek / income;
    if (share >= RECURRING_SHARE_OF_INCOME_CRITICAL) {
      insights.push({
        id: "dominant-recurring",
        severity: "critical",
        title: "One recurring cost dominates income",
        detail: `"${top.label}" is about ${(share * 100).toFixed(0)}% of modeled monthly income.`,
        suggestion:
          "Verify the amount, check if it can be refinanced or reduced, and model a lower amount in recurring costs to see the cash-flow effect.",
      });
    } else if (share >= RECURRING_SHARE_OF_INCOME_WARN) {
      insights.push({
        id: "heavy-recurring",
        severity: "warning",
        title: "Large recurring line item",
        detail: `"${top.label}" is a significant share of monthly income.`,
        suggestion: "Revisit contracts and payment frequency; even a small reduction helps the monthly barometer.",
      });
    }
  }

  if (income > 0 && envelopeTotal / income >= ENVELOPE_SHARE_WARN) {
    insights.push({
      id: "envelopes-large",
      severity: "info",
      title: "Household envelopes are a large share of income",
      detail: "Combined adult envelope budgets are high relative to modeled income.",
      suggestion: "Track actual spending vs envelope; if consistently lower, reallocate to savings or debt.",
    });
  }

  if (
    input.scenarioLowestMonthlyNetSek !== null &&
    input.scenarioLowestMonthlyNetSek < 0
  ) {
    insights.push({
      id: "scenario-dip",
      severity: "warning",
      title: "Selected scenario dips below zero in at least one month",
      detail: `Worst projected month is about ${Math.round(input.scenarioLowestMonthlyNetSek).toLocaleString("sv-SE")} SEK.`,
      suggestion:
        "Review scenario events and dates, or increase buffer targets before taking on new obligations.",
    });
  }

  insights.sort((a, b) => {
    const rank = (s: InsightSeverity) =>
      s === "critical" ? 0 : s === "warning" ? 1 : 2;
    return rank(a.severity) - rank(b.severity) || a.title.localeCompare(b.title);
  });

  return {
    baselineMonth,
    recurringCostsMonthlySek,
    netAfterRecurringSek,
    runwayMonths,
    healthScore,
    healthLabel,
    insights,
  };
}
