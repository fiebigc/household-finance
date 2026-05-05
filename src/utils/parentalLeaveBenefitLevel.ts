const PARENTAL_LEAVE_BENEFIT_LEVEL_LABELS: Record<string, string> = {
  SE: "SGI",
};

export function getParentalLeaveBenefitLevelLabel(country: string | null | undefined): string {
  const code = country?.trim().toUpperCase();
  return code ? PARENTAL_LEAVE_BENEFIT_LEVEL_LABELS[code] ?? "Benefit level" : "Benefit level";
}
