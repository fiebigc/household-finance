import { calculateAkassa } from "./akassaCalculator";
import { calculateForaldrapenning } from "./foraldrapenningCalculator";
import {
  addDaysIso,
  eachDateInclusive,
  parseIsoDate,
  toIsoDate,
} from "./householdCalendarMarks";
import type {
  PlanningCalendarDaysMap,
  PlanningPersonCode,
  WorkScheduleSegment,
} from "./householdCalendarTypes";
import { countMarkInBookings, hasMarkInBookings, normalizePersonBookings } from "./householdCalendarTypes";
import {
  AKASSA_WORKING_DAYS_PER_MONTH,
  PARENTAL_LEAVE_DAYS_QUOTA_PER_CHILD_PLANNING,
} from "./swedishConstants";

const DEFAULT_AKASSA_MEMBERSHIP_MONTHS = 14;

function monthRange(monthKeyYYYYMM: string): { start: string; end: string } {
  const [ys, ms] = monthKeyYYYYMM.split("-").map(Number);
  const y = ys ?? 1970;
  const m = ms ?? 1;
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { start, end };
}

export function countParentalLeaveDaysInMonth(
  map: PlanningCalendarDaysMap,
  person: PlanningPersonCode,
  monthKeyYYYYMM: string,
): number {
  const { start, end } = monthRange(monthKeyYYYYMM);
  let n = 0;
  for (const iso of eachDateInclusive(start, end)) {
    n += countMarkInBookings(normalizePersonBookings(map[iso]?.[person]), "PL");
  }
  return n;
}

export function countAkassaDaysInMonth(
  map: PlanningCalendarDaysMap,
  person: "H" | "C",
  monthKeyYYYYMM: string,
): number {
  const { start, end } = monthRange(monthKeyYYYYMM);
  let n = 0;
  for (const iso of eachDateInclusive(start, end)) {
    n += countMarkInBookings(normalizePersonBookings(map[iso]?.[person]), "AK");
  }
  return n;
}

export function countParentalLeaveDaysInYearForChild(
  map: PlanningCalendarDaysMap,
  child: "A" | "U",
  year: number,
): number {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  let n = 0;
  for (const iso of eachDateInclusive(from, to)) {
    n += countMarkInBookings(normalizePersonBookings(map[iso]?.[child]), "PL");
  }
  return n;
}

/** First birthday (same calendar day next year, UTC). */
export function firstBirthdayIso(birthDateIso: string): string {
  const d = parseIsoDate(birthDateIso.slice(0, 10));
  return toIsoDate(new Date(Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate())));
}

/**
 * After child turns one, SGI preservation often discussed with ~5 parental leave days / week.
 * Returns ISO weeks (Monday date) where fewer than 5 U PL days occur in that Mon–Sun window after first birthday.
 */
function startOfWeekMondayUtc(iso: string): string {
  const d = parseIsoDate(iso);
  const dow = d.getUTCDay();
  const off = dow === 0 ? -6 : 1 - dow;
  return toIsoDate(new Date(d.getTime() + off * 86_400_000));
}

/**
 * Weeks (Monday start) where calendar person U has fewer than `minPlDaysPerWeek` PL days after first birthday.
 * Planning hint only — not legal advice.
 */
export function untoSgiWeekWarnings(params: {
  map: PlanningCalendarDaysMap;
  untoBirthIso: string;
  scanFromIso: string;
  scanToIso: string;
  minPlDaysPerWeek?: number;
}): string[] {
  const min = params.minPlDaysPerWeek ?? 5;
  const firstB = firstBirthdayIso(params.untoBirthIso);
  const warnings: string[] = [];
  let weekStart = startOfWeekMondayUtc(params.scanFromIso);
  const endT = parseIsoDate(params.scanToIso).getTime();

  while (parseIsoDate(weekStart).getTime() <= endT) {
    const weekEnd = addDaysIso(weekStart, 6);
    if (weekEnd >= firstB) {
      let pl = 0;
      let postDays = 0;
      for (const iso of eachDateInclusive(weekStart, weekEnd)) {
        if (iso < firstB) continue;
        postDays += 1;
        if (hasMarkInBookings(normalizePersonBookings(params.map[iso]?.U), "PL")) pl += 1;
      }
      if (postDays >= 7 && pl < min) {
        warnings.push(weekStart);
      }
    }
    weekStart = addDaysIso(weekStart, 7);
  }
  return warnings.slice(0, 8);
}

export function estimateForaldrapenningMonthlyFromCalendar(params: {
  map: PlanningCalendarDaysMap;
  person: "H" | "C";
  monthKeyYYYYMM: string;
  annualSgiSek: number;
  taxRatePct?: number;
}): { paidDays: number; monthlyGrossSek: number } {
  const paidDays = countParentalLeaveDaysInMonth(params.map, params.person, params.monthKeyYYYYMM);
  const r = calculateForaldrapenning({
    annualSgiSek: params.annualSgiSek,
    daysRequested: paidDays,
    taxRatePct: params.taxRatePct,
  });
  return { paidDays, monthlyGrossSek: r.monthlyGrossSek };
}

export function estimateAkassaMonthlyFromMarkedDays(params: {
  map: PlanningCalendarDaysMap;
  person: "H" | "C";
  monthKeyYYYYMM: string;
  annualSgiSek: number;
  membershipMonths?: number;
  taxRatePct?: number;
}): { akassaDays: number; monthlyGrossSek: number } {
  const akassaDays = countAkassaDaysInMonth(params.map, params.person, params.monthKeyYYYYMM);
  const base = calculateAkassa({
    annualSgiSek: params.annualSgiSek,
    membershipMonths: params.membershipMonths ?? DEFAULT_AKASSA_MEMBERSHIP_MONTHS,
    taxRatePct: params.taxRatePct,
  });
  const factor = Math.min(1, Math.max(0, akassaDays / AKASSA_WORKING_DAYS_PER_MONTH));
  return {
    akassaDays,
    monthlyGrossSek: base.monthlyGrossSek * factor,
  };
}

export function childLeaveQuotaRemaining(
  map: PlanningCalendarDaysMap,
  child: "A" | "U",
  year: number,
): { used: number; quota: number; remaining: number } {
  const used = countParentalLeaveDaysInYearForChild(map, child, year);
  const quota = PARENTAL_LEAVE_DAYS_QUOTA_PER_CHILD_PLANNING;
  return { used, quota, remaining: Math.max(0, quota - used) };
}

export function workScheduleForAdultOnDate(
  rules: WorkScheduleSegment[],
  adultId: "adult1" | "adult2",
  iso: string,
): { workingPercentage: number; daysPerWeek: number } | null {
  const hit = rules.find(
    (r) =>
      r.adultId === adultId &&
      iso >= r.validFrom.slice(0, 10) &&
      iso <= r.validTo.slice(0, 10),
  );
  if (!hit) return null;
  return {
    workingPercentage: hit.workingPercentage,
    daysPerWeek: hit.daysPerWeek,
  };
}

export function suggestCalendarChildAParentalLeaveHint(params: {
  map: PlanningCalendarDaysMap;
  year: number;
  /** Display name for calendar person A (typically first child in household config). */
  personACalendarLabel?: string;
}): string {
  const name = params.personACalendarLabel?.trim() || "Child (A)";
  const { used, remaining } = childLeaveQuotaRemaining(params.map, "A", params.year);
  if (remaining <= 0) {
    return `${name}: planning quota used (${used}/${PARENTAL_LEAVE_DAYS_QUOTA_PER_CHILD_PLANNING} days in ${params.year}).`;
  }
  return `${name}: ${used} parental leave days used in ${params.year}; ${remaining} days remain under the simplified ${PARENTAL_LEAVE_DAYS_QUOTA_PER_CHILD_PLANNING}-day planning cap (maximize use by adding PL on A in the calendar).`;
}
