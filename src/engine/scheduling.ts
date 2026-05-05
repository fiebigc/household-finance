import type { Period, PeriodDayOverride, PeriodType, WeeklyPattern } from "@/types/schema";
import { eachDayOfInterval, getDay, format } from "date-fns";

const DAY_KEYS: (keyof WeeklyPattern)[] = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
];

export function isActiveDay(
  date: Date,
  period: Period,
  overrides: PeriodDayOverride[]
): boolean {
  const dateStr = format(date, "yyyy-MM-dd");
  const override = overrides.find((o) => o.date === dateStr);

  if (override) {
    return override.override_type === "active";
  }

  if (period.weekly_pattern) {
    const dow = getDay(date);
    return period.weekly_pattern[DAY_KEYS[dow]] ?? false;
  }

  return true;
}

export function countActiveDays(
  period: Period,
  overrides: PeriodDayOverride[],
  rangeStart: Date,
  rangeEnd: Date
): { activeDays: number; totalDays: number } {
  const from = new Date(Math.max(new Date(period.date_from).getTime(), rangeStart.getTime()));
  const to = period.date_to
    ? new Date(Math.min(new Date(period.date_to).getTime(), rangeEnd.getTime()))
    : rangeEnd;

  if (from > to) return { activeDays: 0, totalDays: 0 };

  const days = eachDayOfInterval({ start: from, end: to });
  let active = 0;
  for (const day of days) {
    if (isActiveDay(day, period, overrides)) active++;
  }
  return { activeDays: active, totalDays: days.length };
}

/**
 * When pct_fte is null (never set), absence-type periods should not assume full-time employment —
 * otherwise föräldrapenning gets (1−FTE)×weekdays = 0. Employed-style defaults stay at 100%.
 */
function impliedPctFteWhenUnset(type: PeriodType): number {
  switch (type) {
    case "parental_leave":
    case "sick_leave":
    case "unemployed":
      return 0;
    default:
      return 100;
  }
}

export function effectiveFte(
  period: Period,
  overrides: PeriodDayOverride[],
  rangeStart: Date,
  rangeEnd: Date
): number {
  if (period.weekly_pattern) {
    const { activeDays } = countActiveDays(period, overrides, rangeStart, rangeEnd);
    const weekdays = countWeekdays(rangeStart, rangeEnd);
    let fte = weekdays > 0 ? activeDays / weekdays : 0;
    // Full active Mon–Fri schedule during absence periods means zero payroll employment from this row —
    // otherwise föräldrapenning / unemployment compensation days become (1−FTE)×weekdays = 0.
    if (
      (period.type === "parental_leave" || period.type === "unemployed") &&
      weekdays > 0 &&
      fte >= 0.99
    ) {
      fte = 0;
    }
    // When pct_fte is explicitly set below 100 (e.g. 80%), cap the schedule-derived FTE
    // so "employed 80% with Mon-Fri active" yields 0.8 rather than 1.0.
    if (period.pct_fte != null && period.pct_fte < 100) {
      fte = Math.min(fte, period.pct_fte / 100);
    }
    return fte;
  }
  return (period.pct_fte ?? impliedPctFteWhenUnset(period.type)) / 100;
}

export function countWeekdays(start: Date, end: Date): number {
  const days = eachDayOfInterval({ start, end });
  return days.filter((d) => {
    const dow = getDay(d);
    return dow !== 0 && dow !== 6;
  }).length;
}
