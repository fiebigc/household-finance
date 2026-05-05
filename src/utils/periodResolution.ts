import type { PeriodType } from "@/types/schema";

/**
 * When several periods overlap the same calendar month, the projection picks one row.
 * Prefer leave/absence over generic employment so parental_leave isn't skipped when an
 * open-ended employed row still overlaps.
 */
export const PERIOD_OVERLAP_PRIORITY: Record<PeriodType, number> = {
  parental_leave: 100,
  sick_leave: 95,
  unemployed: 90,
  unpaid_leave: 88,
  self_employed: 55,
  employed: 50,
  daycare: 40,
  home: 40,
  school: 40,
  preschool: 40,
};

export function overlapResolutionRank(t: PeriodType): number {
  return PERIOD_OVERLAP_PRIORITY[t] ?? 0;
}

/** Sort so the first element is the one the projection engine uses for that month. */
export function compareOverlappingPeriodsForMonth<T extends { type: PeriodType; date_from: string }>(
  a: T,
  b: T,
): number {
  const diff = overlapResolutionRank(b.type) - overlapResolutionRank(a.type);
  if (diff !== 0) return diff;
  return b.date_from.localeCompare(a.date_from);
}
