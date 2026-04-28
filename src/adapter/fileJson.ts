import type { BackendAdapter } from "./index";
import type {
  Household, Entity, Account, Period, PeriodDayOverride,
  Cashflow, Loan, Benefit, Transaction, TaxProfile,
  ProjectionScenario, UserCardLayout,
} from "@/types/schema";
import {
  loadDirectoryHandleFromIdb,
  ensureDirectoryPermission,
} from "@/lib/fileDirectoryStorage";

const DATA_FILE = "household-finance-data.json";

type SnapshotV1 = {
  version: 1;
  households: Household[];
  entities: Entity[];
  accounts: Account[];
  periods: Period[];
  dayOverrides: PeriodDayOverride[];
  cashflows: Cashflow[];
  loans: Loan[];
  benefits: Benefit[];
  transactions: Transaction[];
  taxProfiles: TaxProfile[];
  scenarios: ProjectionScenario[];
  cardLayouts: UserCardLayout[];
};

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

let dirHandle: FileSystemDirectoryHandle | null = null;
let cacheLoadedFromDisk = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let loadChain: Promise<void> = Promise.resolve();

function byHousehold<T extends { household_id?: string }>(
  map: Map<string, T>,
  hid: string,
  field: keyof T & string = "household_id" as keyof T & string
): T[] {
  return [...map.values()].filter((v) => (v as Record<string, unknown>)[field] === hid);
}

const now = () => new Date().toISOString();

function hydrateFromSnapshot(data: SnapshotV1) {
  store.households.clear();
  store.entities.clear();
  store.accounts.clear();
  store.periods.clear();
  store.dayOverrides.clear();
  store.cashflows.clear();
  store.loans.clear();
  store.benefits.clear();
  store.transactions.clear();
  store.taxProfiles.clear();
  store.scenarios.clear();
  store.cardLayouts.clear();
  for (const h of data.households) store.households.set(h.id, h);
  for (const e of data.entities) store.entities.set(e.id, e);
  for (const a of data.accounts) store.accounts.set(a.id, a);
  for (const p of data.periods) store.periods.set(p.id, p);
  for (const o of data.dayOverrides) store.dayOverrides.set(o.id, o);
  for (const c of data.cashflows) store.cashflows.set(c.id, c);
  for (const l of data.loans) store.loans.set(l.id, l);
  for (const b of data.benefits) store.benefits.set(b.id, b);
  for (const t of data.transactions) store.transactions.set(t.id, t);
  for (const t of data.taxProfiles) store.taxProfiles.set(t.id, t);
  for (const s of data.scenarios) store.scenarios.set(s.id, s);
  for (const cl of data.cardLayouts) {
    store.cardLayouts.set(`${cl.user_id}:${cl.tab}`, cl);
  }
}

function toSnapshot(): SnapshotV1 {
  return {
    version: 1,
    households: [...store.households.values()],
    entities: [...store.entities.values()],
    accounts: [...store.accounts.values()],
    periods: [...store.periods.values()],
    dayOverrides: [...store.dayOverrides.values()],
    cashflows: [...store.cashflows.values()],
    loans: [...store.loans.values()],
    benefits: [...store.benefits.values()],
    transactions: [...store.transactions.values()],
    taxProfiles: [...store.taxProfiles.values()],
    scenarios: [...store.scenarios.values()],
    cardLayouts: [...store.cardLayouts.values()],
  };
}

async function readFileFromDirectory(handle: FileSystemDirectoryHandle): Promise<string> {
  const fh = await handle.getFileHandle(DATA_FILE, { create: true });
  const file = await fh.getFile();
  return file.text();
}

async function writeFileToDirectory(handle: FileSystemDirectoryHandle, json: string): Promise<void> {
  const fh = await handle.getFileHandle(DATA_FILE, { create: true });
  const writable = await fh.createWritable();
  await writable.write(json);
  await writable.close();
}

async function flushPersist(): Promise<void> {
  if (!dirHandle) return;
  try {
    const json = JSON.stringify(toSnapshot(), null, 2);
    await writeFileToDirectory(dirHandle, json);
  } catch (e) {
    console.error("Failed to persist household JSON:", e);
  }
}

function schedulePersist(): void {
  if (!dirHandle) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void flushPersist();
  }, 120);
}

function queueLoad(): Promise<void> {
  loadChain = loadChain.then(() => doLoad());
  return loadChain;
}

async function doLoad(): Promise<void> {
  if (!dirHandle) {
    cacheLoadedFromDisk = true;
    return;
  }
  try {
    const text = (await readFileFromDirectory(dirHandle)).trim();
    if (!text) {
      hydrateFromSnapshot(emptySnapshot());
      cacheLoadedFromDisk = true;
      return;
    }
    const parsed = JSON.parse(text) as SnapshotV1;
    if (parsed?.version !== 1 || !Array.isArray(parsed.households)) {
      hydrateFromSnapshot(emptySnapshot());
    } else {
      hydrateFromSnapshot(parsed);
    }
  } catch {
    hydrateFromSnapshot(emptySnapshot());
  }
  cacheLoadedFromDisk = true;
}

function emptySnapshot(): SnapshotV1 {
  return {
    version: 1,
    households: [],
    entities: [],
    accounts: [],
    periods: [],
    dayOverrides: [],
    cashflows: [],
    loans: [],
    benefits: [],
    transactions: [],
    taxProfiles: [],
    scenarios: [],
    cardLayouts: [],
  };
}

export function setFileStorageDirectory(handle: FileSystemDirectoryHandle | null): void {
  dirHandle = handle;
  cacheLoadedFromDisk = false;
  if (!handle) {
    hydrateFromSnapshot(emptySnapshot());
    cacheLoadedFromDisk = true;
  }
}

/** Drop in-memory file backend state (e.g. when switching to cloud). IndexedDB handle is kept. */
export function clearFileStorageSession(): void {
  dirHandle = null;
  cacheLoadedFromDisk = false;
  hydrateFromSnapshot(emptySnapshot());
  cacheLoadedFromDisk = true;
}

export function getFileStorageDirectoryName(): string | null {
  return dirHandle?.name ?? null;
}

export function hasFileStorageDirectory(): boolean {
  return dirHandle !== null;
}

async function ensureLoaded(): Promise<void> {
  if (cacheLoadedFromDisk) return;
  await queueLoad();
}

export async function restoreFileStorageFromDisk(): Promise<boolean> {
  if (dirHandle) return true;
  const h = await loadDirectoryHandleFromIdb();
  if (!h) return false;
  const ok = await ensureDirectoryPermission(h);
  if (!ok) return false;
  setFileStorageDirectory(h);
  cacheLoadedFromDisk = false;
  await queueLoad();
  return true;
}

export const fileJsonAdapter: BackendAdapter = {
  async getHousehold(id) {
    await ensureLoaded();
    return store.households.get(id) ?? null;
  },
  async getHouseholdForUser(_userId) {
    await ensureLoaded();
    return [...store.households.values()][0] ?? null;
  },
  async upsertHousehold(h) {
    await ensureLoaded();
    const full = { ...store.households.get(h.id), ...h, updated_at: now() } as Household;
    store.households.set(h.id, full);
    schedulePersist();
    return full;
  },

  async listEntities(hid) {
    await ensureLoaded();
    return byHousehold(store.entities, hid);
  },
  async upsertEntity(e) {
    await ensureLoaded();
    const full = { ...store.entities.get(e.id), ...e, updated_at: now() } as Entity;
    store.entities.set(e.id, full);
    schedulePersist();
    return full;
  },
  async archiveEntity(id) {
    await ensureLoaded();
    const e = store.entities.get(id);
    if (e) {
      e.archived_at = now();
      schedulePersist();
    }
  },

  async listAccounts(hid) {
    await ensureLoaded();
    const eids = new Set(byHousehold(store.entities, hid).map((e) => e.id));
    return [...store.accounts.values()].filter((a) => eids.has(a.entity_id));
  },
  async upsertAccount(a) {
    await ensureLoaded();
    const full = { ...store.accounts.get(a.id), ...a, updated_at: now() } as Account;
    store.accounts.set(a.id, full);
    schedulePersist();
    return full;
  },
  async archiveAccount(id) {
    await ensureLoaded();
    const a = store.accounts.get(id);
    if (a) {
      a.archived_at = now();
      schedulePersist();
    }
  },

  async listPeriods(hid) {
    await ensureLoaded();
    const eids = new Set(byHousehold(store.entities, hid).map((e) => e.id));
    return [...store.periods.values()].filter((p) => eids.has(p.entity_id));
  },
  async upsertPeriod(p) {
    await ensureLoaded();
    const full = { ...store.periods.get(p.id), ...p, updated_at: now() } as Period;
    store.periods.set(p.id, full);
    schedulePersist();
    return full;
  },
  async archivePeriod(id) {
    await ensureLoaded();
    const p = store.periods.get(id);
    if (p) {
      p.archived_at = now();
      schedulePersist();
    }
  },

  async listDayOverrides(periodId) {
    await ensureLoaded();
    return [...store.dayOverrides.values()].filter((o) => o.period_id === periodId);
  },
  async upsertDayOverride(o) {
    await ensureLoaded();
    const full = { ...store.dayOverrides.get(o.id), ...o } as PeriodDayOverride;
    store.dayOverrides.set(o.id, full);
    schedulePersist();
    return full;
  },
  async deleteDayOverride(id) {
    await ensureLoaded();
    store.dayOverrides.delete(id);
    schedulePersist();
  },

  async listCashflows(hid) {
    await ensureLoaded();
    const eids = new Set(byHousehold(store.entities, hid).map((e) => e.id));
    return [...store.cashflows.values()].filter((c) => eids.has(c.entity_id));
  },
  async upsertCashflow(c) {
    await ensureLoaded();
    const full = { ...store.cashflows.get(c.id), ...c, updated_at: now() } as Cashflow;
    store.cashflows.set(c.id, full);
    schedulePersist();
    return full;
  },
  async archiveCashflow(id) {
    await ensureLoaded();
    const c = store.cashflows.get(id);
    if (c) {
      c.archived_at = now();
      schedulePersist();
    }
  },

  async listLoans(hid) {
    await ensureLoaded();
    const eids = new Set(byHousehold(store.entities, hid).map((e) => e.id));
    const aids = new Set(
      [...store.accounts.values()].filter((a) => eids.has(a.entity_id)).map((a) => a.id)
    );
    return [...store.loans.values()].filter((l) => aids.has(l.account_id));
  },
  async upsertLoan(l) {
    await ensureLoaded();
    const full = { ...store.loans.get(l.id), ...l, updated_at: now() } as Loan;
    store.loans.set(l.id, full);
    schedulePersist();
    return full;
  },

  async listBenefits(hid) {
    await ensureLoaded();
    const eids = new Set(byHousehold(store.entities, hid).map((e) => e.id));
    return [...store.benefits.values()].filter((b) => eids.has(b.entity_id));
  },
  async upsertBenefit(b) {
    await ensureLoaded();
    const full = { ...store.benefits.get(b.id), ...b, updated_at: now() } as Benefit;
    store.benefits.set(b.id, full);
    schedulePersist();
    return full;
  },
  async archiveBenefit(id) {
    await ensureLoaded();
    const b = store.benefits.get(id);
    if (b) {
      b.archived_at = now();
      schedulePersist();
    }
  },

  async listTransactions(accountId, opts) {
    await ensureLoaded();
    let txs = [...store.transactions.values()]
      .filter((t) => t.account_id === accountId)
      .sort((a, b) => b.date.localeCompare(a.date));
    if (opts?.offset) txs = txs.slice(opts.offset);
    if (opts?.limit) txs = txs.slice(0, opts.limit);
    return txs;
  },
  async insertTransactions(txs) {
    await ensureLoaded();
    txs.forEach((t) => store.transactions.set(t.id, { ...t, created_at: now() } as Transaction));
    schedulePersist();
    return txs.length;
  },

  async getTaxProfile(entityId, year) {
    await ensureLoaded();
    return (
      [...store.taxProfiles.values()].find((t) => t.entity_id === entityId && t.year === year) ?? null
    );
  },
  async upsertTaxProfile(t) {
    await ensureLoaded();
    const full = { ...store.taxProfiles.get(t.id), ...t, updated_at: now() } as TaxProfile;
    store.taxProfiles.set(t.id, full);
    schedulePersist();
    return full;
  },

  async listScenarios(hid) {
    await ensureLoaded();
    return byHousehold(store.scenarios, hid);
  },
  async upsertScenario(s) {
    await ensureLoaded();
    const full = { ...store.scenarios.get(s.id), ...s, updated_at: now() } as ProjectionScenario;
    store.scenarios.set(s.id, full);
    schedulePersist();
    return full;
  },
  async deleteScenario(id) {
    await ensureLoaded();
    store.scenarios.delete(id);
    schedulePersist();
  },

  async getCardLayout(userId, tab) {
    await ensureLoaded();
    return store.cardLayouts.get(`${userId}:${tab}`) ?? null;
  },
  async saveCardLayout(layout) {
    await ensureLoaded();
    store.cardLayouts.set(`${layout.user_id}:${layout.tab}`, layout);
    schedulePersist();
  },
};
