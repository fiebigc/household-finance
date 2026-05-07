import { differenceInYears, isValid, parseISO } from "date-fns";
import type { Entity } from "@/types/schema";
import type { ParentalLeaveCardRow } from "@/stores/cardValuesStore";

/** Row shape produced by mergeParentalLeavePlanningRow (same as ParentalLeavePlanningDisplay). */
export type ParentalLeavePlanningRowForAgeRule = ParentalLeaveCardRow & {
  source: "manual" | "snapshot";
  adultRemaining?: Record<string, number>;
  snapshotImportedAt?: string;
};

/**
 * Illustrative planning cutoffs: after the child completes this many full years of age,
 * parental-leave *day quotas* on planning cards are treated as fully lapsed (available → 0).
 * Parameters are public-policy-style defaults for planning only, not benefit decisions.
 *
 * Countries not listed use {@link PARENTAL_LEAVE_LAPSE_AGE_DEFAULT_YEARS}.
 */
const PARENTAL_LEAVE_LAPSE_AGE_BY_COUNTRY: Record<string, number> = {
  /** Typical long reserve window for transferable days (illustrative). */
  SE: 12,
  NO: 12,
  DK: 12,
  FI: 12,
  IS: 12,
  /** Shorter common benefit windows (illustrative). */
  DE: 3,
  AT: 2,
  CH: 2,
  FR: 3,
  GB: 5,
  UK: 5,
  IE: 2,
  NL: 2,
  BE: 2,
  ES: 3,
  IT: 1,
  PT: 1,
  PL: 1,
  US: 1,
  CA: 1,
  AU: 2,
  NZ: 1,
  JP: 2,
};

export const PARENTAL_LEAVE_LAPSE_AGE_DEFAULT_YEARS = 12;

export function getParentalLeaveLapseAgeYears(countryCode: string | undefined): number {
  const c = (countryCode ?? "").trim().toUpperCase();
  if (c && PARENTAL_LEAVE_LAPSE_AGE_BY_COUNTRY[c] != null) {
    return PARENTAL_LEAVE_LAPSE_AGE_BY_COUNTRY[c];
  }
  return PARENTAL_LEAVE_LAPSE_AGE_DEFAULT_YEARS;
}

export function getChildCompletedAgeYears(birthDateIso: string | null | undefined, asOf: Date): number | null {
  if (!birthDateIso?.trim()) return null;
  const d = parseISO(birthDateIso.trim().slice(0, 10));
  if (!isValid(d)) return null;
  return Math.max(0, differenceInYears(asOf, d));
}

export type ParentalLeaveChildAgeEntitlement = {
  lapsed: boolean;
  /** Completed full years required before lapse (policy-style planning threshold). */
  lapseAgeYears: number;
  /** Child's completed full years at evaluation date, if birth date known. */
  completedAgeYears?: number;
  /** Entity has no usable birth date — lapse rule not applied. */
  skippedNoBirthDate?: boolean;
};

export function applyParentalLeaveChildAgeRule(
  row: ParentalLeavePlanningRowForAgeRule,
  child: Entity,
  householdCountry: string | undefined,
  asOf: Date = new Date(),
): ParentalLeavePlanningRowForAgeRule & { childAgeEntitlement?: ParentalLeaveChildAgeEntitlement } {
  const lapseAge = getParentalLeaveLapseAgeYears(householdCountry);
  const completed = getChildCompletedAgeYears(child.birth_date, asOf);

  if (completed === null) {
    return {
      ...row,
      childAgeEntitlement: {
        lapsed: false,
        lapseAgeYears: lapseAge,
        skippedNoBirthDate: true,
      },
    };
  }

  if (completed < lapseAge) {
    return {
      ...row,
      childAgeEntitlement: {
        lapsed: false,
        lapseAgeYears: lapseAge,
        completedAgeYears: completed,
      },
    };
  }

  const adultRemaining =
    row.adultRemaining && Object.keys(row.adultRemaining).length > 0
      ? Object.fromEntries(Object.keys(row.adultRemaining).map((id) => [id, 0]))
      : undefined;

  return {
    ...row,
    available: 0,
    adultRemaining,
    childAgeEntitlement: {
      lapsed: true,
      lapseAgeYears: lapseAge,
      completedAgeYears: completed,
    },
  };
}
