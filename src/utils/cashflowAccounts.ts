import type { Account, Cashflow } from "@/types/schema";

/** Account types usable as a “wallet” endpoint for budgeting (moving money household↔outside or between wallets). Loan accounts excluded — paying a mortgage is still P&amp;L. */
const ENDPOINT_TYPES = new Set<Account["type"]>([
  "bank",
  "savings",
  "investment",
  "credit",
  "pension",
]);

function walletEndpoint(acc: Account | undefined): boolean {
  return !!acc && !acc.archived_at && ENDPOINT_TYPES.has(acc.type);
}

/** Resolve from/to legs; prefers explicit columns; falls back to legacy `account_id` when only that is set. */
export function resolveCashflowAccountLegs(cf: Cashflow): { fromId: string | null; toId: string | null } {
  if (cf.from_account_id != null || cf.to_account_id != null) {
    return {
      fromId: cf.from_account_id ?? null,
      toId: cf.to_account_id ?? null,
    };
  }
  if (cf.account_id) {
    if (cf.direction === "income") return { fromId: null, toId: cf.account_id };
    return { fromId: cf.account_id, toId: null };
  }
  return { fromId: null, toId: null };
}

/** True when resolved From and To are both concrete accounts — neither UI leg is Outside household. Legacy single-leg rows resolve to one outside endpoint → false. */
export function hasCashflowBothHouseholdLegs(cf: Cashflow): boolean {
  const { fromId, toId } = resolveCashflowAccountLegs(cf);
  return fromId != null && toId != null;
}

/**
 * Household-internal move between two liquidity accounts (checking/savings/card/investment/pension).
 * Money moving to/from a loan account is still economically an expense/principal repayment.
 */
export function isInternalLiquidityCashflow(cf: Cashflow, accounts: Account[]): boolean {
  const { fromId, toId } = resolveCashflowAccountLegs(cf);
  if (!fromId || !toId || fromId === toId) return false;
  const byId = new Map(accounts.filter((a) => !a.archived_at).map((a) => [a.id, a]));
  const a = byId.get(fromId);
  const b = byId.get(toId);
  return walletEndpoint(a) && walletEndpoint(b);
}

/** Salary, taxes, groceries, mortgage payment, … — excludes same-account-internal liquidity moves only. */
export function cashflowContributesToPnLTotals(cf: Cashflow, accounts: Account[]): boolean {
  return !isInternalLiquidityCashflow(cf, accounts);
}

/** Primary attachment for backends that expect single `account_id`. */
export function primaryCashflowAccountId(cf: Cashflow): string | null {
  const { fromId, toId } = resolveCashflowAccountLegs(cf);
  if (fromId ?? toId) return toId ?? fromId ?? null;
  return cf.account_id ?? null;
}

/** Hydrate persisted rows that omit `from_account_id` / `to_account_id`. */
export function hydrateCashflow(c: Cashflow): Cashflow {
  return {
    ...c,
    from_account_id: c.from_account_id ?? null,
    to_account_id: c.to_account_id ?? null,
    employment_active_from: c.employment_active_from ?? null,
    employment_active_until: c.employment_active_until ?? null,
    metadata: c.metadata ?? null,
  };
}

function formatAccountLegLabels(fromId: string | null, toId: string | null, accounts: Account[]): string {
  const label = (id: string | null) => {
    if (!id) return "Outside household";
    return accounts.find((a) => a.id === id)?.name ?? id.slice(0, 8) + "…";
  };
  return `${label(fromId)} → ${label(toId)}`;
}

/** Short label for dropdowns / list rows (`Outside household` = null leg). */
export function formatCashflowAccountRoute(cf: Cashflow, accounts: Account[]): string {
  const { fromId, toId } = resolveCashflowAccountLegs(cf);
  return formatAccountLegLabels(fromId, toId, accounts);
}

/** Same route string as cashflow legs; use for modeled income without a cashflow row. */
export function formatAccountLegPair(
  fromId: string | null,
  toId: string | null,
  accounts: Account[],
): string {
  return formatAccountLegLabels(fromId, toId, accounts);
}
