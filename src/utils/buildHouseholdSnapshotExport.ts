import type { BackendAdapter } from "@/adapter/index";
import { getBackend } from "@/hooks/useBackend";
import type { DataStorageMode } from "@/stores/appStore";
import { activeOnly } from "@/utils/activeOnly";
import {
  flushFileJsonPersistence,
  restoreFileStorageFromDisk,
  getBoundLocalFileSession,
  collectVaultUserPreferencesSnapshot,
} from "@/adapter/fileJson";
import type { TaxProfile, UserCardLayout } from "@/types/schema";

const LAYOUT_TABS = ["overview", "planning", "data", "expenses", "retirement"] as const;

async function collectTaxProfiles(be: BackendAdapter, entities: { id: string }[]): Promise<TaxProfile[]> {
  const y0 = new Date().getFullYear();
  const years: number[] = [];
  for (let y = y0 - 3; y <= y0 + 5; y++) years.push(y);
  const byId = new Map<string, TaxProfile>();
  for (const e of entities) {
    for (const y of years) {
      const t = await be.getTaxProfile(e.id, y);
      if (t) byId.set(t.id, t);
    }
  }
  return [...byId.values()];
}

/**
 * Full snapshot JSON matching the file-storage shape (`version` + arrays), built by querying the **active**
 * backend — same sources as a fresh refresh — so it matches what you see in the app for the current storage mode.
 */
export async function buildHouseholdSnapshotExportJson(opts: {
  dataStorageMode: DataStorageMode;
  userId: string;
}): Promise<string> {
  const { dataStorageMode, userId } = opts;

  if (dataStorageMode === "file") {
    await flushFileJsonPersistence();
    const restored = await restoreFileStorageFromDisk();
    if (!restored) {
      throw new Error(
        "Could not reload the local folder (permission or handle missing). Open Account settings and choose your Finances folder again, then retry.",
      );
    }
  }

  const be = getBackend(dataStorageMode);
  const hh = await be.getHouseholdForUser(userId);
  if (!hh) throw new Error("No household to export for this account.");

  const [entitiesRaw, accountsRaw, cashflowsRaw, loans, benefitsRaw, periodsRaw, transactions] =
    await Promise.all([
      be.listEntities(hh.id),
      be.listAccounts(hh.id),
      be.listCashflows(hh.id),
      be.listLoans(hh.id),
      be.listBenefits(hh.id),
      be.listPeriods(hh.id),
      be.listTransactionsForHousehold(hh.id),
    ]);

  const entities = activeOnly(entitiesRaw);
  const accounts = activeOnly(accountsRaw);
  const cashflows = activeOnly(cashflowsRaw);
  const benefits = activeOnly(benefitsRaw);
  const periods = activeOnly(periodsRaw);

  const dayOverrides = (
    await Promise.all(periods.map((p) => be.listDayOverrides(p.id)))
  ).flat();

  const [scenarios, taxProfiles] = await Promise.all([
    be.listScenarios(hh.id),
    collectTaxProfiles(be, entities),
  ]);

  const cardLayouts: UserCardLayout[] = [];
  for (const tab of LAYOUT_TABS) {
    const layout = await be.getCardLayout(userId, tab);
    if (layout) cardLayouts.push(layout);
  }

  const base = {
    version: 1 as const,
    households: [hh],
    entities,
    accounts,
    periods,
    dayOverrides,
    cashflows,
    loans,
    benefits,
    transactions,
    taxProfiles,
    scenarios,
    cardLayouts,
  };

  const session = dataStorageMode === "file" ? getBoundLocalFileSession() : null;
  const prefs = collectVaultUserPreferencesSnapshot();
  const payload = {
    ...base,
    ...(session ? { localSession: session } : {}),
    userPreferences: prefs,
  };

  return JSON.stringify(payload, null, 2);
}
