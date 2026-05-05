import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { supabaseAdapter } from "@/adapter/supabase";
import { IS_WEBKIT_STANDALONE } from "@/constants/buildTarget";
import {
  fileJsonAdapter,
  flushFileJsonPersistence,
  listTaxProfilesForHouseholdFileStore,
} from "@/adapter/fileJson";
import type { Entity, Transaction, UserCardLayout } from "@/types/schema";

const LAYOUT_TABS = ["overview", "planning", "data", "expenses", "retirement"] as const;

export type SyncLocalToCloudResult = { ok: true } | { ok: false; error: string };

function mapEntityForCloud(e: Entity, localUserId: string, cloudUserId: string): Entity {
  const meta = { ...(e.metadata ?? {}) } as Record<string, unknown>;
  if (meta.auth_user_id === localUserId) meta.auth_user_id = cloudUserId;
  return { ...e, metadata: meta };
}

async function insertTransactionsChunked(txs: Transaction[]): Promise<void> {
  const chunk = 200;
  for (let i = 0; i < txs.length; i += chunk) {
    const slice = txs.slice(i, i + chunk).map((t) => {
      const { created_at: _c, ...rest } = t;
      return rest;
    }) as Omit<Transaction, "created_at">[];
    await supabaseAdapter.insertTransactions(slice);
  }
}

async function migrateCardLayouts(localUserId: string, cloudUserId: string): Promise<void> {
  const now = new Date().toISOString();
  for (const tab of LAYOUT_TABS) {
    const layout = await fileJsonAdapter.getCardLayout(localUserId, tab);
    if (!layout?.cards?.length) continue;
    const row: UserCardLayout = {
      id: crypto.randomUUID(),
      user_id: cloudUserId,
      tab: layout.tab,
      cards: layout.cards,
      updated_at: now,
    };
    await supabaseAdapter.saveCardLayout(row);
  }
}

/**
 * Copy the current local-file household into Supabase for `cloudUserId`.
 * Caller must have authenticated `cloudUserId` with Supabase (session active).
 */
export async function syncLocalHouseholdToSupabase(opts: {
  localUserId: string;
  cloudUserId: string;
  householdId: string;
}): Promise<SyncLocalToCloudResult> {
  if (IS_WEBKIT_STANDALONE) return { ok: false, error: "Cloud sync is not available in the desktop app." };
  if (!isSupabaseConfigured()) return { ok: false, error: "Cloud is not configured." };

  const { localUserId, cloudUserId, householdId } = opts;

  try {
    await flushFileJsonPersistence();

    const existingCloud = await supabaseAdapter.getHouseholdForUser(cloudUserId);
    if (existingCloud && existingCloud.id !== householdId) {
      return {
        ok: false,
        error:
          "This cloud account already has another household. Use an empty Supabase account or remove the other household before syncing.",
      };
    }

    const hh = await fileJsonAdapter.getHousehold(householdId);
    if (!hh) return { ok: false, error: "No household loaded from the local file." };

    const sb = getSupabase();

    const { data: membership } = await sb
      .from("household_members")
      .select("household_id")
      .eq("user_id", cloudUserId)
      .maybeSingle();

    if (membership && membership.household_id !== hh.id) {
      return {
        ok: false,
        error: "Your cloud login is already linked to a different household.",
      };
    }

    await supabaseAdapter.upsertHousehold(hh);

    if (!membership) {
      const ins = await sb.from("household_members").insert({
        household_id: hh.id,
        user_id: cloudUserId,
        role: "owner",
      });
      if (ins.error) throw ins.error;
    }

    const entities = await fileJsonAdapter.listEntities(householdId);
    for (const e of entities) {
      await supabaseAdapter.upsertEntity(mapEntityForCloud(e, localUserId, cloudUserId));
    }

    const accounts = await fileJsonAdapter.listAccounts(householdId);
    for (const a of accounts) {
      await supabaseAdapter.upsertAccount(a);
    }

    const periods = await fileJsonAdapter.listPeriods(householdId);
    for (const p of periods) {
      await supabaseAdapter.upsertPeriod(p);
      const overrides = await fileJsonAdapter.listDayOverrides(p.id);
      for (const o of overrides) {
        await supabaseAdapter.upsertDayOverride(o);
      }
    }

    const cashflows = await fileJsonAdapter.listCashflows(householdId);
    for (const c of cashflows) {
      await supabaseAdapter.upsertCashflow(c);
    }

    const loans = await fileJsonAdapter.listLoans(householdId);
    for (const l of loans) {
      await supabaseAdapter.upsertLoan(l);
    }

    const benefits = await fileJsonAdapter.listBenefits(householdId);
    for (const b of benefits) {
      await supabaseAdapter.upsertBenefit(b);
    }

    const taxProfiles = await listTaxProfilesForHouseholdFileStore(householdId);
    for (const t of taxProfiles) {
      await supabaseAdapter.upsertTaxProfile(t);
    }

    const scenarios = await fileJsonAdapter.listScenarios(householdId);
    for (const s of scenarios) {
      await supabaseAdapter.upsertScenario(s);
    }

    const txs = await fileJsonAdapter.listTransactionsForHousehold(householdId);
    if (txs.length > 0) await insertTransactionsChunked(txs);

    await migrateCardLayouts(localUserId, cloudUserId);

    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sync failed.";
    return { ok: false, error: msg };
  }
}
