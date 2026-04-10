/**
 * Detects recurring income/expense lines from bank transactions and maps them to personas.
 * Pure function — accepts DB rows, no CSV imports.
 */
import type { ExpenseItem, IncomeStream } from "@/lib/cashflow";
import type { DbTransaction } from "@/data/bankLiquidityHistory";

export type CsvRecurringResult = {
  incomeStreams: IncomeStream[];
  expenses: ExpenseItem[];
  hasData: boolean;
};

type AccountKey = "christian" | "household" | "shared" | "bolanBuffer";

const ACCOUNT_KEY_MAP: Record<string, AccountKey> = {
  "christian-24890618775": "christian",
  "household-12110506350": "household",
  "shared-24890598057": "shared",
  "bolan-fast-24500343776-buffer": "bolanBuffer",
};

type TxRow = { account: AccountKey; specifikation: string; belopp: number; dateStr: string };

function normalizeSpecKey(spec: string): string {
  return spec.trim().replace(/\s+/g, " ").toLowerCase();
}

const GROCERY_RETAIL_RE = /\b(willys|ica\b|coop\b|hemk[öo]p|lidl|mathem|bauhaus|biltema|jula\b|ikea|hm\b|h&m)\b/i;

function shouldExcludeRow(account: AccountKey, spec: string): boolean {
  const raw = spec.trim();
  const l = normalizeSpecKey(spec);
  if (raw.length < 2) return true;
  if (l.startsWith("swish ")) return true;
  if (l.startsWith("till kortkto")) return true;
  if (l.startsWith("till mastercard")) return true;
  if (/^ofu\s/i.test(raw)) return true;
  if (account === "household" && /^monthly household (cf|hv)$/i.test(raw)) return true;
  if (account === "shared" && /^monthly apartment cf$/i.test(raw)) return true;
  if (account === "shared" && /^monthly apt payment$/i.test(raw)) return true;
  if (GROCERY_RETAIL_RE.test(raw)) return true;
  return false;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) return 0;
  const abs = values.map((v) => Math.abs(v));
  const mean = abs.reduce((s, v) => s + v, 0) / abs.length;
  if (mean === 0) return 0;
  const variance = abs.reduce((s, v) => s + (v - mean) ** 2, 0) / abs.length;
  return Math.sqrt(variance) / mean;
}

function stableId(kind: "in" | "out", account: AccountKey, specKey: string): string {
  const slug = `${account}-${specKey}`.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 72);
  return `csv-${kind}-${slug}`;
}

export function inferPersonaForRecurring(account: AccountKey, spec: string, flow: "in" | "out"): string | null {
  const l = spec.toLowerCase();
  if (l.includes("aaro") && l.includes("barnbidrag")) return "aaro";
  if (l.includes("unto") && l.includes("barnbidrag")) return "unto";
  if (flow === "in") {
    if (/\bbarnbdr\b/i.test(spec)) return null;
    if (/\bfkassa\b/i.test(spec) || /\ba[\s-]?kassa\b/i.test(spec)) return "christian";
    if (/^sk\d+/i.test(spec.trim())) return "christian";
    return null;
  }
  if (/\bbarnbdr\b/i.test(spec)) return null;
  if (/monthly household|monthly apartment/i.test(l)) return null;
  if (account === "shared" || account === "household" || account === "bolanBuffer") return null;
  if (account === "christian") return "christian";
  return null;
}

function collectGroups(txRows: TxRow[]) {
  const groups = new Map<string, { account: AccountKey; spec: string; amounts: number[]; months: Set<string> }>();
  for (const r of txRows) {
    if (shouldExcludeRow(r.account, r.specifikation)) continue;
    const key = `${r.account}::${normalizeSpecKey(r.specifikation)}`;
    const period = r.dateStr.slice(0, 7);
    let g = groups.get(key);
    if (!g) {
      g = { account: r.account, spec: r.specifikation.trim(), amounts: [], months: new Set() };
      groups.set(key, g);
    }
    g.amounts.push(r.belopp);
    g.months.add(period);
  }
  return groups;
}

const MIN_MONTHS_EXPENSE = 3;
const MIN_MONTHS_INCOME = 2;
const MIN_AMOUNT = 50;
const MAX_CV_EXPENSE = 0.35;
const MIN_REGULARITY_EXPENSE = 0.6;

function monthSpan(months: Set<string>): number {
  const sorted = [...months].sort();
  if (sorted.length < 2) return 1;
  const [fy, fm] = sorted[0]!.split("-").map(Number);
  const [ly, lm] = sorted[sorted.length - 1]!.split("-").map(Number);
  return (ly - fy) * 12 + (lm - fm) + 1;
}

export function extractRecurringFromBankImports(transactions: DbTransaction[]): CsvRecurringResult {
  const txRows: TxRow[] = [];
  for (const tx of transactions) {
    const account = ACCOUNT_KEY_MAP[tx.bank_account_id];
    if (!account) continue;
    txRows.push({ account, specifikation: tx.specifikation, belopp: tx.belopp, dateStr: tx.transaction_date });
  }

  const groups = collectGroups(txRows);
  const incomeStreams: IncomeStream[] = [];
  const expenses: ExpenseItem[] = [];

  for (const g of groups.values()) {
    const med = median(g.amounts);
    const isIncome = med > 0 && g.account !== "bolanBuffer";

    if (isIncome) {
      if (g.months.size < MIN_MONTHS_INCOME) continue;
    } else {
      if (g.months.size < MIN_MONTHS_EXPENSE) continue;
      const cv = coefficientOfVariation(g.amounts);
      if (cv > MAX_CV_EXPENSE) continue;
      const regularity = g.months.size / monthSpan(g.months);
      if (regularity < MIN_REGULARITY_EXPENSE) continue;
    }

    if (Math.abs(med) < MIN_AMOUNT) continue;

    const specKey = normalizeSpecKey(g.spec);
    const cleanLabel = g.spec.replace(/\s{2,}/g, " ").replace(/\)+$/g, "").trim();

    if (g.account === "bolanBuffer" && med > 0) {
      expenses.push({ id: stableId("out", g.account, specKey), title: cleanLabel, amountSek: Math.round(med), personaId: null, source: "csv" });
      continue;
    }

    if (med > 0) {
      incomeStreams.push({
        id: stableId("in", g.account, specKey), label: cleanLabel,
        preTaxMonthlySek: Math.round(med), workTimePercent: 100,
        personaId: inferPersonaForRecurring(g.account, g.spec, "in"), source: "csv",
      });
    } else {
      expenses.push({
        id: stableId("out", g.account, specKey), title: cleanLabel,
        amountSek: Math.round(Math.abs(med)),
        personaId: inferPersonaForRecurring(g.account, g.spec, "out"), source: "csv",
      });
    }
  }

  const sort = <T extends { personaId: string | null }>(arr: T[]) =>
    [...arr].sort((a, b) => (a.personaId ?? "").localeCompare(b.personaId ?? ""));

  return { incomeStreams: sort(incomeStreams), expenses: sort(expenses), hasData: incomeStreams.length + expenses.length > 0 };
}
