import type { Account, Transaction } from "@/types/schema";

export type RecurringTxPattern = {
  /** Normalized transaction text (Specifikation). */
  label: string;
  direction: "in" | "out";
  /** Signed amount (bank convention: negative = money out). */
  typicalAmount: number;
  /** Number of matching rows in history. */
  count: number;
  lastDate: string;
};

const BANKISH = new Set<Account["type"]>(["bank", "savings", "credit"]);

/** Same normalization as grouping keys in {@link detectRecurringFromTransactions} — use when matching to saved cashflow names. */
export function normalizeRecurringImportLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ");
}

/** Group imported tx by description; keep groups with stable sign and ≥2 hits (recurring candidates). */
export function detectRecurringFromTransactions(
  txs: Transaction[],
  accounts: Account[],
): RecurringTxPattern[] {
  const allowedIds = new Set(
    accounts.filter((a) => !a.archived_at && BANKISH.has(a.type)).map((a) => a.id),
  );
  const filtered = txs.filter((t) => allowedIds.has(t.account_id));
  const byDesc = new Map<string, Transaction[]>();

  for (const t of filtered) {
    const k = normalizeRecurringImportLabel(t.description);
    if (k.length < 2) continue;
    const arr = byDesc.get(k) ?? [];
    arr.push(t);
    byDesc.set(k, arr);
  }

  const out: RecurringTxPattern[] = [];
  for (const [label, arr] of byDesc) {
    if (arr.length < 2) continue;
    const amounts = arr.map((x) => x.amount);
    const allNonNeg = amounts.every((a) => a >= 0);
    const allNonPos = amounts.every((a) => a <= 0);
    if (!allNonNeg && !allNonPos) continue;

    const sortedAmt = [...amounts].sort((a, b) => a - b);
    const mid = sortedAmt[Math.floor(sortedAmt.length / 2)];
    const direction: "in" | "out" = mid >= 0 ? "in" : "out";
    const dates = arr.map((x) => x.date).sort();
    out.push({
      label,
      direction,
      typicalAmount: mid,
      count: arr.length,
      lastDate: dates[dates.length - 1] ?? "",
    });
  }

  out.sort(
    (a, b) => Math.abs(b.typicalAmount) * b.count - Math.abs(a.typicalAmount) * a.count,
  );
  return out.slice(0, 30);
}
