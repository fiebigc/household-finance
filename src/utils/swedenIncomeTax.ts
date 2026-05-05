import seStockholm2026 from "@/data/tax/se-stockholm-income-tax-2026.json";

export interface EffectiveWithholdingBracket {
  monthlyGrossFrom: number;
  monthlyGrossTo: number | null;
  effectiveRate: number;
}

export interface SwedenCityTaxProfile {
  kommunalskattPct: number;
  effectiveWithholdingBrackets: EffectiveWithholdingBracket[];
  benefitWithholdingRate: number;
  statligSkattThreshold: number;
}

const PROFILES: Record<string, SwedenCityTaxProfile> = {};

function loadProfile(key: string, json: typeof seStockholm2026): SwedenCityTaxProfile {
  return {
    kommunalskattPct: json.kommunalskattPct,
    effectiveWithholdingBrackets: json.effectiveWithholdingTable.brackets as EffectiveWithholdingBracket[],
    benefitWithholdingRate: json.benefitWithholdingRate.rate,
    statligSkattThreshold: json.statligSkattThresholds[0]?.annualIncomeUpTo ?? 625800,
  };
}

PROFILES["SE|stockholm"] = loadProfile("SE|stockholm", seStockholm2026);

export function getSwedenCityTaxProfile(city: string | null): SwedenCityTaxProfile | null {
  if (!city) return PROFILES["SE|stockholm"] ?? null;
  const slug = city.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
  return PROFILES[`SE|${slug}`] ?? PROFILES["SE|stockholm"] ?? null;
}

/**
 * Effective monthly income tax for employment income in Sweden (illustrative).
 * Uses the bracket table from the city JSON (already accounts for jobbskatteavdrag/grundavdrag).
 */
export function swedenEffectiveEmploymentTax(monthlyGross: number, profile: SwedenCityTaxProfile): number {
  if (monthlyGross <= 0) return 0;
  const brackets = profile.effectiveWithholdingBrackets;
  for (let i = brackets.length - 1; i >= 0; i--) {
    const b = brackets[i];
    if (monthlyGross >= b.monthlyGrossFrom) {
      return monthlyGross * b.effectiveRate;
    }
  }
  return 0;
}

/**
 * Effective monthly tax for benefit income (parental leave, sickness, unemployment).
 * These are taxed at source by Försäkringskassan / a-kassa with a flat withholding,
 * typically ~30% (no jobbskatteavdrag).
 */
export function swedenEffectiveBenefitTax(monthlyBenefitGross: number, profile: SwedenCityTaxProfile): number {
  if (monthlyBenefitGross <= 0) return 0;
  return monthlyBenefitGross * profile.benefitWithholdingRate;
}

/**
 * Combined: if an entity is partly employed and partly on leave in a month,
 * apply employment tax to the salary portion and benefit tax to the benefit portion.
 */
export function swedenMonthlyCombinedTax(
  employmentGross: number,
  benefitGross: number,
  profile: SwedenCityTaxProfile,
): number {
  return swedenEffectiveEmploymentTax(employmentGross, profile) +
    swedenEffectiveBenefitTax(benefitGross, profile);
}
