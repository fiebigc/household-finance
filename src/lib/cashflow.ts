import { stockholmTabellMonthlyNetFromMonthlyGrossCombined } from "@/lib/swedenStockholmTax";

export type PersonaWorkParams = {
  workHoursPerWeek: number;
  daycareChildren: number;
  parentalLeavePercent: number;
  akassaPercent: number;
  startaEgetPercent: number;
};

export const DEFAULT_WORK_PARAMS: PersonaWorkParams = {
  workHoursPerWeek: 40,
  daycareChildren: 0,
  parentalLeavePercent: 0,
  akassaPercent: 0,
  startaEgetPercent: 0,
};

export type Persona = {
  id: string;
  name: string;
  type: "person" | "company";
  workParams: PersonaWorkParams;
};

export type ExpenseItem = {
  id: string;
  /** Free-text title, e.g. "Hyra", "Barnomsorg". */
  title: string;
  /** Monthly amount in SEK (positive number). */
  amountSek: number;
  personaId: string | null;
  /** Seeded from bank CSV heuristics vs user-entered. */
  source?: "manual" | "csv";
};

export type IncomeStream = {
  id: string;
  label: string;
  /** Monthly amount before tax (e.g. full-time salary quote). */
  preTaxMonthlySek: number;
  /** Work time 0–100 (e.g. 80 for 80%). Scales pre-tax into effective monthly gross. */
  workTimePercent: number;
  /** Which household member this income is attributed to (tax calculated per person group). */
  personaId: string | null;
  /** Seeded from bank CSV heuristics (amounts may be net benefits — adjust pre-tax as needed). */
  source?: "manual" | "csv";
};

export type CashflowMonthPoint = {
  monthIndex: number;
  monthLabel: string;
  incomeGrossScaled: number;
  incomeNet: number;
  expenses: number;
  netMonthly: number;
  cumulative: number;
};

function clampWorkPercent(n: number): number {
  if (Number.isNaN(n) || n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

/** Effective monthly gross from pre-tax quote × work time. */
export function effectiveMonthlyGross(stream: IncomeStream): number {
  const w = clampWorkPercent(stream.workTimePercent) / 100;
  return stream.preTaxMonthlySek * w;
}

function groupKey(personaId: string | null): string {
  return personaId ?? "unassigned";
}

/**
 * Sum monthly **net** employment income using Stockholm tabell-style curve **per persona**
 * (and one bucket for unassigned streams). Same person’s streams are combined before tax.
 */
export function totalMonthlyNetIncomeStockholm(streams: IncomeStream[]): { grossScaled: number; net: number } {
  const byGroup = new Map<string, IncomeStream[]>();
  let grossScaled = 0;
  for (const s of streams) {
    grossScaled += effectiveMonthlyGross(s);
    const k = groupKey(s.personaId);
    const list = byGroup.get(k) ?? [];
    list.push(s);
    byGroup.set(k, list);
  }

  let net = 0;
  for (const [, groupStreams] of byGroup) {
    const monthlyGrossGroup = groupStreams.reduce((sum, x) => sum + effectiveMonthlyGross(x), 0);
    net += stockholmTabellMonthlyNetFromMonthlyGrossCombined(monthlyGrossGroup);
  }

  return { grossScaled, net };
}

export function totalMonthlyExpenses(expenses: ExpenseItem[]): number {
  return expenses.reduce((sum, e) => sum + Math.max(0, e.amountSek), 0);
}

export type BuildCashflowSeriesOptions = {
  /** Zero-based index for `monthIndex` on first point (e.g. continue after historical months). */
  monthIndexOffset?: number;
  /** Custom X-axis labels; default `M1` … `M{n}`. */
  monthLabel?: (monthIndexInSeries: number) => string;
};

export function buildCashflowSeries(
  streams: IncomeStream[],
  expenses: ExpenseItem[],
  startingBalanceSek: number,
  months: number,
  options?: BuildCashflowSeriesOptions,
): CashflowMonthPoint[] {
  const { net: monthlyIncomeNet } = totalMonthlyNetIncomeStockholm(streams);
  const expenseTotal = totalMonthlyExpenses(expenses);
  const points: CashflowMonthPoint[] = [];
  let cumulative = startingBalanceSek;
  const grossScaled = streams.reduce((sum, s) => sum + effectiveMonthlyGross(s), 0);
  const offset = options?.monthIndexOffset ?? 0;

  for (let i = 0; i < months; i++) {
    const netMonthly = monthlyIncomeNet - expenseTotal;
    cumulative += netMonthly;
    points.push({
      monthIndex: offset + i,
      monthLabel: options?.monthLabel?.(i) ?? `M${i + 1}`,
      incomeGrossScaled: grossScaled,
      incomeNet: monthlyIncomeNet,
      expenses: expenseTotal,
      netMonthly,
      cumulative,
    });
  }

  return points;
}
