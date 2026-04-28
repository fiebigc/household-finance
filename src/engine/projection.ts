import type { Entity, Cashflow, Period, PeriodDayOverride, Loan, TaxProfile, Benefit } from "@/types/schema";
import type { MonthlyProjection, HouseholdProjection } from "@/types/engine";
import { effectiveFte } from "./scheduling";
import { startOfMonth, endOfMonth, addMonths, format, isWithinInterval } from "date-fns";

interface ProjectionInput {
  entities: Entity[];
  cashflows: Cashflow[];
  periods: Period[];
  dayOverrides: PeriodDayOverride[];
  loans: Loan[];
  benefits: Benefit[];
  taxProfiles: TaxProfile[];
  startMonth: Date;
  months: number;
}

function applyTax(gross: number, taxProfile: TaxProfile | undefined): number {
  if (!taxProfile) return gross * 0.68;
  if (taxProfile.method === "flat_rate" && taxProfile.flat_rate != null) {
    return gross * (1 - taxProfile.flat_rate);
  }
  if (taxProfile.method === "brackets" && taxProfile.brackets) {
    let remaining = gross * 12;
    let totalTax = 0;
    for (const bracket of taxProfile.brackets) {
      const upper = bracket.to ?? Infinity;
      const taxable = Math.min(remaining, upper - bracket.from);
      if (taxable <= 0) break;
      totalTax += taxable * bracket.rate;
      remaining -= taxable;
    }
    return gross - totalTax / 12;
  }
  return gross * 0.68;
}

function cashflowMonthlyAmount(cf: Cashflow, monthStart: Date, monthEnd: Date): number {
  const from = new Date(cf.date_from);
  const to = cf.date_to ? new Date(cf.date_to) : new Date("2099-12-31");
  if (from > monthEnd || to < monthStart) return 0;

  switch (cf.frequency) {
    case "monthly": return cf.amount;
    case "annually": return from.getMonth() === monthStart.getMonth() ? cf.amount : 0;
    case "quarterly": return [0, 3, 6, 9].includes(monthStart.getMonth()) ? cf.amount : 0;
    case "weekly": return cf.amount * 4.33;
    case "biweekly": return cf.amount * 2.17;
    case "daily": return cf.amount * 30;
    case "one_off": {
      const cfMonth = format(from, "yyyy-MM");
      return cfMonth === format(monthStart, "yyyy-MM") ? cf.amount : 0;
    }
    default: return 0;
  }
}

export function computeProjection(input: ProjectionInput): HouseholdProjection {
  const { entities, cashflows, periods, dayOverrides, loans, benefits, taxProfiles, startMonth, months: numMonths } = input;
  const allMonths: MonthlyProjection[] = [];
  let cumulativeSurplus = 0;

  for (let m = 0; m < numMonths; m++) {
    const monthStart = startOfMonth(addMonths(startMonth, m));
    const monthEnd = endOfMonth(monthStart);
    const monthStr = format(monthStart, "yyyy-MM");

    for (const entity of entities) {
      const entityPeriods = periods.filter(p => p.entity_id === entity.id);
      const entityCashflows = cashflows.filter(c => c.entity_id === entity.id);
      const entityBenefits = benefits.filter(b => b.entity_id === entity.id);
      const taxProfile = taxProfiles.find(tp => tp.entity_id === entity.id);

      let fte = 1;
      for (const period of entityPeriods) {
        const pFrom = new Date(period.date_from);
        const pTo = period.date_to ? new Date(period.date_to) : new Date("2099-12-31");
        if (pFrom <= monthEnd && pTo >= monthStart) {
          const periodOverrides = dayOverrides.filter(o => o.period_id === period.id);
          fte = effectiveFte(period, periodOverrides, monthStart, monthEnd);
          break;
        }
      }

      let grossIncome = 0;
      let totalExpenses = 0;
      const incomeBreakdown: MonthlyProjection["income_breakdown"] = [];
      const expenseBreakdown: MonthlyProjection["expense_breakdown"] = [];

      for (const cf of entityCashflows) {
        const monthlyAmt = cashflowMonthlyAmount(cf, monthStart, monthEnd);
        if (monthlyAmt === 0) continue;

        if (cf.direction === "income") {
          const scaled = monthlyAmt * fte;
          grossIncome += scaled;
          incomeBreakdown.push({
            cashflow_id: cf.id,
            name: cf.name,
            category: cf.category,
            gross: scaled,
            net: cf.is_gross ? applyTax(scaled, taxProfile) : scaled,
          });
        } else {
          totalExpenses += monthlyAmt;
          expenseBreakdown.push({
            cashflow_id: cf.id,
            name: cf.name,
            category: cf.category,
            amount: monthlyAmt,
          });
        }
      }

      let benefitTotal = 0;
      for (const b of entityBenefits) {
        const bFrom = new Date(b.date_from);
        const bTo = b.date_to ? new Date(b.date_to) : new Date("2099-12-31");
        if (bFrom <= monthEnd && bTo >= monthStart) {
          const bAmt = b.frequency === "monthly" ? b.amount
            : b.frequency === "daily" ? b.amount * 30
            : b.frequency === "weekly" ? b.amount * 4.33
            : b.amount;
          benefitTotal += bAmt;
        }
      }

      const netIncome = incomeBreakdown.reduce((s, i) => s + i.net, 0) + benefitTotal;
      const tax = grossIncome - incomeBreakdown.reduce((s, i) => s + i.net, 0);

      const entityLoans = loans.filter(l => {
        const account = cashflows.find(c => c.account_id === l.account_id);
        return account?.entity_id === entity.id;
      });
      const loanRepayments = entityLoans.reduce((s, l) => s + (l.monthly_payment ?? 0), 0);

      const surplus = netIncome - totalExpenses - loanRepayments;
      cumulativeSurplus += surplus;

      allMonths.push({
        month: monthStr,
        entity_id: entity.id,
        gross_income: grossIncome,
        tax,
        net_income: netIncome,
        total_expenses: totalExpenses,
        loan_repayments: loanRepayments,
        benefits: benefitTotal,
        surplus,
        cumulative_surplus: cumulativeSurplus,
        active_days: Math.round(fte * 22),
        working_days: 22,
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
