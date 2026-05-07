import type { Entity } from "@/types/schema";
import type { ParentalLeaveCardRow } from "@/stores/cardValuesStore";
import {
  applyParentalLeaveChildAgeRule,
  type ParentalLeaveChildAgeEntitlement,
} from "./parentalLeaveChildAgeRule";

export { applyParentalLeaveChildAgeRule, getParentalLeaveLapseAgeYears } from "./parentalLeaveChildAgeRule";
export type { ParentalLeaveChildAgeEntitlement } from "./parentalLeaveChildAgeRule";

/** Shape written by scripts/import-parental-leave-csv.mjs */
export type ParentalLeaveSnapshot = {
  source?: string;
  imported_at?: string;
  days_total_allowance?: number;
  days_remaining_total?: number;
  days_remaining_du?: number;
  days_remaining_annan_foralder?: number;
  portal_du_adult?: { entity_id: string; name?: string };
  portal_annan_foralder_adults?: { entity_id: string; name?: string }[];
};

export function readParentalLeaveSnapshot(child: Entity): ParentalLeaveSnapshot | null {
  const raw = child.metadata?.parental_leave_snapshot;
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.days_total_allowance !== "number" || typeof o.days_remaining_total !== "number") return null;
  return raw as ParentalLeaveSnapshot;
}

export function isParentalCardRowUnset(manual: ParentalLeaveCardRow): boolean {
  if (manual.available !== 0 || manual.used !== 0) return false;
  const au = manual.adultUsed;
  if (!au || typeof au !== "object") return true;
  return Object.keys(au).length === 0 || Object.values(au).every((v) => v === 0);
}

export type ParentalLeavePlanningDisplay = ParentalLeaveCardRow & {
  source: "manual" | "snapshot";
  /** FK: days left per adult (shown in card details when source === snapshot) */
  adultRemaining?: Record<string, number>;
  snapshotImportedAt?: string;
  /** Set when finalizeParentalLeavePlanningRow applies the child-age lapse rule. */
  childAgeEntitlement?: ParentalLeaveChildAgeEntitlement;
};

export function mergeParentalLeavePlanningRow(
  child: Entity,
  manual: ParentalLeaveCardRow,
  adults: Entity[],
): ParentalLeavePlanningDisplay {
  const snap = readParentalLeaveSnapshot(child);
  if (!snap || !isParentalCardRowUnset(manual)) {
    return { ...manual, source: "manual" };
  }

  const total = snap.days_total_allowance ?? 0;
  const remTotal = snap.days_remaining_total ?? 0;
  const used =
    Number.isFinite(total) && Number.isFinite(remTotal) ? Math.max(0, total - remTotal) : 0;

  const adultRemaining: Record<string, number> = {};
  const duId = snap.portal_du_adult?.entity_id;
  const remDu = snap.days_remaining_du;
  if (duId && typeof remDu === "number" && Number.isFinite(remDu)) {
    adultRemaining[duId] = remDu;
  }
  const remAnnan = snap.days_remaining_annan_foralder;
  const otherAdults = adults.filter((a) => a.id !== duId);
  if (typeof remAnnan === "number" && Number.isFinite(remAnnan) && otherAdults.length === 1) {
    adultRemaining[otherAdults[0].id] = remAnnan;
  } else if (typeof remAnnan === "number" && Number.isFinite(remAnnan) && otherAdults.length > 1) {
    const each = remAnnan / otherAdults.length;
    for (const a of otherAdults) {
      adultRemaining[a.id] = Math.round(each * 100) / 100;
    }
  }

  return {
    available: Number.isFinite(total) ? total : 0,
    used,
    adultUsed: {},
    benefitLevel: manual.benefitLevel,
    source: "snapshot",
    adultRemaining,
    snapshotImportedAt: typeof snap.imported_at === "string" ? snap.imported_at : undefined,
  };
}

export function finalizeParentalLeavePlanningRow(
  child: Entity,
  manual: ParentalLeaveCardRow,
  adults: Entity[],
  householdCountry: string | undefined,
  asOf: Date = new Date(),
): ParentalLeavePlanningDisplay {
  const merged = mergeParentalLeavePlanningRow(child, manual, adults);
  return applyParentalLeaveChildAgeRule(merged, child, householdCountry, asOf);
}
