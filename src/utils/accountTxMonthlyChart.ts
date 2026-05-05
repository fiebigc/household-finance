import type { Account, Transaction } from "@/types/schema";

const BANKISH = new Set<Account["type"]>(["bank", "savings", "credit", "investment"]);

export type AccountFlowSeries = { id: string; name: string; shortLabel: string };

export type MonthlyAccountFlowDatum = {
  monthKey: string;
  monthLabel: string;
  totalIn: number;
  totalOut: number;
} & Record<string, string | number>;

export function chartShortAccountName(name: string, max = 14): string {
  const t = name.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

function formatMonthKey(monthKey: string): string {
  const [ys, ms] = monthKey.split("-");
  const y = Number(ys);
  const m = Number(ms);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return monthKey;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleString("sv-SE", { month: "short", year: "numeric" });
}

/**
 * Monthly positive sums (inflow) and absolute negative sums (outflow) per bank-like account, for charts.
 */
export function buildMonthlyAccountFlowChartData(
  accounts: Account[],
  transactions: Transaction[],
  options?: { maxMonths?: number },
): { data: MonthlyAccountFlowDatum[]; series: AccountFlowSeries[] } {
  const maxMonths = options?.maxMonths ?? 14;
  const accList = accounts.filter((a) => !a.archived_at && BANKISH.has(a.type));
  const accIds = new Set(accList.map((a) => a.id));
  const txs = transactions.filter((t) => accIds.has(t.account_id));

  const monthSet = new Set(txs.map((t) => t.date.slice(0, 7)));
  let months = [...monthSet].sort();
  if (months.length > maxMonths) months = months.slice(-maxMonths);

  const series: AccountFlowSeries[] = accList.map((a) => ({
    id: a.id,
    name: a.name,
    shortLabel: chartShortAccountName(a.name),
  }));

  if (months.length === 0 || accList.length === 0) {
    return { data: [], series };
  }

  const byMonth = new Map<string, Map<string, { inf: number; out: number }>>();
  for (const t of txs) {
    const mk = t.date.slice(0, 7);
    if (!months.includes(mk)) continue;
    let inner = byMonth.get(mk);
    if (!inner) {
      inner = new Map();
      byMonth.set(mk, inner);
    }
    let cell = inner.get(t.account_id);
    if (!cell) {
      cell = { inf: 0, out: 0 };
      inner.set(t.account_id, cell);
    }
    if (t.amount >= 0) cell.inf += t.amount;
    else cell.out += Math.abs(t.amount);
  }

  const data: MonthlyAccountFlowDatum[] = months.map((mk) => {
    const inner = byMonth.get(mk) ?? new Map();
    const row: MonthlyAccountFlowDatum = {
      monthKey: mk,
      monthLabel: formatMonthKey(mk),
      totalIn: 0,
      totalOut: 0,
    };
    for (const a of accList) {
      const cell = inner.get(a.id) ?? { inf: 0, out: 0 };
      const ink = `in_${a.id}`;
      const outk = `out_${a.id}`;
      row[ink] = cell.inf;
      row[outk] = cell.out;
      row.totalIn += cell.inf;
      row.totalOut += cell.out;
    }
    return row;
  });

  return { data, series };
}
