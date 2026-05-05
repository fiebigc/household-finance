import type { Account } from "@/types/schema";

export type AccountSharedMetadata = {
  shared?: boolean;
  /** All entities that should see this joint account (includes primary entity_id). */
  co_entity_ids?: string[];
};

export function readSharedMeta(a: Account): AccountSharedMetadata {
  const m = a.metadata;
  if (!m || typeof m !== "object") return {};
  return m as AccountSharedMetadata;
}

export function isSharedAccount(a: Account): boolean {
  const m = readSharedMeta(a);
  return m.shared === true && Array.isArray(m.co_entity_ids) && m.co_entity_ids.length > 0;
}

/** Personal (non-shared) accounts owned by this entity. */
export function isPersonalAccountForEntity(a: Account, entityId: string): boolean {
  return !isSharedAccount(a) && a.entity_id === entityId;
}

/** Shared or personal account visible when viewing an entity. */
export function accountVisibleForEntity(a: Account, entityId: string): boolean {
  if (isSharedAccount(a)) {
    const ids = readSharedMeta(a).co_entity_ids;
    return ids?.includes(entityId) ?? false;
  }
  return a.entity_id === entityId;
}

/** Bank / savings / … — same “wallet” notion as cashflow internal-transfer detection. */
export const HOUSEHOLD_LIQUIDITY_ACCOUNT_TYPES = new Set<Account["type"]>([
  "bank",
  "savings",
  "investment",
  "credit",
  "pension",
]);

/**
 * Accounts eligible for cashflow From/To routing for this household: any liquidity account
 * owned by a household entity or shared with co-owners in the household. This is broader than
 * {@link accountVisibleForEntity} so you can attach e.g. salary to a joint account while the
 * cashflow is still tagged to one adult.
 */
export function accountsVisibleForHouseholdCashflowRouting(
  accounts: Account[],
  householdEntityIds: Set<string>,
): Account[] {
  return accounts.filter((a) => {
    if (a.archived_at) return false;
    if (!HOUSEHOLD_LIQUIDITY_ACCOUNT_TYPES.has(a.type)) return false;
    if (isSharedAccount(a)) {
      const co = readSharedMeta(a).co_entity_ids ?? [];
      return co.some((id) => householdEntityIds.has(id));
    }
    return householdEntityIds.has(a.entity_id);
  });
}

/** Dropdown label: disambiguate personal vs joint. */
export function labelAccountForCashflowLeg(
  a: Account,
  entities: { id: string; name: string }[],
): string {
  if (isSharedAccount(a)) return `${a.name} (shared)`;
  const owner = entities.find((e) => e.id === a.entity_id);
  return `${a.name} (${owner?.name ?? "…"})`;
}
