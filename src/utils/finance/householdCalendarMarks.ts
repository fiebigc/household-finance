import type {
  PlanningCalendarDaysMap,
  PlanningDayMark,
  PlanningDayMarks,
  PlanningPersonBookings,
  PlanningPersonCode,
} from "./householdCalendarTypes";
import {
  countMarkInBookings,
  isPlanningPersonCode,
  normalizePersonBookings,
} from "./householdCalendarTypes";

const MS_DAY = 86_400_000;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function toIsoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function parseIsoDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}

export function addDaysIso(iso: string, delta: number): string {
  const t = parseIsoDate(iso).getTime() + delta * MS_DAY;
  return toIsoDate(new Date(t));
}

export function mondayOnOrBefore(iso: string): string {
  const d = parseIsoDate(iso);
  const dow = d.getUTCDay();
  const off = dow === 0 ? -6 : 1 - dow;
  return addDaysIso(iso, off);
}

/** 6×7 cells (Mon–Sun rows) covering the month; `inMonth` flags primary month. */
export function monthGridCells(year: number, month0: number): { iso: string; inMonth: boolean }[] {
  const firstIso = `${year}-${pad2(month0 + 1)}-01`;
  let cur = mondayOnOrBefore(firstIso);
  const cells: { iso: string; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = parseIsoDate(cur);
    cells.push({
      iso: cur,
      inMonth: d.getUTCFullYear() === year && d.getUTCMonth() === month0,
    });
    cur = addDaysIso(cur, 1);
  }
  return cells;
}

export function eachDateInclusive(fromIso: string, toIso: string): string[] {
  const out: string[] = [];
  let cur = fromIso;
  const end = parseIsoDate(toIso).getTime();
  while (parseIsoDate(cur).getTime() <= end) {
    out.push(cur);
    cur = addDaysIso(cur, 1);
  }
  return out;
}

/** Merge `patch` into a copy of `base` (shallow per-day). */
export function mergeCalendarDays(
  base: PlanningCalendarDaysMap,
  patch: PlanningCalendarDaysMap,
): PlanningCalendarDaysMap {
  const next: PlanningCalendarDaysMap = { ...base };
  for (const [day, marks] of Object.entries(patch)) {
    const prev = next[day] ?? {};
    const merged: PlanningDayMarks = { ...prev };
    for (const [key, raw] of Object.entries(marks)) {
      if (!isPlanningPersonCode(key)) continue;
      const b = normalizePersonBookings(raw);
      if (b.length === 0) delete merged[key];
      else merged[key] = b;
    }
    if (Object.keys(merged).length === 0) {
      delete next[day];
    } else {
      next[day] = merged;
    }
  }
  return next;
}

export function getPersonBookings(
  map: PlanningCalendarDaysMap,
  iso: string,
  person: PlanningPersonCode,
): PlanningPersonBookings {
  return normalizePersonBookings(map[iso]?.[person]);
}

/** For each ISO weekday 1=Mon..7=Sun in range, set person mark (skip if not in weekdays set). */
export function applyWeeklyPattern(params: {
  fromIso: string;
  untilIso: string;
  weekdays: number[]; // 1..7
  person: PlanningPersonCode;
  mark: PlanningDayMark;
  base: PlanningCalendarDaysMap;
}): PlanningCalendarDaysMap {
  const { fromIso, untilIso, weekdays, person, mark, base } = params;
  const set = new Set(weekdays);
  const patch: PlanningCalendarDaysMap = {};
  for (const iso of eachDateInclusive(fromIso, untilIso)) {
    const d = parseIsoDate(iso);
    const dow = d.getUTCDay(); // 0 Sun .. 6 Sat
    const isoDow = dow === 0 ? 7 : dow;
    if (!set.has(isoDow)) continue;
    const bookings =
      mark === "" ? [] : mark === "PL" || mark === "WK" || mark === "AK" ? [mark] : [];
    patch[iso] = { [person]: bookings };
  }
  return mergeCalendarDays(base, patch);
}

export function cycleMark(current: PlanningDayMark): PlanningDayMark {
  const order: PlanningDayMark[] = ["", "PL", "WK", "AK"];
  const i = order.indexOf(current);
  return order[(i + 1) % order.length] ?? "";
}

export function countMarkInRange(
  map: PlanningCalendarDaysMap,
  person: PlanningPersonCode,
  mark: PlanningDayMark,
  fromIso: string,
  toIso: string,
): number {
  if (mark === "") return 0;
  let n = 0;
  for (const iso of eachDateInclusive(fromIso, toIso)) {
    n += countMarkInBookings(getPersonBookings(map, iso, person), mark);
  }
  return n;
}
