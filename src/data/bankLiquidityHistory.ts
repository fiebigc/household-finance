/**
 * End-of-month balance per liquidity account + combined.
 * Pure functions — no CSV imports. Accepts DB rows as input.
 */

export type AccountId = "household" | "shared" | "christian";

export type AccountBalancePoint = {
  period: string;
  label: string;
  household: number;
  shared: number;
  christian: number;
  combined: number;
};

export type LiquidityHistoryMeta = {
  fromPeriod: string;
  toPeriod: string;
  ok: boolean;
};

export type DbTransaction = {
  bank_account_id: string;
  transaction_date: string;
  specifikation: string;
  belopp: number;
  saldo: number | null;
};

const CHART_ACCOUNT_IDS: Record<string, AccountId> = {
  "household-12110506350": "household",
  "shared-24890598057": "shared",
  "christian-24890618775": "christian",
};

type SaldoRow = { dateStr: string; saldo: number; lineIndex: number };

function endOfMonthSaldoByPeriod(rows: SaldoRow[]): Map<string, number> {
  const sorted = [...rows].sort((a, b) => {
    const c = a.dateStr.localeCompare(b.dateStr);
    return c !== 0 ? c : b.lineIndex - a.lineIndex;
  });
  const map = new Map<string, number>();
  for (const r of sorted) map.set(r.dateStr.slice(0, 7), r.saldo);
  return map;
}

function monthKeysInclusive(from: string, to: string): string[] {
  const keys: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    keys.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return keys;
}

export function addCalendarMonths(ym: string, delta: number): string {
  const [y0, m0] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y0, m0 - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function formatYearMonthPeriod(period: string, localeBcp47: string): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return new Intl.DateTimeFormat(localeBcp47, { month: "short", year: "2-digit", timeZone: "UTC" }).format(d);
}

function forwardFill(sparse: Map<string, number>, timeline: string[]): Map<string, number> {
  const out = new Map<string, number>();
  let carry: number | undefined;
  for (const p of timeline) {
    if (sparse.has(p)) carry = sparse.get(p);
    if (carry !== undefined) out.set(p, carry);
  }
  return out;
}

export function buildAccountBalanceHistory(
  transactions: DbTransaction[],
  localeBcp47: string,
): { series: AccountBalancePoint[]; meta: LiquidityHistoryMeta } {
  const ACCOUNT_IDS: AccountId[] = ["household", "shared", "christian"];

  const grouped = new Map<AccountId, SaldoRow[]>();
  for (const id of ACCOUNT_IDS) grouped.set(id, []);

  for (const tx of transactions) {
    const mapped = CHART_ACCOUNT_IDS[tx.bank_account_id];
    if (!mapped || tx.saldo === null) continue;
    grouped.get(mapped)!.push({ dateStr: tx.transaction_date, saldo: tx.saldo, lineIndex: 0 });
  }

  const perAccount = new Map<AccountId, Map<string, number>>();
  for (const id of ACCOUNT_IDS) perAccount.set(id, endOfMonthSaldoByPeriod(grouped.get(id)!));

  const firstMonths = ACCOUNT_IDS.map((id) => {
    const keys = [...(perAccount.get(id)?.keys() ?? [])].sort();
    return keys[0] ?? null;
  });
  if (firstMonths.some((x) => x === null)) {
    return { series: [], meta: { fromPeriod: "", toPeriod: "", ok: false } };
  }

  const fromPeriod = firstMonths.reduce((a, b) => (a! > b! ? a! : b!))!;
  const lastMonths = ACCOUNT_IDS.map((id) => {
    const keys = [...(perAccount.get(id)?.keys() ?? [])].sort();
    return keys[keys.length - 1]!;
  });
  const toPeriod = lastMonths.reduce((a, b) => (a < b ? a : b));
  const timeline = monthKeysInclusive(fromPeriod, toPeriod);

  const filled = new Map<AccountId, Map<string, number>>();
  for (const id of ACCOUNT_IDS) filled.set(id, forwardFill(perAccount.get(id)!, timeline));

  const series: AccountBalancePoint[] = [];
  for (const p of timeline) {
    const h = filled.get("household")!.get(p);
    const s = filled.get("shared")!.get(p);
    const c = filled.get("christian")!.get(p);
    if (h === undefined || s === undefined || c === undefined) continue;
    series.push({
      period: p,
      label: formatYearMonthPeriod(p, localeBcp47),
      household: h, shared: s, christian: c, combined: h + s + c,
    });
  }

  return { series, meta: { fromPeriod, toPeriod, ok: series.length > 0 } };
}

export function nextPeriodAfterHistory(meta: LiquidityHistoryMeta): string | null {
  if (!meta.ok || !meta.toPeriod) return null;
  return addCalendarMonths(meta.toPeriod, 1);
}
