import defaultsFile from "@/data/tax/location-income-tax-defaults.json";

export type HouseholdTaxLocationInput = {
  country?: string | null;
  city?: string | null;
};

type DefaultsShape = {
  fallbackEstimatedWithholdingFraction: number;
  byCountry?: Record<string, { estimatedWithholdingFraction: number }>;
  byCountryCity?: Record<string, { estimatedWithholdingFraction: number }>;
};

const defaults = defaultsFile as DefaultsShape;

/**
 * Normalize city for matching rows in location-income-tax-defaults.json (`by_country_city` keys).
 */
export function slugifyHouseholdCity(city: string | null | undefined): string | null {
  const t = city?.trim();
  if (!t) return null;
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * Illustrative default income withholding as a fraction of gross (same convention as TaxProfile.flat_rate).
 * Used only when projection has no per-entity TaxProfile row; values come from app data JSON, not literals.
 */
export function resolveDefaultEstimatedWithholdingFraction(loc: HouseholdTaxLocationInput): number {
  const country = loc.country?.trim().toUpperCase() ?? "";
  const slug = slugifyHouseholdCity(loc.city ?? undefined);
  if (country && slug) {
    const ck = `${country}|${slug}`;
    const cc = defaults.byCountryCity?.[ck];
    if (cc != null && Number.isFinite(cc.estimatedWithholdingFraction)) return cc.estimatedWithholdingFraction;
  }
  if (country) {
    const c = defaults.byCountry?.[country];
    if (c != null && Number.isFinite(c.estimatedWithholdingFraction)) return c.estimatedWithholdingFraction;
  }
  return defaults.fallbackEstimatedWithholdingFraction;
}
