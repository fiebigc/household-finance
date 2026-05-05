import type { BackendAdapter } from "./index";
import type {
  Household, Entity, Account, Period, PeriodDayOverride,
  Cashflow, Loan, Benefit, Transaction, TaxProfile,
  ProjectionScenario, UserCardLayout,
} from "@/types/schema";

const store = {
  households: new Map<string, Household>(),
  entities: new Map<string, Entity>(),
  accounts: new Map<string, Account>(),
  periods: new Map<string, Period>(),
  dayOverrides: new Map<string, PeriodDayOverride>(),
  cashflows: new Map<string, Cashflow>(),
  loans: new Map<string, Loan>(),
  benefits: new Map<string, Benefit>(),
  transactions: new Map<string, Transaction>(),
  taxProfiles: new Map<string, TaxProfile>(),
  scenarios: new Map<string, ProjectionScenario>(),
  cardLayouts: new Map<string, UserCardLayout>(),
};

function byHousehold<T extends { household_id?: string }>(
  map: Map<string, T>, hid: string, field = "household_id"
): T[] {
  return [...map.values()].filter((v: any) => v[field] === hid);
}

const now = () => new Date().toISOString();

export const mockAdapter: BackendAdapter = {
  async getHousehold(id) { return store.households.get(id) ?? null; },
  async getHouseholdForUser() { return [...store.households.values()][0] ?? null; },
  async upsertHousehold(h) {
    const full = { ...store.households.get(h.id), ...h, updated_at: now() } as Household;
    store.households.set(h.id, full);
    return full;
  },

  async listEntities(hid) { return byHousehold(store.entities, hid); },
  async upsertEntity(e) {
    const full = { ...store.entities.get(e.id), ...e, updated_at: now() } as Entity;
    store.entities.set(e.id, full);
    return full;
  },
  async archiveEntity(id) {
    const e = store.entities.get(id);
    if (e) e.archived_at = now();
  },

  async listAccounts(hid) {
    const eids = new Set(byHousehold(store.entities, hid).map(e => e.id));
    return [...store.accounts.values()].filter(a => eids.has(a.entity_id));
  },
  async upsertAccount(a) {
    const full = { ...store.accounts.get(a.id), ...a, updated_at: now() } as Account;
    store.accounts.set(a.id, full);
    return full;
  },
  async archiveAccount(id) {
    const a = store.accounts.get(id);
    if (a) a.archived_at = now();
  },

  async listPeriods(hid) {
    const eids = new Set(byHousehold(store.entities, hid).map(e => e.id));
    return [...store.periods.values()].filter(p => eids.has(p.entity_id));
  },
  async upsertPeriod(p) {
    const full = { ...store.periods.get(p.id), ...p, updated_at: now() } as Period;
    store.periods.set(p.id, full);
    return full;
  },
  async archivePeriod(id) {
    const p = store.periods.get(id);
    if (p) p.archived_at = now();
  },

  async listDayOverrides(periodId) {
    return [...store.dayOverrides.values()].filter(o => o.period_id === periodId);
  },
  async upsertDayOverride(o) {
    const full = { ...store.dayOverrides.get(o.id), ...o } as PeriodDayOverride;
    store.dayOverrides.set(o.id, full);
    return full;
  },
  async deleteDayOverride(id) { store.dayOverrides.delete(id); },

  async listCashflows(hid) {
    const eids = new Set(byHousehold(store.entities, hid).map(e => e.id));
    return [...store.cashflows.values()].filter(c => eids.has(c.entity_id));
  },
  async upsertCashflow(c) {
    const full = { ...store.cashflows.get(c.id), ...c, updated_at: now() } as Cashflow;
    store.cashflows.set(c.id, full);
    return full;
  },
  async archiveCashflow(id) {
    const c = store.cashflows.get(id);
    if (c) c.archived_at = now();
  },

  async listLoans(hid) {
    const eids = new Set(byHousehold(store.entities, hid).map(e => e.id));
    const aids = new Set([...store.accounts.values()].filter(a => eids.has(a.entity_id)).map(a => a.id));
    return [...store.loans.values()].filter(l => aids.has(l.account_id));
  },
  async upsertLoan(l) {
    const full = { ...store.loans.get(l.id), ...l, updated_at: now() } as Loan;
    store.loans.set(l.id, full);
    return full;
  },

  async listBenefits(hid) {
    const eids = new Set(byHousehold(store.entities, hid).map(e => e.id));
    return [...store.benefits.values()].filter(b => eids.has(b.entity_id));
  },
  async upsertBenefit(b) {
    const full = { ...store.benefits.get(b.id), ...b, updated_at: now() } as Benefit;
    store.benefits.set(b.id, full);
    return full;
  },
  async archiveBenefit(id) {
    const b = store.benefits.get(id);
    if (b) b.archived_at = now();
  },

  async listTransactions(accountId, opts) {
    let txs = [...store.transactions.values()]
      .filter(t => t.account_id === accountId)
      .sort((a, b) => b.date.localeCompare(a.date));
    if (opts?.offset) txs = txs.slice(opts.offset);
    if (opts?.limit) txs = txs.slice(0, opts.limit);
    return txs;
  },
  async listTransactionsForHousehold(hid) {
    const eids = new Set(byHousehold(store.entities, hid).map(e => e.id));
    const aids = new Set(
      [...store.accounts.values()]
        .filter(a => !a.archived_at && eids.has(a.entity_id))
        .map(a => a.id)
    );
    return [...store.transactions.values()]
      .filter(t => aids.has(t.account_id))
      .sort((a, b) => b.date.localeCompare(a.date));
  },
  async insertTransactions(txs) {
    txs.forEach(t => store.transactions.set(t.id, { ...t, created_at: now() } as Transaction));
    return txs.length;
  },

  async getTaxProfile(entityId, year) {
    return [...store.taxProfiles.values()].find(t => t.entity_id === entityId && t.year === year) ?? null;
  },
  async upsertTaxProfile(t) {
    const full = { ...store.taxProfiles.get(t.id), ...t, updated_at: now() } as TaxProfile;
    store.taxProfiles.set(t.id, full);
    return full;
  },

  async listScenarios(hid) { return byHousehold(store.scenarios, hid); },
  async upsertScenario(s) {
    const full = { ...store.scenarios.get(s.id), ...s, updated_at: now() } as ProjectionScenario;
    store.scenarios.set(s.id, full);
    return full;
  },
  async deleteScenario(id) { store.scenarios.delete(id); },

  async getCardLayout(userId, tab) {
    return store.cardLayouts.get(`${userId}:${tab}`) ?? null;
  },
  async saveCardLayout(layout) {
    store.cardLayouts.set(`${layout.user_id}:${layout.tab}`, layout);
  },
};
