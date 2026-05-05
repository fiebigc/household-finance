import type {
  Entity,
  Account,
  Cashflow,
  Period,
  PeriodDayOverride,
  Loan,
  TaxProfile,
  Benefit,
} from "@/types/schema";
import { accountVisibleForEntity } from "@/utils/accountShared";
import type { MonthlyProjection, HouseholdProjection } from "@/types/engine";
import { countWeekdays } from "./scheduling";
import { startOfMonth, endOfMonth, addMonths, format } from "date-fns";
import {
  resolveDefaultEstimatedWithholdingFraction,
  type HouseholdTaxLocationInput,
} from "@/utils/locationIncomeTaxDefaults";
import {
  getSwedenCityTaxProfile,
  swedenEffectiveBenefitTax,
  type SwedenCityTaxProfile,
} from "@/utils/swedenIncomeTax";
import { estimatedForaldrapenningDailySek } from "@/utils/swedenInsuranceBenefits";
import { resolveEntityAnnualSgiForBenefits } from "@/utils/swedenSgi";
import {
  aggregateBenefitGauge,
  computeUnemploymentBenefitGrossForMonth,
  getUnemploymentBenefitsForAdult,
} from "@/utils/unemploymentBenefits";
import { cashflowContributesToPnLTotals } from "@/utils/cashflowAccounts";
import { cashflowIncomeInternalHideFromFlow } from "@/utils/cashflowIncomeVisibility";
import { employmentIncomeCountsInProjectionMonth } from "@/utils/cashflowEmployment";
import { cashflowMonthlyAmount, resolveActivePeriodForMonth } from "@/utils/incomeCashflowMonth";
import { employmentNetFromScaledGross } from "@/utils/incomeCashflowDisplayed";

const SALARY_FREELANCE_FOR_UNEMPLOYMENT = new Set<Cashflow["category"]>(["salary", "freelance"]);

/** Salary/freelance gross counted like the projection income loop — used to infer unemployment months when calendar still says employed but employment windows ended. */
function countableSalaryFreelanceScaledForMonth(
  entityCashflows: Cashflow[],
  accounts: Account[],
  monthStart: Date,
  monthEnd: Date,
  onLeave: boolean,
  fte: number,
): number {
  let sum = 0;
  for (const cf of entityCashflows) {
    if (cf.direction !== "income") continue;
    if (!SALARY_FREELANCE_FOR_UNEMPLOYMENT.has(cf.category)) continue;
    const monthlyAmt = cashflowMonthlyAmount(cf, monthStart, monthEnd);
    if (monthlyAmt === 0) continue;
    if (!cashflowContributesToPnLTotals(cf, accounts)) continue;
    if (cashflowIncomeInternalHideFromFlow(cf)) continue;
    if (!employmentIncomeCountsInProjectionMonth(cf, monthStart)) continue;
    const scaled = monthlyAmt * fte;
    if (onLeave) {
      if (scaled > 0) sum += scaled;
    } else {
      sum += scaled;
    }
  }
  return sum;
}

export interface ProjectionInput {
  entities: Entity[];
  accounts: Account[];
  cashflows: Cashflow[];
  periods: Period[];
  dayOverrides: PeriodDayOverride[];
  loans: Loan[];
  benefits: Benefit[];
  taxProfiles: TaxProfile[];
  startMonth: Date;
  months: number;
  householdLocation?: HouseholdTaxLocationInput | null;
}

const SALARY_CATEGORIES = new Set(["salary", "freelance", "dividend"]);
const LEAVE_PERIOD_TYPES = new Set(["parental_leave", "sick_leave", "unemployed"]);

/**
 * Compute net for benefit income (parental leave, sickness, unemployment).
 */
function taxBenefitIncome(
  gross: number,
  seTax: SwedenCityTaxProfile | null,
  fallbackFraction: number,
): number {
  if (seTax) {
    return gross - swedenEffectiveBenefitTax(gross, seTax);
  }
  return gross * (1 - fallbackFraction);
}

export function computeProjection(input: ProjectionInput): HouseholdProjection {
  const {
    entities,
    accounts,
    cashflows,
    periods,
    dayOverrides,
    loans,
    benefits,
    taxProfiles,
    startMonth,
    months: numMonths,
    householdLocation,
  } = input;

  const loc = householdLocation ?? { country: null, city: null };
  const fallbackFraction = resolveDefaultEstimatedWithholdingFraction(loc);
  const isSE = loc.country?.toUpperCase() === "SE";
  const seTax = isSE ? getSwedenCityTaxProfile(loc.city ?? null) : null;

  const allMonths: MonthlyProjection[] = [];
  let cumulativeSurplus = 0;
  /** Extra compensated benefit days consumed during this projection window (per entity + program). */
  const unemploymentProjConsumed = new Map<string, number>();

  for (let m = 0; m < numMonths; m++) {
    const monthStart = startOfMonth(addMonths(startMonth, m));
    const monthEnd = endOfMonth(monthStart);
    const monthStr = format(monthStart, "yyyy-MM");
    const weekdaysInMonth = countWeekdays(monthStart, monthEnd);

    for (const entity of entities) {
      const entityPeriods = periods.filter(p => p.entity_id === entity.id);
      const entityCashflows = cashflows.filter(c => c.entity_id === entity.id);
      const entityBenefits = benefits.filter(b => b.entity_id === entity.id);
      const taxProfile = taxProfiles.find(tp => tp.entity_id === entity.id);

      const { period: activePeriod, fte } = resolveActivePeriodForMonth(
        entityPeriods, dayOverrides, monthStart, monthEnd,
      );

      const onLeave = activePeriod != null && LEAVE_PERIOD_TYPES.has(activePeriod.type);
      const isParentalLeave = activePeriod?.type === "parental_leave";
      const salaryFreelanceCounted = countableSalaryFreelanceScaledForMonth(
        entityCashflows,
        accounts,
        monthStart,
        monthEnd,
        onLeave,
        fte,
      );

      let grossIncome = 0;
      let grossBenefitIncome = 0;
      let totalExpenses = 0;
      const incomeBreakdown: MonthlyProjection["income_breakdown"] = [];
      const expenseBreakdown: MonthlyProjection["expense_breakdown"] = [];

      for (const cf of entityCashflows) {
        const monthlyAmt = cashflowMonthlyAmount(cf, monthStart, monthEnd);
        if (monthlyAmt === 0) continue;
        if (!cashflowContributesToPnLTotals(cf, accounts)) continue;

        if (cf.direction === "income") {
          if (cashflowIncomeInternalHideFromFlow(cf)) continue;
          if (!employmentIncomeCountsInProjectionMonth(cf, monthStart)) continue;
          const isSalaryLike = SALARY_CATEGORIES.has(cf.category);

          if (onLeave && isSalaryLike) {
            // Salary-type income is scaled by FTE (0 if full leave, partial if part-time leave)
            const scaled = monthlyAmt * fte;
            if (scaled > 0) {
              grossIncome += scaled;
              const net = employmentNetFromScaledGross(cf, scaled, loc, taxProfile, fallbackFraction, seTax);
              incomeBreakdown.push({
                cashflow_id: cf.id,
                name: cf.name,
                category: cf.category,
                gross: scaled,
                net,
              });
            }
          } else {
            // Not on leave or non-salary income: scale by FTE as normal
            const scaled = monthlyAmt * fte;
            grossIncome += scaled;
            const net = employmentNetFromScaledGross(cf, scaled, loc, taxProfile, fallbackFraction, seTax);
            incomeBreakdown.push({
              cashflow_id: cf.id,
              name: cf.name,
              category: cf.category,
              gross: scaled,
              net,
            });
          }
        } else {
          if (cashflowIncomeInternalHideFromFlow(cf)) continue;
          totalExpenses += monthlyAmt;
          expenseBreakdown.push({
            cashflow_id: cf.id,
            name: cf.name,
            category: cf.category,
            amount: monthlyAmt,
          });
        }
      }

      // Compute benefit income from period type
      if (isParentalLeave && isSE) {
        const annualSgi = resolveEntityAnnualSgiForBenefits(entity, cashflows);
        const fp = estimatedForaldrapenningDailySek(annualSgi);
        const leaveDays = Math.round((1 - fte) * weekdaysInMonth);
        const grossBenefit = fp.dailySek * leaveDays;
        if (grossBenefit > 0) {
          grossBenefitIncome += grossBenefit;
          const net = taxBenefitIncome(grossBenefit, seTax, fallbackFraction);
          incomeBreakdown.push({
            cashflow_id: `benefit:parental_leave:${entity.id}`,
            name: "Föräldrapenning",
            category: "salary",
            gross: grossBenefit,
            net,
          });
        }
      }

      const uMeta = getUnemploymentBenefitsForAdult(entity);
      const ug = aggregateBenefitGauge(uMeta);
      const remainingBenefitDays = ug.remainingDays ?? 0;
      const explicitUnemployedPeriod = activePeriod?.type === "unemployed";
      const inferredUnemploymentFromBenefits =
        remainingBenefitDays > 0 &&
        uMeta.programs.length > 0 &&
        activePeriod?.type !== "parental_leave" &&
        activePeriod?.type !== "sick_leave" &&
        salaryFreelanceCounted <= 0;

      const modelUnemploymentBenefits =
        explicitUnemployedPeriod || inferredUnemploymentFromBenefits;

      if (modelUnemploymentBenefits && uMeta.programs.length > 0) {
        const benefitDays = Math.round(
          weekdaysInMonth * (explicitUnemployedPeriod ? 1 - fte : 1),
        );
        if (benefitDays > 0) {
          const grossUb = computeUnemploymentBenefitGrossForMonth(
            entity.id,
            uMeta.programs,
            benefitDays,
            unemploymentProjConsumed,
          );
          if (grossUb > 0) {
            grossBenefitIncome += grossUb;
            const net = taxBenefitIncome(grossUb, seTax, fallbackFraction);
            incomeBreakdown.push({
              cashflow_id: `benefit:unemployment:${entity.id}`,
              name: "Unemployment benefit",
              category: "unemployment_benefit",
              gross: grossUb,
              net,
            });
          }
        }
      }

      // Explicit benefit rows from the benefits table
      let explicitBenefitTotal = 0;
      for (const b of entityBenefits) {
        const bFrom = new Date(b.date_from);
        const bTo = b.date_to ? new Date(b.date_to) : new Date("2099-12-31");
        if (bFrom <= monthEnd && bTo >= monthStart) {
          const bAmt = b.frequency === "monthly" ? b.amount
            : b.frequency === "daily" ? b.amount * 30
            : b.frequency === "weekly" ? b.amount * 4.33
            : b.amount;
          explicitBenefitTotal += bAmt;
        }
      }

      const totalGross = grossIncome + grossBenefitIncome;
      const netFromBreakdown = incomeBreakdown.reduce((s, i) => s + i.net, 0);
      const netIncome = netFromBreakdown + explicitBenefitTotal;
      const tax = totalGross - netFromBreakdown;

      const entityLoans = loans.filter(l => {
        const account = accounts.find(a => a.id === l.account_id);
        return account ? accountVisibleForEntity(account, entity.id) : false;
      });
      const loanRepayments = entityLoans.reduce((s, l) => s + (l.monthly_payment ?? 0), 0);

      const surplus = netIncome - totalExpenses - loanRepayments;
      cumulativeSurplus += surplus;

      allMonths.push({
        month: monthStr,
        entity_id: entity.id,
        gross_income: totalGross,
        tax,
        net_income: netIncome,
        total_expenses: totalExpenses,
        loan_repayments: loanRepayments,
        benefits: grossBenefitIncome + explicitBenefitTotal,
        surplus,
        cumulative_surplus: cumulativeSurplus,
        active_days: Math.round(fte * weekdaysInMonth),
        working_days: weekdaysInMonth,
        income_breakdown: incomeBreakdown,
        expense_breakdown: expenseBreakdown,
      });
    }
  }

  return {
    months: allMonths,
    totals: {
      gross_income: allMonths.reduce((s, m) => s + m.gross_income, 0),
      net_income: allMonths.reduce((s, m) => s + m.net_income, 0),
      total_expenses: allMonths.reduce((s, m) => s + m.total_expenses, 0),
      surplus: allMonths.reduce((s, m) => s + m.surplus, 0),
    },
  };
}
