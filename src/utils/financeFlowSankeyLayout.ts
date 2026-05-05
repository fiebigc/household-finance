import type { Account, Cashflow } from "@/types/schema";
import { HOUSEHOLD_LIQUIDITY_ACCOUNT_TYPES, isSharedAccount } from "@/utils/accountShared";
import { resolveCashflowAccountLegs, cashflowContributesToPnLTotals } from "@/utils/cashflowAccounts";
import {
  cashflowExcludedFromHouseholdTotals,
  cashflowIncomeInternalHideFromFlow,
} from "@/utils/cashflowIncomeVisibility";
import { employmentIncomeShownInCashflowsManager } from "@/utils/cashflowEmployment";
import { cashflowMonthlyAmount } from "@/utils/incomeCashflowMonth";
import { endOfMonth, startOfMonth } from "date-fns";

const PERSONAL_POOL = "p:__pool";
/** Right-column sinks so shared/personal node height matches sum of link thicknesses when budget totals differ. */
const OUT_HOUSEHOLD_SURPLUS = "out:__household_surplus";
const IN_PLANNING_GAP = "in:__planning_gap";

const FLOW_EPS = 0.5;

export interface FinanceSankeyNode {
  key: string;
  layer: 0 | 1 | 2 | 3;
  label: string;
}

export interface FinanceSankeyLink {
  source: string;
  target: string;
  value: number;
}

/** Modeled income not stored as cashflows (e.g. projection föräldrapenning net). */
export interface SankeySyntheticIncome {
  entityId: string;
  monthlyNet: number;
  /** Optional routing from entity metadata — same roles as income cashflow legs (FK → deposit). */
  from_account_id?: string | null;
  to_account_id?: string | null;
}

const SYNTHETIC_PARENTAL_INCOME_KEY = "foraldrapenning";

function liquidityWallet(acc: Account | undefined): boolean {
  return !!acc && !acc.archived_at && HOUSEHOLD_LIQUIDITY_ACCOUNT_TYPES.has(acc.type);
}

function sharedLiquidityAccounts(accounts: Account[]): Account[] {
  return accounts.filter((a) => !a.archived_at && liquidityWallet(a) && isSharedAccount(a));
}

/**
 * When a cashflow has no usable From shared account we attribute outflows to one real joint account
 * so the diagram never creates a stray synthetic-only sink pinned to the last column beside expenses.
 */
function defaultSharedLiquidityAccountId(accounts: Account[]): string | null {
  const joint = sharedLiquidityAccounts(accounts);
  if (joint.length === 0) return null;
  const sorted = [...joint].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  const householdNamed = sorted.find((a) => a.name.trim().toLowerCase().includes("household"));
  return (householdNamed ?? sorted[0]).id;
}

function sideForAccount(acc: Account | undefined): "personal" | "shared" | null {
  if (!liquidityWallet(acc)) return null;
  return isSharedAccount(acc!) ? "shared" : "personal";
}

function capitalizeCat(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/**
 * Build a 4-column Sankey graph for Recharts.
 *
 * Recharts assigns horizontal position by topological depth (hop count from sources). We enforce:
 *   income (0) → personal (1) → shared (2) → expense (3)
 *
 * Columns:
 *   0 = Income sources (outside household)
 *   1 = Personal accounts (+ personal pool when income is unattributed / to shared deposit)
 *   2 = Shared household liquidity accounts only (real accounts from data)
 *   3 = Expense categories
 */
export function buildFinanceFlowSankeyData(
  cashflows: Cashflow[],
  accounts: Account[],
  syntheticIncomes?: SankeySyntheticIncome[],
  /** Monthly SEK through Finance Flow (defaults to stored cashflow amount). Use projection-aligned net for income. */
  getIncomeFlowAmount?: (cf: Cashflow) => number,
  /** Calendar month for expense frequency → monthly equivalent (same rules as projection). */
  referenceMonth?: Date,
): { nodes: Array<FinanceSankeyNode & { total: number }>; links: FinanceSankeyLink[] } {
  const byId = new Map(accounts.filter((a) => !a.archived_at).map((a) => [a.id, a]));
  const monthStart = startOfMonth(referenceMonth ?? new Date());
  const monthEnd = endOfMonth(monthStart);

  const incomes = cashflows.filter(
    (c) =>
      c.direction === "income" &&
      cashflowContributesToPnLTotals(c, accounts) &&
      employmentIncomeShownInCashflowsManager(c) &&
      !cashflowIncomeInternalHideFromFlow(c) &&
      !cashflowExcludedFromHouseholdTotals(c),
  );
  const expenses = cashflows.filter(
    (c) =>
      c.direction === "expense" &&
      cashflowContributesToPnLTotals(c, accounts) &&
      !cashflowIncomeInternalHideFromFlow(c) &&
      !cashflowExcludedFromHouseholdTotals(c),
  );

  const syntheticIn =
    syntheticIncomes?.reduce((s, x) => s + (x.monthlyNet > 0 && Number.isFinite(x.monthlyNet) ? x.monthlyNet : 0), 0) ??
    0;

  if (incomes.length === 0 && expenses.length === 0 && syntheticIn <= 0) {
    return { nodes: [], links: [] };
  }

  const defaultSharedId = defaultSharedLiquidityAccountId(accounts);

  const lump = new Map<string, number>();
  const bump = (src: string, tgt: string, v: number) => {
    if (v <= 0 || !Number.isFinite(v)) return;
    const k = `${src}\t${tgt}`;
    lump.set(k, (lump.get(k) ?? 0) + v);
  };

  /** Expense draining from ledger when we cannot tie to an explicit named shared wallet */
  function bumpExpenseFromSharedFallback(sink: string, amt: number) {
    if (defaultSharedId) {
      bump(`s:${defaultSharedId}`, sink, amt);
    }
  }

  // --- Income → personal (or pool) ---
  for (const cf of incomes) {
    const flowAmt = getIncomeFlowAmount?.(cf) ?? cf.amount;
    const legs = resolveCashflowAccountLegs(cf);
    const ink = `in:${cf.category}`;
    const toAcc = byId.get(legs.toId ?? "");
    const side = sideForAccount(toAcc);

    if (side === "personal" && legs.toId) {
      bump(ink, `p:${legs.toId}`, flowAmt);
    } else {
      bump(ink, PERSONAL_POOL, flowAmt);
    }
  }

  for (const syn of syntheticIncomes ?? []) {
    const v = syn.monthlyNet;
    if (!(v > 0) || !Number.isFinite(v)) continue;
    const ink = `in:${SYNTHETIC_PARENTAL_INCOME_KEY}`;
    const toId = syn.to_account_id ?? null;
    const toAcc = byId.get(toId ?? "");
    const side = sideForAccount(toAcc);
    /** Match salary rows: personal liquidity → named wallet in column 1; shared/unset → budget pool. */
    if (side === "personal" && toId) {
      bump(ink, `p:${toId}`, v);
    } else {
      bump(ink, PERSONAL_POOL, v);
    }
  }

  // --- Expense ← shared ---
  for (const cf of expenses) {
    const expenseAmt = cashflowMonthlyAmount(cf, monthStart, monthEnd);
    if (!(expenseAmt > 0) || !Number.isFinite(expenseAmt)) continue;
    const legs = resolveCashflowAccountLegs(cf);
    const fromAcc = byId.get(legs.fromId ?? "");
    const side = sideForAccount(fromAcc);
    const sink = `out:${cf.category}`;

    if (side === "shared" && legs.fromId) {
      bump(`s:${legs.fromId}`, sink, expenseAmt);
    } else {
      bumpExpenseFromSharedFallback(sink, expenseAmt);
    }
  }

  const personalInflow = new Map<string, number>();
  for (const [k, vol] of lump) {
    const [, tgt] = k.split("\t");
    if (tgt.startsWith("p:")) {
      personalInflow.set(tgt, (personalInflow.get(tgt) ?? 0) + vol);
    }
  }

  const sharedOutflow = new Map<string, number>();
  for (const [k, vol] of lump) {
    const [src] = k.split("\t");
    if (src.startsWith("s:")) {
      sharedOutflow.set(src, (sharedOutflow.get(src) ?? 0) + vol);
    }
  }

  const totalSharedOut = [...sharedOutflow.values()].reduce((a, b) => a + b, 0);

  /** Sum of income per entity (matches aggregate personal-layer inflow above). */
  const entityTotal = new Map<string, number>();
  /** Pool slice per entity (income rows whose destination is not a personal wallet — joint deposit / unattributed). */
  const poolEntityContribution = new Map<string, number>();
  for (const cf of incomes) {
    const flowAmt = getIncomeFlowAmount?.(cf) ?? cf.amount;
    entityTotal.set(cf.entity_id, (entityTotal.get(cf.entity_id) ?? 0) + flowAmt);
    const legs = resolveCashflowAccountLegs(cf);
    const toAcc = byId.get(legs.toId ?? "");
    const side = sideForAccount(toAcc);
    const toPersonalWallet = side === "personal" && legs.toId;
    if (!toPersonalWallet) {
      poolEntityContribution.set(
        cf.entity_id,
        (poolEntityContribution.get(cf.entity_id) ?? 0) + flowAmt,
      );
    }
  }
  for (const syn of syntheticIncomes ?? []) {
    const v = syn.monthlyNet;
    if (!(v > 0) || !Number.isFinite(v)) continue;
    entityTotal.set(syn.entityId, (entityTotal.get(syn.entityId) ?? 0) + v);
    const toId = syn.to_account_id ?? null;
    const toAcc = byId.get(toId ?? "");
    const side = sideForAccount(toAcc);
    const toPersonalWallet = side === "personal" && toId;
    if (!toPersonalWallet) {
      poolEntityContribution.set(
        syn.entityId,
        (poolEntityContribution.get(syn.entityId) ?? 0) + v,
      );
    }
  }

  const totalEI = [...entityTotal.values()].reduce((a, b) => a + b, 0);

  /**
   * Split each entity's share of the middle column by where that entity's income lands (personal accounts vs pool),
   * not by global share of all personal nodes. That way two adults with the same total income get the same
   * personal→shared band thickness to each joint wallet; the old p×s/TI cross-product scaled by per-account inflow
   * and made higher earners' links to every shared node look larger even when household contribution is even.
   */
  const forEachPersonalKeyWeight = (
    entityId: string,
    eVol: number,
    cb: (pKey: string, weightWithinEntity: number) => void,
  ) => {
    if (!(eVol > 0)) return;
    const poolPart = poolEntityContribution.get(entityId) ?? 0;
    if (poolPart > 0 && personalInflow.has(PERSONAL_POOL)) {
      cb(PERSONAL_POOL, poolPart / eVol);
    }
    for (const [pKey, pVol] of personalInflow) {
      if (!pKey.startsWith("p:") || pKey === PERSONAL_POOL) continue;
      const acc = byId.get(pKey.slice(2));
      if (acc?.entity_id === entityId && pVol > 0) {
        cb(pKey, pVol / eVol);
      }
    }
  };

  const entityIdsPositive = [...entityTotal.keys()].filter((id) => (entityTotal.get(id) ?? 0) > 0);
  const numEntities = entityIdsPositive.length;

  // Route personal → shared: each entity contributes an equal share to each shared wallet (equal-split household model).
  // The band from each person to a shared wallet is the same thickness when they transfer the same logical amount.
  // Surplus (income above modelled shared spend) splits equally per entity too.
  if (numEntities > 0 && totalSharedOut > 0) {
    const equalSharePerEntity = totalSharedOut / numEntities;

    if (totalEI >= totalSharedOut - FLOW_EPS) {
      for (const e of entityIdsPositive) {
        const eVol = entityTotal.get(e) ?? 0;
        if (!(eVol > 0)) continue;
        for (const [sKey, sVol] of sharedOutflow) {
          const entToS = sVol / numEntities;
          forEachPersonalKeyWeight(e, eVol, (pKey, w) => {
            bump(pKey, sKey, entToS * w);
          });
        }
      }
      if (totalEI > totalSharedOut + FLOW_EPS) {
        const slack = totalEI - totalSharedOut;
        for (const e of entityIdsPositive) {
          const eVol = entityTotal.get(e) ?? 0;
          const entitySurplus = eVol - equalSharePerEntity;
          if (entitySurplus > FLOW_EPS) {
            forEachPersonalKeyWeight(e, eVol, (pKey, w) => {
              bump(pKey, OUT_HOUSEHOLD_SURPLUS, entitySurplus * w);
            });
          }
        }
      }
    } else {
      // Shared outflow exceeds total income — each entity pays what it can (equal share capped at their income).
      for (const e of entityIdsPositive) {
        const eVol = entityTotal.get(e) ?? 0;
        if (!(eVol > 0)) continue;
        const capped = Math.min(eVol, equalSharePerEntity);
        for (const [sKey, sVol] of sharedOutflow) {
          const entToS = (capped * sVol) / totalSharedOut;
          forEachPersonalKeyWeight(e, eVol, (pKey, w) => {
            bump(pKey, sKey, entToS * w);
          });
        }
      }
      const gap = totalSharedOut - totalEI;
      if (gap > FLOW_EPS) {
        for (const [sKey, sVol] of sharedOutflow) {
          bump(IN_PLANNING_GAP, sKey, (gap * sVol) / totalSharedOut);
        }
      }
    }
  } else if (totalEI > FLOW_EPS && defaultSharedId != null && totalSharedOut <= 0) {
    for (const e of entityIdsPositive) {
      const eVol = entityTotal.get(e) ?? 0;
      forEachPersonalKeyWeight(e, eVol, (pKey, w) => {
        bump(pKey, `s:${defaultSharedId}`, eVol * w);
      });
    }
  }

  const labelOf = (k: string): { layer: 0 | 1 | 2 | 3; label: string } => {
    if (k === IN_PLANNING_GAP) return { layer: 0, label: "External / gap fill" };
    if (k.startsWith("in:")) {
      const cat = k.slice(3);
      if (cat === SYNTHETIC_PARENTAL_INCOME_KEY) return { layer: 0, label: "Föräldrapenning" };
      return { layer: 0, label: capitalizeCat(cat) };
    }
    if (k === OUT_HOUSEHOLD_SURPLUS) return { layer: 3, label: "Household surplus (unspent)" };
    if (k.startsWith("out:")) return { layer: 3, label: capitalizeCat(k.slice(4)) };
    if (k === PERSONAL_POOL) return { layer: 1, label: "Personal budget" };
    if (k.startsWith("p:")) {
      const acc = byId.get(k.slice(2));
      return { layer: 1, label: acc?.name ?? "Personal account" };
    }
    if (k.startsWith("s:")) {
      const acc = byId.get(k.slice(2));
      return { layer: 2, label: acc?.name ?? "Shared account" };
    }
    return { layer: 1, label: k };
  };

  const flowIn = new Map<string, number>();
  const flowOut = new Map<string, number>();

  const links: FinanceSankeyLink[] = [];
  for (const [k, vol] of lump) {
    if (vol <= 0 || !Number.isFinite(vol)) continue;
    const [src, tgt] = k.split("\t");
    links.push({ source: src, target: tgt, value: vol });
    flowOut.set(src, (flowOut.get(src) ?? 0) + vol);
    flowIn.set(tgt, (flowIn.get(tgt) ?? 0) + vol);
  }

  const keys = new Set<string>();
  for (const l of links) {
    keys.add(l.source);
    keys.add(l.target);
  }

  const nodeTotal = (k: string): number =>
    Math.max(flowIn.get(k) ?? 0, flowOut.get(k) ?? 0);

  const nodes: Array<FinanceSankeyNode & { total: number }> = [...keys]
    .map((key) => {
      const m = labelOf(key);
      return {
        key,
        layer: m.layer,
        label: m.label,
        total: nodeTotal(key),
      };
    })
    .filter((n) => n.total > 0)
    .sort((a, b) => {
      if (a.layer !== b.layer) return a.layer - b.layer;
      return b.total - a.total || a.label.localeCompare(b.label);
    });

  return { nodes, links };
}

export type FinanceSankeyNodeZone = "income" | "personal" | "shared" | "expense" | "surplus";

function nodeZoneForKey(key: string): FinanceSankeyNodeZone {
  if (key.startsWith("in:")) return "income";
  if (key === OUT_HOUSEHOLD_SURPLUS) return "surplus";
  if (key.startsWith("out:")) return "expense";
  if (key.startsWith("s:")) return "shared";
  return "personal";
}

/** Convert string-keyed graph into the index-based format Recharts Sankey expects. */
export function toRechartsSankeyData(
  cashflows: Cashflow[],
  accounts: Account[],
  syntheticIncomes?: SankeySyntheticIncome[],
  getIncomeFlowAmount?: (cf: Cashflow) => number,
  referenceMonth?: Date,
): {
  nodes: Array<{ name: string; nodeZone: FinanceSankeyNodeZone; value: number }>;
  links: Array<{ source: number; target: number; value: number }>;
} | null {
  const { nodes, links } = buildFinanceFlowSankeyData(
    cashflows,
    accounts,
    syntheticIncomes,
    getIncomeFlowAmount,
    referenceMonth,
  );
  if (nodes.length === 0) return null;

  const keyToIdx = new Map<string, number>();
  const rcNodes: Array<{ name: string; nodeZone: FinanceSankeyNodeZone; value: number }> = [];
  for (let i = 0; i < nodes.length; i++) {
    keyToIdx.set(nodes[i].key, i);
    rcNodes.push({ name: nodes[i].label, nodeZone: nodeZoneForKey(nodes[i].key), value: nodes[i].total });
  }

  const rcLinks: Array<{ source: number; target: number; value: number }> = [];
  for (const l of links) {
    const si = keyToIdx.get(l.source);
    const ti = keyToIdx.get(l.target);
    if (si == null || ti == null) continue;
    const v = l.value;
    if (!Number.isFinite(v) || v <= 0) continue;
    rcLinks.push({ source: si, target: ti, value: v });
  }

  if (rcLinks.length === 0) return null;
  return { nodes: rcNodes, links: rcLinks };
}
