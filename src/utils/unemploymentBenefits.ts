import type { Entity } from "@/types/schema";
import type {
  UnemploymentBenefitsMetadata,
  UnemploymentBenefitProgram,
  UnemploymentBenefitTier,
} from "@/types/unemploymentBenefits";

export const UNEMPLOYMENT_BENEFITS_META_KEY = "unemployment_benefits";

/** Legacy Swedish a-kassa screenshot import (single block). */
export type LegacyUnemploymentInsuranceSnapshot = {
  source?: string;
  imported_at?: string;
  portal?: string;
  days_total?: number;
  days_used?: number;
  days_remaining?: number;
  compensation_per_day_sek?: number;
};

function asFiniteNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function readLegacySnapshot(adult: Entity): LegacyUnemploymentInsuranceSnapshot | null {
  const raw = adult.metadata?.unemployment_insurance_snapshot;
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const dt = asFiniteNumber(o.days_total);
  const du = asFiniteNumber(o.days_used);
  if (dt === null || du === null) return null;
  return raw as LegacyUnemploymentInsuranceSnapshot;
}

export function migrateLegacySnapshotToMetadata(
  legacy: LegacyUnemploymentInsuranceSnapshot,
): UnemploymentBenefitsMetadata {
  const total = legacy.days_total ?? 0;
  const rate = asFiniteNumber(legacy.compensation_per_day_sek) ?? 0;
  const tier: UnemploymentBenefitTier = {
    id: crypto.randomUUID(),
    order: 0,
    label: legacy.portal ? `Imported (${legacy.portal})` : "Imported benefit period",
    duration_days: Math.max(0, total),
    compensation_per_day: Math.max(0, rate),
  };
  const prog: UnemploymentBenefitProgram = {
    id: crypto.randomUUID(),
    name: legacy.portal ? `Unemployment benefit (${legacy.portal})` : "Unemployment benefit",
    source: legacy.source ?? "legacy_import",
    imported_at: legacy.imported_at ?? null,
    days_used: legacy.days_used ?? null,
    tiers: total > 0 || rate > 0 ? [tier] : [],
  };
  return { version: 1, programs: [prog] };
}

export function readUnemploymentBenefitsMetadata(adult: Entity): UnemploymentBenefitsMetadata | null {
  const raw = adult.metadata?.[UNEMPLOYMENT_BENEFITS_META_KEY];
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== 1 || !Array.isArray(o.programs)) return null;
  const programs = (o.programs as unknown[]).filter(Boolean) as UnemploymentBenefitProgram[];
  if (programs.length === 0) return null;
  return { version: 1, programs };
}

/** Canonical metadata + migration from legacy unemployment_insurance_snapshot when needed. */
export function getUnemploymentBenefitsForAdult(adult: Entity): UnemploymentBenefitsMetadata {
  const cur = readUnemploymentBenefitsMetadata(adult);
  if (cur) return cur;
  const legacy = readLegacySnapshot(adult);
  if (legacy) return migrateLegacySnapshotToMetadata(legacy);
  return { version: 1, programs: [] };
}

export function programQuotaDays(p: UnemploymentBenefitProgram): number {
  return p.tiers.reduce((s, t) => s + Math.max(0, t.duration_days), 0);
}

export function aggregateBenefitGauge(meta: UnemploymentBenefitsMetadata): {
  quotaDays: number;
  usedDays: number;
  referenceRate?: number;
  remainingDays?: number;
} {
  let quotaDays = 0;
  let usedDays = 0;
  let weightedRateSum = 0;
  let tierDaysForWeight = 0;

  for (const p of meta.programs) {
    const q = programQuotaDays(p);
    quotaDays += q;
    usedDays += Math.max(0, p.days_used ?? 0);
    for (const t of p.tiers) {
      const d = Math.max(0, t.duration_days);
      weightedRateSum += d * Math.max(0, t.compensation_per_day);
      tierDaysForWeight += d;
    }
  }

  const referenceRate =
    tierDaysForWeight > 0 ? weightedRateSum / tierDaysForWeight : undefined;
  const remainingDays = Math.max(0, quotaDays - usedDays);

  return { quotaDays, usedDays, referenceRate, remainingDays };
}

function tierAtCompensatedDayIndex(
  dayIndex: number,
  sortedTiers: UnemploymentBenefitTier[],
): UnemploymentBenefitTier | null {
  let cum = 0;
  for (const t of sortedTiers) {
    const len = Math.max(0, t.duration_days);
    if (len === 0) continue;
    if (dayIndex < cum + len) return t;
    cum += len;
  }
  return null;
}

/**
 * Gross benefit for `daysToPay` compensated days starting at offset `simUsed` (0-based in this program’s tier ladder).
 */
export function grossUnemploymentForProgramDays(
  simUsed: number,
  daysToPay: number,
  tiers: UnemploymentBenefitTier[],
): number {
  if (daysToPay <= 0) return 0;
  const sorted = [...tiers].sort((a, b) => a.order - b.order);
  let gross = 0;
  for (let i = 0; i < daysToPay; i++) {
    const tier = tierAtCompensatedDayIndex(simUsed + i, sorted);
    if (!tier) break;
    gross += Math.max(0, tier.compensation_per_day);
  }
  return gross;
}

/**
 * Spread requested benefit-days across programs (first programs consume days first).
 * Mutates `extraConsumedByProgram` with keys `${entityId}:${program.id}` — cumulative compensated days
 * charged inside this projection run only (baseline `program.days_used` is separate).
 */
export function computeUnemploymentBenefitGrossForMonth(
  entityId: string,
  programs: UnemploymentBenefitProgram[],
  benefitDaysInMonth: number,
  extraConsumedByProgram: Map<string, number>,
): number {
  if (benefitDaysInMonth <= 0 || programs.length === 0) return 0;
  let grossTotal = 0;
  let daysLeft = benefitDaysInMonth;
  for (const prog of programs) {
    const key = `${entityId}:${prog.id}`;
    const baseline = Math.max(0, prog.days_used ?? 0);
    const extra = extraConsumedByProgram.get(key) ?? 0;
    const simUsed = baseline + extra;
    const quota = programQuotaDays(prog);
    if (quota <= 0) continue;
    const progRemain = Math.max(0, quota - simUsed);
    const pay = Math.min(daysLeft, progRemain);
    if (pay <= 0) continue;
    grossTotal += grossUnemploymentForProgramDays(simUsed, pay, prog.tiers);
    extraConsumedByProgram.set(key, extra + pay);
    daysLeft -= pay;
    if (daysLeft <= 0) break;
  }
  return grossTotal;
}
