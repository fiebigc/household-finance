import { supabase } from "@/lib/supabase";
import type { BackendAdapter } from "./index";
import type {
  Household, Entity, Account, Period, PeriodDayOverride,
  Cashflow, Loan, Benefit, Transaction, TaxProfile,
  ProjectionScenario, UserCardLayout,
} from "@/types/schema";

function throwIfError<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) throw result.error;
  return result.data as T;
}

export const supabaseAdapter: BackendAdapter = {
  /* ── Household ── */
  async getHousehold(id) {
    const r = await supabase.from("households").select("*").eq("id", id).maybeSingle();
    return r.data as Household | null;
  },
  async getHouseholdForUser(userId) {
    const r = await supabase
      .from("household_members")
      .select("household_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!r.data) return null;
    const hh = await supabase
      .from("households")
      .select("*")
      .eq("id", r.data.household_id)
      .maybeSingle();
    return hh.data as Household | null;
  },
  async upsertHousehold(h) {
    return throwIfError(
      await supabase.from("households").upsert(h).select().single()
    );
  },

  /* ── Entities ── */
  async listEntities(householdId) {
    return throwIfError(
      await supabase.from("entities").select("*").eq("household_id", householdId)
    );
  },
  async upsertEntity(e) {
    return throwIfError(
      await supabase.from("entities").upsert(e).select().single()
    );
  },
  async archiveEntity(id) {
    throwIfError(
      await supabase.from("entities").update({ archived_at: new Date().toISOString() }).eq("id", id)
    );
  },

  /* ── Accounts ── */
  async listAccounts(householdId) {
    const entities = await this.listEntities(householdId);
    const eids = entities.map(e => e.id);
    if (eids.length === 0) return [];
    return throwIfError(
      await supabase.from("accounts").select("*").in("entity_id", eids)
    );
  },
  async upsertAccount(a) {
    return throwIfError(
      await supabase.from("accounts").upsert(a).select().single()
    );
  },
  async archiveAccount(id) {
    throwIfError(
      await supabase.from("accounts").update({ archived_at: new Date().toISOString() }).eq("id", id)
    );
  },

  /* ── Periods ── */
  async listPeriods(householdId) {
    const entities = await this.listEntities(householdId);
    const eids = entities.map(e => e.id);
    if (eids.length === 0) return [];
    return throwIfError(
      await supabase.from("periods").select("*").in("entity_id", eids)
    );
  },
  async upsertPeriod(p) {
    return throwIfError(
      await supabase.from("periods").upsert(p).select().single()
    );
  },
  async archivePeriod(id) {
    throwIfError(
      await supabase.from("periods").update({ archived_at: new Date().toISOString() }).eq("id", id)
    );
  },

  /* ── Day overrides ── */
  async listDayOverrides(periodId) {
    return throwIfError(
      await supabase.from("period_day_overrides").select("*").eq("period_id", periodId)
    );
  },
  async upsertDayOverride(o) {
    return throwIfError(
      await supabase.from("period_day_overrides").upsert(o).select().single()
    );
  },
  async deleteDayOverride(id) {
    throwIfError(
      await supabase.from("period_day_overrides").delete().eq("id", id)
    );
  },

  /* ── Cashflows ── */
  async listCashflows(householdId) {
    const entities = await this.listEntities(householdId);
    const eids = entities.map(e => e.id);
    if (eids.length === 0) return [];
    return throwIfError(
      await supabase.from("cashflows").select("*").in("entity_id", eids)
    );
  },
  async upsertCashflow(c) {
    return throwIfError(
      await supabase.from("cashflows").upsert(c).select().single()
    );
  },
  async archiveCashflow(id) {
    throwIfError(
      await supabase.from("cashflows").update({ archived_at: new Date().toISOString() }).eq("id", id)
    );
  },

  /* ── Loans ── */
  async listLoans(householdId) {
    const accounts = await this.listAccounts(householdId);
    const aids = accounts.map(a => a.id);
    if (aids.length === 0) return [];
    return throwIfError(
      await supabase.from("loans").select("*").in("account_id", aids)
    );
  },
  async upsertLoan(l) {
    return throwIfError(
      await supabase.from("loans").upsert(l).select().single()
    );
  },

  /* ── Benefits ── */
  async listBenefits(householdId) {
    const entities = await this.listEntities(householdId);
    const eids = entities.map(e => e.id);
    if (eids.length === 0) return [];
    return throwIfError(
      await supabase.from("benefits").select("*").in("entity_id", eids)
    );
  },
  async upsertBenefit(b) {
    return throwIfError(
      await supabase.from("benefits").upsert(b).select().single()
    );
  },
  async archiveBenefit(id) {
    throwIfError(
      await supabase.from("benefits").update({ archived_at: new Date().toISOString() }).eq("id", id)
    );
  },

  /* ── Transactions ── */
  async listTransactions(accountId, opts) {
    let q = supabase
      .from("transactions")
      .select("*")
      .eq("account_id", accountId)
      .order("date", { ascending: false });
    if (opts?.limit) q = q.limit(opts.limit);
    if (opts?.offset) q = q.range(opts.offset, opts.offset + (opts.limit ?? 50) - 1);
    return throwIfError(await q);
  },
  async insertTransactions(txs) {
    const r = await supabase.from("transactions").insert(txs);
    if (r.error) throw r.error;
    return txs.length;
  },

  /* ── Tax profiles ── */
  async getTaxProfile(entityId, year) {
    const r = await supabase
      .from("tax_profiles")
      .select("*")
      .eq("entity_id", entityId)
      .eq("year", year)
      .maybeSingle();
    return r.data as TaxProfile | null;
  },
  async upsertTaxProfile(t) {
    return throwIfError(
      await supabase.from("tax_profiles").upsert(t).select().single()
    );
  },

  /* ── Scenarios ── */
  async listScenarios(householdId) {
    return throwIfError(
      await supabase.from("projection_scenarios").select("*").eq("household_id", householdId)
    );
  },
  async upsertScenario(s) {
    return throwIfError(
      await supabase.from("projection_scenarios").upsert(s).select().single()
    );
  },
  async deleteScenario(id) {
    throwIfError(
      await supabase.from("projection_scenarios").delete().eq("id", id)
    );
  },

  /* ── Card layout ── */
  async getCardLayout(userId, tab) {
    const r = await supabase
      .from("user_card_layouts")
      .select("*")
      .eq("user_id", userId)
      .eq("tab", tab)
      .maybeSingle();
    return r.data as UserCardLayout | null;
  },
  async saveCardLayout(layout) {
    throwIfError(
      await supabase.from("user_card_layouts").upsert(layout)
    );
  },
};
