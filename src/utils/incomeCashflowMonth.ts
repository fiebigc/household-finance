import type { Cashflow, Period, PeriodDayOverride } from "@/types/schema";
import { effectiveFte } from "@/engine/scheduling";
import { compareOverlappingPeriodsForMonth } from "@/utils/periodResolution";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { isRenovationImportCashflow } from "@/utils/renovationExpensesCsv";

/** Monthly-equivalent amount active during `[monthStart, monthEnd]` (matches projection engine). */
export function cashflowMonthlyAmount(cf: Cashflow, monthStart: Date, monthEnd: Date): number {
  if (isRenovationImportCashflow(cf)) return 0;

  const from = new Date(cf.date_from);
  const to = cf.date_to ? new Date(cf.date_to) : new Date("2099-12-31");
  if (from > monthEnd || to < monthStart) return 0;

  switch (cf.frequency) {
    case "monthly":
      return cf.amount;
    case "annually":
      return from.getMonth() === monthStart.getMonth() ? cf.amount : 0;
    case "quarterly":
      return [0, 3, 6, 9].includes(monthStart.getMonth()) ? cf.amount : 0;
    case "weekly":
      return cf.amount * 4.33;
    case "biweekly":
      return cf.amount * 2.17;
    case "daily":
      return cf.amount * 30;
    case "one_off": {
      const cfMonth = format(from, "yyyy-MM");
      return cfMonth === format(monthStart, "yyyy-MM") ? cf.amount : 0;
    }
    default:
      return 0;
  }
}

export function resolveActivePeriodForMonth(
  entityPeriods: Period[],
  dayOverrides: PeriodDayOverride[],
  monthStart: Date,
  monthEnd: Date,
): { period: Period | null; fte: number } {
  const overlapping = entityPeriods.filter((period) => {
    const pFrom = new Date(period.date_from);
    const pTo = period.date_to ? new Date(period.date_to) : new Date("2099-12-31");
    return pFrom <= monthEnd && pTo >= monthStart;
  });
  if (overlapping.length === 0) return { period: null, fte: 1 };

  overlapping.sort(compareOverlappingPeriodsForMonth);

  const period = overlapping[0];
  const periodOverrides = dayOverrides.filter((o) => o.period_id === period.id);
  const fte = effectiveFte(period, periodOverrides, monthStart, monthEnd);
  return { period, fte };
}

/** Convenience for “current projection month”. */
export function resolveActivePeriodNow(entityPeriods: Period[], dayOverrides: PeriodDayOverride[]) {
  const monthStart = startOfMonth(new Date());
  const monthEnd = endOfMonth(monthStart);
  return resolveActivePeriodForMonth(entityPeriods, dayOverrides, monthStart, monthEnd);
}
