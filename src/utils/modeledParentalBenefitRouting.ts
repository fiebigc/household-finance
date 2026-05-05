/**
 * Entity.metadata key for optional Finance Flow routing for modeled föräldrapenning
 * (projection-only — same semantics as income cashflow from/to legs).
 */
export const MODELED_PARENTAL_BENEFIT_ROUTING_META = "modeled_parental_benefit_routing_v1";

export type ModeledParentalBenefitRouting = {
  from_account_id: string | null;
  to_account_id: string | null;
};

export function readModeledParentalBenefitRouting(
  metadata: Record<string, unknown> | undefined,
): ModeledParentalBenefitRouting {
  const raw = metadata?.[MODELED_PARENTAL_BENEFIT_ROUTING_META];
  if (!raw || typeof raw !== "object") return { from_account_id: null, to_account_id: null };
  const o = raw as Record<string, unknown>;
  const from = o.from_account_id;
  const to = o.to_account_id;
  return {
    from_account_id: typeof from === "string" ? from : null,
    to_account_id: typeof to === "string" ? to : null,
  };
}

export function mergeModeledParentalBenefitRouting(
  metadata: Record<string, unknown>,
  routing: ModeledParentalBenefitRouting,
): Record<string, unknown> {
  return {
    ...metadata,
    [MODELED_PARENTAL_BENEFIT_ROUTING_META]: routing,
  };
}
