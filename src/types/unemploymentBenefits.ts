/** Stored under Entity.metadata.unemployment_benefits — generic multi-country unemployment benefit programs. */

export type UnemploymentBenefitTier = {
  id: string;
  order: number;
  /** Optional label (e.g. "Tier 1", "80% dag 1–100"). */
  label?: string | null;
  /** Number of benefit days in this tier before the next tier applies. */
  duration_days: number;
  /** Gross benefit amount per day in household currency unless tier overrides. */
  compensation_per_day: number;
};

export type UnemploymentBenefitProgram = {
  id: string;
  name: string;
  /** e.g. akassa_screenshot_ocr, manual */
  source?: string | null;
  imported_at?: string | null;
  /** Compensated days used so far in this program’s benefit period (when known). */
  days_used?: number | null;
  notes?: string | null;
  tiers: UnemploymentBenefitTier[];
};

export type UnemploymentBenefitsMetadata = {
  version: 1;
  programs: UnemploymentBenefitProgram[];
};
