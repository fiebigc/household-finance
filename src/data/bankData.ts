import christianCsv from "../../docs/bank/AccountChristian-24890618775-20260408.csv?raw";
import sharedCsv from "../../docs/bank/AccountShared-24890598057-20260408.csv?raw";
import householdCsv from "../../docs/bank/AccountHousehold-12110506350-20260408.csv?raw";
import xlSavingsCsv from "../../docs/bank/AccountXLSavings-12110506342-20260408.csv?raw";
import mastercardCsv from "../../docs/bank/MastercardGuld-24890598081-20260408.csv?raw";

export type EntityType = "adult" | "child" | "company" | "shared";

export interface EntityRecord {
  id: string;
  name: string;
  type: EntityType;
  notes: string;
}

export interface BankAccountRecord {
  id: string;
  name: string;
  accountNumber: string;
  ownerEntityId: string;
  category: "bank" | "loan" | "credit";
  currentBalanceSek: number;
}

export interface MonthlySeriesPoint {
  month: string;
  totalIncomeSek: number;
  totalCostSek: number;
  netCashflowSek: number;
  byAccountNetSek: Record<string, number>;
}

export type RecurringKind = "expense" | "income";

export interface RecurringCost {
  id: string;
  label: string;
  /** Positive magnitude (same for income and expense). */
  amountSek: number;
  kind: RecurringKind;
  assignedEntityId: string;
  laneOrder: number;
}

interface CsvTransaction {
  dateIso: string;
  amountSek: number;
  accountId: string;
}

export const ENTITY_IDS = {
  HELI: "entity-heli",
  CHRISTIAN: "entity-christian",
  AARO: "entity-aaro",
  UNTO: "entity-unto",
  TYPOLOGY: "entity-typology-network-ab",
  SHARED: "entity-shared",
} as const;

export const defaultEntities: EntityRecord[] = [
  { id: ENTITY_IDS.HELI, name: "Heli", type: "adult", notes: "" },
  { id: ENTITY_IDS.CHRISTIAN, name: "Christian", type: "adult", notes: "" },
  { id: ENTITY_IDS.AARO, name: "Aaro", type: "child", notes: "" },
  { id: ENTITY_IDS.UNTO, name: "Unto", type: "child", notes: "" },
  {
    id: ENTITY_IDS.TYPOLOGY,
    name: "Typology Network AB",
    type: "company",
    notes: "",
  },
  { id: ENTITY_IDS.SHARED, name: "Shared", type: "shared", notes: "" },
];

export const defaultBankAccounts: BankAccountRecord[] = [
  {
    id: "acc-christian",
    name: "Account Christian",
    accountNumber: "24890618775",
    ownerEntityId: ENTITY_IDS.CHRISTIAN,
    category: "bank",
    currentBalanceSek: 13312.27,
  },
  {
    id: "acc-aaro-investment",
    name: "Aaro Investment",
    accountNumber: "12430942445",
    ownerEntityId: ENTITY_IDS.AARO,
    category: "bank",
    currentBalanceSek: 1250,
  },
  {
    id: "acc-household",
    name: "Account Household",
    accountNumber: "12110506350",
    ownerEntityId: ENTITY_IDS.SHARED,
    category: "bank",
    currentBalanceSek: 11045.29,
  },
  {
    id: "acc-shared",
    name: "Account Shared",
    accountNumber: "24890598057",
    ownerEntityId: ENTITY_IDS.SHARED,
    category: "bank",
    currentBalanceSek: 62526.36,
  },
  {
    id: "acc-xl-savings",
    name: "Account XL Savings",
    accountNumber: "12110506342",
    ownerEntityId: ENTITY_IDS.SHARED,
    category: "bank",
    currentBalanceSek: 5363.28,
  },
  {
    id: "loan-fast-1",
    name: "Bolån Fast Hypotek",
    accountNumber: "13460879831",
    ownerEntityId: ENTITY_IDS.SHARED,
    category: "loan",
    currentBalanceSek: -1016500,
  },
  {
    id: "loan-fast-2",
    name: "Bolån Fast Hypotek",
    accountNumber: "24500343776",
    ownerEntityId: ENTITY_IDS.SHARED,
    category: "loan",
    currentBalanceSek: -750000,
  },
  {
    id: "loan-prem",
    name: "Bolån Prem Hypotek",
    accountNumber: "24500343784",
    ownerEntityId: ENTITY_IDS.SHARED,
    category: "loan",
    currentBalanceSek: -266500,
  },
  {
    id: "acc-june",
    name: "June",
    accountNumber: "13800152584",
    ownerEntityId: ENTITY_IDS.CHRISTIAN,
    category: "bank",
    currentBalanceSek: 0.02,
  },
  {
    id: "acc-mastercard",
    name: "Mastercard Guld",
    accountNumber: "24890598081",
    ownerEntityId: ENTITY_IDS.CHRISTIAN,
    category: "credit",
    currentBalanceSek: -3493.25,
  },
  {
    id: "acc-sparkonto",
    name: "Sparkonto",
    accountNumber: "12190637430",
    ownerEntityId: ENTITY_IDS.CHRISTIAN,
    category: "bank",
    currentBalanceSek: 0,
  },
];

/** Parsed row including counterparty text (used for recurring detection). */
export interface ParsedBankRow {
  dateIso: string;
  specification: string;
  amountSek: number;
  accountId: string;
}

function parseSek(value: string): number {
  const normalized = value
    .replace(/"/g, "")
    .trim()
    .replace(/\./g, "")
    .replace(",", ".");
  return Number(normalized || "0");
}

function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .replace(/"/g, "")
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/�/g, "")
    .toLowerCase();
}

function parseCsvTransactions(csvRaw: string, accountId: string): CsvTransaction[] {
  const lines = csvRaw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < 2) return [];
  const headerLine = lines[0];
  if (!headerLine) return [];
  const headerParts = headerLine.split(";").map((p) => normalizeHeader(p));
  const dateIdx = headerParts.findIndex(
    (h) => h.includes("bokforings") || (h.includes("bokf") && h.includes("dag")),
  );
  const amountIdx = headerParts.findIndex((h) => h.includes("belopp"));
  const statusIdx = headerParts.findIndex((h) => h.includes("status"));
  const rows = lines.slice(1);

  if (dateIdx < 0 || amountIdx < 0) {
    return [];
  }

  const result: CsvTransaction[] = [];
  for (const row of rows) {
    const parts = row.split(";").map((p) => p.trim());
    const date = parts[dateIdx]?.replace(/"/g, "");
    const amountRaw = parts[amountIdx];
    const status =
      statusIdx >= 0 ? parts[statusIdx]?.replace(/"/g, "").trim() : undefined;
    if (!date || !amountRaw) continue;
    const normalizedStatus = (status ?? "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    // Keep row by default; only reject explicit failed/declined statuses.
    if (
      normalizedStatus.includes("avvisad") ||
      normalizedStatus.includes("failed") ||
      normalizedStatus.includes("declined")
    ) {
      continue;
    }
    result.push({
      dateIso: date,
      amountSek: parseSek(amountRaw),
      accountId,
    });
  }
  return result;
}

function parseCsvRowsDetailed(csvRaw: string, accountId: string): ParsedBankRow[] {
  const lines = csvRaw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < 2) return [];
  const headerLine = lines[0];
  if (!headerLine) return [];
  const headerParts = headerLine.split(";").map((p) => normalizeHeader(p));
  const dateIdx = headerParts.findIndex(
    (h) => h.includes("bokforings") || (h.includes("bokf") && h.includes("dag")),
  );
  const amountIdx = headerParts.findIndex((h) => h.includes("belopp"));
  const specIdx = headerParts.findIndex((h) => h.includes("specifik"));
  const statusIdx = headerParts.findIndex((h) => h.includes("status"));
  const rows = lines.slice(1);

  if (dateIdx < 0 || amountIdx < 0 || specIdx < 0) {
    return [];
  }

  const result: ParsedBankRow[] = [];
  for (const row of rows) {
    const parts = row.split(";").map((p) => p.trim());
    const date = parts[dateIdx]?.replace(/"/g, "");
    const amountRaw = parts[amountIdx];
    const spec = parts[specIdx]?.replace(/"/g, "") ?? "";
    const status =
      statusIdx >= 0 ? parts[statusIdx]?.replace(/"/g, "").trim() : undefined;
    if (!date || !amountRaw) continue;
    const normalizedStatus = (status ?? "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    if (
      normalizedStatus.includes("avvisad") ||
      normalizedStatus.includes("failed") ||
      normalizedStatus.includes("declined")
    ) {
      continue;
    }
    result.push({
      dateIso: date,
      specification: spec,
      amountSek: parseSek(amountRaw),
      accountId,
    });
  }
  return result;
}

function medianAbs(values: number[]): number {
  const v = values.map((x) => Math.abs(x)).sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  if (v.length === 0) return 0;
  return v.length % 2 ? v[m]! : ((v[m - 1]! + v[m]!) / 2);
}

function coefficientOfVariation(absAmounts: number[]): number {
  if (absAmounts.length < 2) return 0;
  const mean = absAmounts.reduce((a, b) => a + b, 0) / absAmounts.length;
  if (mean < 1e-6) return 999;
  const variance =
    absAmounts.reduce((s, x) => s + (x - mean) ** 2, 0) / (absAmounts.length - 1);
  return Math.sqrt(variance) / mean;
}

function amountClusterStable(absAmounts: number[]): { ok: boolean; median: number } {
  if (absAmounts.length < 2) return { ok: false, median: medianAbs(absAmounts) };
  const med = medianAbs(absAmounts);
  if (med < 12) return { ok: false, median: med };
  const min = Math.min(...absAmounts);
  const max = Math.max(...absAmounts);
  const spread = max - min;
  if (spread > Math.max(10, med * 0.09)) return { ok: false, median: med };
  if (coefficientOfVariation(absAmounts) > 0.055) return { ok: false, median: med };
  return { ok: true, median: med };
}

function canonicalSpecKey(raw: string): string {
  const t = raw
    .replace(/"/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!t) return "";
  if (t.includes("cursor")) return "merchant:cursor_ai";
  if (t.includes("amazon prime")) return "merchant:amazon_prime";
  if (t.includes("unionen")) return "merchant:unionen";
  if (t.includes("ownit")) return "merchant:ownit";
  if (t.includes("folksam")) return "merchant:folksam";
  if (t.includes("fkassa") || t.includes("f-kassa")) return "income:fkassa";
  if (t.includes("barnbdr") || t.includes("barnbidrag")) return "income:barnbidrag";
  if (t.startsWith("ofu ")) return "income:ofu_salary";
  return `text:${t.slice(0, 72)}`;
}

function prettyRecurringLabel(raw: string): string {
  const t = raw.replace(/"/g, "").trim();
  if (/cursor/i.test(t)) return "Cursor AI";
  if (/amazon prime/i.test(t)) return "Amazon Prime";
  if (/unionen/i.test(t)) return "Unionen";
  if (/^ownit$/i.test(t.trim())) return "Ownit";
  if (/folksam/i.test(t)) return "Folksam";
  return t.length > 44 ? `${t.slice(0, 42)}…` : t;
}

function isExcludedBankRow(row: ParsedBankRow): boolean {
  const t = row.specification.replace(/"/g, "").trim();
  const lower = t.toLowerCase();
  const norm = lower.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  if (row.amountSek >= 0) return true;
  if (/swish/i.test(norm)) return true;
  if (/(^|[\s;])l[aå]n:/i.test(norm)) return true;
  if (/^inbetalning$/i.test(lower.trim())) return true;
  if (/monthly (apartment|apt) (cf|payment)/i.test(norm)) return true;
  if (/monthly household (cf|hv)$/i.test(norm)) return true;
  if (/barnbidrag cf|s barnbidrag cf/i.test(norm)) return true;
  if (/danske bank sverige/i.test(norm)) return true;
  if (/sj[oö]tr[aä]dg/i.test(norm)) return true;
  // Credit-card interest and reminder fees vary; micro-merchants are not fixed subscriptions.
  if (/r[aä]nta|\brnta\b|interest/i.test(norm)) return true;
  if (/minnelse|avgift.*minnelse|paminnelse|pamin/i.test(norm)) return true;
  if (/tipt?app|tipp?app|tipptapp/i.test(norm)) return true;
  // Internal savings transfers — amounts/schedules differ from subscription bills.
  if (/june\s*spara|monthly\s+savings/i.test(norm)) return true;
  return false;
}

function isExcludedIncomeRow(row: ParsedBankRow): boolean {
  const t = row.specification.replace(/"/g, "").trim();
  const lower = t.toLowerCase();
  const norm = lower.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  if (row.amountSek <= 0) return true;
  if (/swish/i.test(norm)) return true;
  if (/monthly (apartment|apt) (cf|payment)/i.test(norm)) return true;
  if (/monthly household (cf|hv)/i.test(norm)) return true;
  if (/^inbetalning$/i.test(lower.trim())) return true;
  if (/(^|[\s;])l[aå]n:/i.test(norm)) return true;
  if (/danske bank sverige/i.test(norm)) return true;
  if (/sj[oö]tr[aä]dg/i.test(norm)) return true;
  return false;
}

function inferAssignedEntityId(
  primaryAccountId: string,
  canonicalKey: string,
  displayLabel: string,
): string {
  const blob = `${canonicalKey} ${displayLabel}`.toLowerCase();
  if (
    /monthly household|monthly apartment|folksam|ownit|ellevio|merchant:folksam|merchant:ownit/.test(
      blob,
    )
  ) {
    return ENTITY_IDS.SHARED;
  }
  const acc = defaultBankAccounts.find((a) => a.id === primaryAccountId);
  return acc?.ownerEntityId ?? ENTITY_IDS.SHARED;
}

function stableRecurringId(key: string, amount: number, kind: RecurringKind): string {
  let h = 0;
  const s = `${kind}|${key}|${amount}`;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return `rc-${Math.abs(h).toString(36)}`;
}

type RecurringCandidate = {
  key: string;
  displayLabel: string;
  monthlyAmountSek: number;
  primaryAccountId: string;
  assignedEntityId: string;
};

function collectRecurringCandidates(rows: ParsedBankRow[]): RecurringCandidate[] {
  const groups = new Map<string, { key: string; displayLabel: string; rows: ParsedBankRow[] }>();

  for (const row of rows) {
    const key = canonicalSpecKey(row.specification);
    if (!key) continue;
    const label = prettyRecurringLabel(row.specification);
    const existing = groups.get(key);
    if (existing) {
      existing.rows.push(row);
    } else {
      groups.set(key, { key, displayLabel: label, rows: [row] });
    }
  }

  const candidates: RecurringCandidate[] = [];

  for (const g of groups.values()) {
    const months = new Set(g.rows.map((r) => r.dateIso.slice(0, 7)));
    if (months.size < 2 || g.rows.length < 3) continue;
    const absAmounts = g.rows.map((r) => Math.abs(r.amountSek));
    const stable = amountClusterStable(absAmounts);
    if (!stable.ok) continue;
    const monthlyAmountSek = Math.round(stable.median);
    if (monthlyAmountSek < 15) continue;

    const accountCounts = new Map<string, number>();
    for (const r of g.rows) {
      accountCounts.set(r.accountId, (accountCounts.get(r.accountId) ?? 0) + 1);
    }
    let primaryAccountId = g.rows[0]!.accountId;
    let best = 0;
    for (const [aid, c] of accountCounts) {
      if (c > best) {
        best = c;
        primaryAccountId = aid;
      }
    }

    candidates.push({
      key: g.key,
      displayLabel: g.displayLabel,
      monthlyAmountSek,
      primaryAccountId,
      assignedEntityId: inferAssignedEntityId(
        primaryAccountId,
        g.key,
        g.displayLabel,
      ),
    });
  }

  return candidates;
}

function candidatesToRecurringCosts(
  candidates: RecurringCandidate[],
  kind: RecurringKind,
): RecurringCost[] {
  candidates.sort((a, b) => b.monthlyAmountSek - a.monthlyAmountSek);

  const byEntity = new Map<string, RecurringCandidate[]>();
  for (const c of candidates) {
    const list = byEntity.get(c.assignedEntityId) ?? [];
    list.push(c);
    byEntity.set(c.assignedEntityId, list);
  }

  const out: RecurringCost[] = [];
  for (const [, list] of byEntity) {
    list.sort((a, b) => b.monthlyAmountSek - a.monthlyAmountSek);
    list.forEach((c, laneOrder) => {
      out.push({
        id: stableRecurringId(c.key, c.monthlyAmountSek, kind),
        label: c.displayLabel,
        amountSek: c.monthlyAmountSek,
        kind,
        assignedEntityId: c.assignedEntityId,
        laneOrder,
      });
    });
  }

  out.sort((a, b) => {
    const ea = a.assignedEntityId.localeCompare(b.assignedEntityId);
    if (ea !== 0) return ea;
    return a.laneOrder - b.laneOrder;
  });

  return out;
}

/**
 * Detects repeating monthly inflows and outflows from bundled CSVs (heuristic).
 */
export function buildRecurringCostsFromCsv(): RecurringCost[] {
  const allRows: ParsedBankRow[] = [
    ...parseCsvRowsDetailed(christianCsv, "acc-christian"),
    ...parseCsvRowsDetailed(sharedCsv, "acc-shared"),
    ...parseCsvRowsDetailed(householdCsv, "acc-household"),
    ...parseCsvRowsDetailed(xlSavingsCsv, "acc-xl-savings"),
    ...parseCsvRowsDetailed(mastercardCsv, "acc-mastercard"),
  ];

  const expenseRows = allRows.filter((r) => !isExcludedBankRow(r));
  const incomeRows = allRows.filter((r) => !isExcludedIncomeRow(r));

  const expenseCandidates = collectRecurringCandidates(expenseRows);
  const incomeCandidates = collectRecurringCandidates(incomeRows);

  return [
    ...candidatesToRecurringCosts(expenseCandidates, "expense"),
    ...candidatesToRecurringCosts(incomeCandidates, "income"),
  ];
}

/** Initial recurring rows derived from bundled CSVs (see `buildRecurringCostsFromCsv`). */
export const defaultRecurringCosts: RecurringCost[] = buildRecurringCostsFromCsv();

export function buildMonthlySeriesFromCsv(): MonthlySeriesPoint[] {
  const transactions: CsvTransaction[] = [
    ...parseCsvTransactions(christianCsv, "acc-christian"),
    ...parseCsvTransactions(sharedCsv, "acc-shared"),
    ...parseCsvTransactions(householdCsv, "acc-household"),
    ...parseCsvTransactions(xlSavingsCsv, "acc-xl-savings"),
    ...parseCsvTransactions(mastercardCsv, "acc-mastercard"),
  ];

  const bucket = new Map<string, MonthlySeriesPoint>();
  for (const tx of transactions) {
    const month = tx.dateIso.slice(0, 7);
    const existing = bucket.get(month) ?? {
      month,
      totalIncomeSek: 0,
      totalCostSek: 0,
      netCashflowSek: 0,
      byAccountNetSek: {},
    };
    if (tx.amountSek >= 0) {
      existing.totalIncomeSek += tx.amountSek;
    } else {
      existing.totalCostSek += Math.abs(tx.amountSek);
    }
    existing.netCashflowSek += tx.amountSek;
    existing.byAccountNetSek[tx.accountId] =
      (existing.byAccountNetSek[tx.accountId] ?? 0) + tx.amountSek;
    bucket.set(month, existing);
  }

  return Array.from(bucket.values()).sort((a, b) => a.month.localeCompare(b.month));
}

