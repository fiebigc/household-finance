/** Calendar person codes: H/C = adults (see `planningPersonDisplayLabels`), A/U = children slots. */
export type PlanningPersonCode = "H" | "C" | "A" | "U";

/** PL = parental leave benefit day, WK = paid work day, AK = A-kassa benefit day (adults only). */
export type PlanningDayMark = "PL" | "WK" | "AK" | "";

/** One person can have several bookings on the same calendar day (planning). */
export type PlanningPersonBookings = ("PL" | "WK" | "AK")[];

/** Per-day map; each person has an ordered list of non-empty marks. */
export type PlanningDayMarks = Partial<Record<PlanningPersonCode, PlanningPersonBookings>>;

/** All marks keyed by ISO calendar date `YYYY-MM-DD`. */
export type PlanningCalendarDaysMap = Record<string, PlanningDayMarks>;

/** Legacy persisted shape: a single mark per person. */
export type PlanningStoredPersonMark = PlanningDayMark | PlanningPersonBookings;

export function isBenefitMark(m: PlanningDayMark): m is "PL" | "WK" | "AK" {
  return m === "PL" || m === "WK" || m === "AK";
}

export function normalizePersonBookings(raw: unknown): PlanningPersonBookings {
  if (raw == null || raw === "") return [];
  if (Array.isArray(raw)) {
    return raw.filter((x): x is "PL" | "WK" | "AK" => x === "PL" || x === "WK" || x === "AK");
  }
  if (raw === "PL" || raw === "WK" || raw === "AK") return [raw];
  return [];
}

export function normalizePlanningDayMarks(raw: unknown): PlanningDayMarks {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const out: PlanningDayMarks = {};
  for (const p of ["H", "C", "A", "U"] as const) {
    if (!(p in o)) continue;
    const b = normalizePersonBookings(o[p]);
    if (b.length > 0) out[p] = b;
  }
  return out;
}

export function countMarkInBookings(bookings: PlanningPersonBookings | undefined, mark: PlanningDayMark): number {
  if (!bookings || mark === "") return 0;
  return bookings.filter((x) => x === mark).length;
}

export function hasMarkInBookings(bookings: PlanningPersonBookings | undefined, mark: PlanningDayMark): boolean {
  return countMarkInBookings(bookings, mark) > 0;
}

export interface WorkScheduleSegment {
  adultId: "adult1" | "adult2";
  validFrom: string;
  validTo: string;
  workingPercentage: number;
  daysPerWeek: number;
}

/** Minimal shape so callers can pass `HouseholdConfig` without a circular import. */
export type PlanningPersonLabelSource = {
  adults: readonly { label?: string }[];
  children: readonly { label?: string }[];
};

/**
 * Maps calendar columns to household labels. C/H follow `estimateForaldrapenning…` usage
 * (C = adults[0], H = adults[1]). A/U use first and second child when present.
 */
export function planningPersonDisplayLabels(src: PlanningPersonLabelSource): Record<PlanningPersonCode, string> {
  const adult0 = src.adults[0]?.label?.trim() || "Adult 1";
  const adult1 = src.adults[1]?.label?.trim() || "Adult 2";
  const ch0 = src.children[0]?.label?.trim() || "Child (A)";
  const ch1 = src.children[1]?.label?.trim() || ch0;
  return {
    C: adult0,
    H: adult1,
    A: ch0,
    U: ch1,
  };
}

export const PLANNING_MARK_CYCLE: PlanningDayMark[] = ["", "PL", "WK", "AK"];

export function isPlanningPersonCode(s: string): s is PlanningPersonCode {
  return s === "H" || s === "C" || s === "A" || s === "U";
}

export function isPlanningDayMark(s: string): s is PlanningDayMark {
  return s === "PL" || s === "WK" || s === "AK" || s === "";
}
