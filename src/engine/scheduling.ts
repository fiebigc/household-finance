import type { Period, PeriodDayOverride, WeeklyPattern } from "@/types/schema";
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

export function effectiveFte(
  period: Period,
  overrides: PeriodDayOverride[],
  rangeStart: Date,
  rangeEnd: Date
): number {
  if (period.weekly_pattern) {
    const { activeDays, totalDays } = countActiveDays(period, overrides, rangeStart, rangeEnd);
    const weekdays = countWeekdays(rangeStart, rangeEnd);
    return weekdays > 0 ? activeDays / weekdays : 0;
  }
  return (period.pct_fte ?? 100) / 100;
}

function countWeekdays(start: Date, end: Date): number {
  const days = eachDayOfInterval({ start, end });
  return days.filter((d) => {
    const dow = getDay(d);
    return dow !== 0 && dow !== 6;
  }).length;
}
