import type { HouseholdConfig } from "../config/householdConfig";
import {
  scenarioFromDbRow,
  type ScenarioDefinition,
} from "../config/scenarios";
import type {
  PlanningCalendarDaysMap,
  WorkScheduleSegment,
} from "../utils/finance/householdCalendarTypes";
import { normalizePlanningDayMarks } from "../utils/finance/householdCalendarTypes";
import {
  parsePlanningPortalSnapshot,
  type PlanningPortalReference,
} from "../utils/finance/planningPortalSnapshot";
import { normalizeRecurringFlowCategoryId } from "../utils/finance/recurringFlowCategory";
import {
  parseExpenseTrackerBoard,
  type ExpenseTrackerBoard,
} from "../utils/finance/expenseTrackerModel";
import {
  ENTITY_IDS,
  type BankAccountRecord,
  type EntityRecord,
  type EntityType,
  type RecurringCost,
} from "../data/bankData";
import { hasSupabaseEnv, supabase } from "./supabase";

function throwIfSupabaseError(operation: string, error: { message: string } | null): void {
  if (error) {
    throw new Error(`${operation}: ${error.message}`);
  }
}

function inferredEntityType(entityId: string): EntityType {
  if (entityId === ENTITY_IDS.SHARED) return "shared";
  if (entityId === ENTITY_IDS.COMPANY) return "company";
  if (entityId === ENTITY_IDS.CHILD_1 || entityId === ENTITY_IDS.CHILD_2) return "child";
  if (entityId === ENTITY_IDS.ADULT_1 || entityId === ENTITY_IDS.ADULT_2) return "adult";
  const lower = entityId.toLowerCase();
  if (lower.includes("shared")) return "shared";
  if (lower.includes("company")) return "company";
  if (lower.includes("child")) return "child";
  return "adult";
}

function defaultNameForReferencedEntity(entityId: string): string {
  if (entityId === ENTITY_IDS.SHARED) return "Shared household";
  if (entityId === ENTITY_IDS.COMPANY) return "Company";
  if (entityId === ENTITY_IDS.ADULT_1) return "Adult 1";
  if (entityId === ENTITY_IDS.ADULT_2) return "Adult 2";
  if (entityId === ENTITY_IDS.CHILD_1) return "Child 1";
  if (entityId === ENTITY_IDS.CHILD_2) return "Child 2";
  return "Household member";
}

/**
 * `app_bank_accounts.owner_entity_id` and `app_recurring_costs.assigned_entity_id` FK to
 * `app_entities`. If the in-memory `entities` list is missing a referenced id (partial hydrate,
 * drift, or import), upsert minimal stubs so bank/recurring saves do not fail.
 */
export function mergeEntitiesReferencedByFinance(
  entities: readonly EntityRecord[],
  accounts: readonly BankAccountRecord[],
  recurringCosts: readonly RecurringCost[],
): EntityRecord[] {
  const byId = new Map<string, EntityRecord>();
  for (const e of entities) {
    byId.set(e.id, { ...e });
  }
  const referencedIds = new Set<string>();
  for (const a of accounts) {
    if (a.ownerEntityId) referencedIds.add(a.ownerEntityId);
  }
  for (const c of recurringCosts) {
    if (c.assignedEntityId) referencedIds.add(c.assignedEntityId);
  }
  for (const id of referencedIds) {
    if (!byId.has(id)) {
      byId.set(id, {
        id,
        name: defaultNameForReferencedEntity(id),
        type: inferredEntityType(id),
        notes: "",
      });
    }
  }
  return Array.from(byId.values());
}

export async function saveCurrentFinanceState(params: {
  entities: EntityRecord[];
  accounts: BankAccountRecord[];
  recurringCosts: RecurringCost[];
  userId: string;
}): Promise<void> {
  if (!hasSupabaseEnv || !supabase) return;

  const householdId = params.userId;
  const entitiesPayload = mergeEntitiesReferencedByFinance(
    params.entities,
    params.accounts,
    params.recurringCosts,
  );
  const { error: entErr } = await supabase.from("app_entities").upsert(
    entitiesPayload.map((entity) => ({
      id: entity.id,
      household_id: householdId,
      name: entity.name,
      entity_type: entity.type,
      notes: entity.notes,
      updated_by: params.userId,
    })),
    { onConflict: "id" },
  );
  throwIfSupabaseError("Saving entities", entErr);

  const keepAccountIds = new Set(params.accounts.map((a) => a.id));
  const { data: existingAccounts, error: listAccountErr } = await supabase
    .from("app_bank_accounts")
    .select("id")
    .eq("household_id", householdId);
  throwIfSupabaseError("Listing existing bank accounts", listAccountErr);

  const toRemoveAccounts = (existingAccounts ?? [])
    .map((row) => row.id as string)
    .filter((id) => !keepAccountIds.has(id));
  if (toRemoveAccounts.length > 0) {
    const { error: delAccountErr } = await supabase
      .from("app_bank_accounts")
      .delete()
      .eq("household_id", householdId)
      .in("id", toRemoveAccounts);
    throwIfSupabaseError("Deleting removed bank accounts", delAccountErr);
  }

  const { error: accErr } = await supabase.from("app_bank_accounts").upsert(
    params.accounts.map((account) => ({
      id: account.id,
      household_id: householdId,
      owner_entity_id: account.ownerEntityId,
      name: account.name,
      account_number: account.accountNumber,
      account_category: account.category,
      current_balance_sek: account.currentBalanceSek,
      updated_by: params.userId,
    })),
    { onConflict: "id" },
  );
  throwIfSupabaseError("Saving bank accounts", accErr);

  const keepIds = new Set(params.recurringCosts.map((c) => c.id));
  const { data: existingRecurring, error: recurringListErr } = await supabase
    .from("app_recurring_costs")
    .select("id")
    .eq("household_id", householdId);

  if (recurringListErr) throw recurringListErr;

  const toRemove = (existingRecurring ?? [])
    .map((row) => row.id as string)
    .filter((id) => !keepIds.has(id));

  if (toRemove.length > 0) {
    const { error: recurringDeleteErr } = await supabase
      .from("app_recurring_costs")
      .delete()
      .in("id", toRemove);
    if (recurringDeleteErr) throw recurringDeleteErr;
  }

  const updates = params.recurringCosts.map((cost) => ({
    id: cost.id,
    household_id: householdId,
    label: cost.label,
    amount_sek: cost.amountSek,
    assigned_entity_id: cost.assignedEntityId,
    lane_order: cost.laneOrder,
    flow_kind: cost.kind,
    spending_category_id: cost.categoryId,
    schedule_start_date: cost.validFrom,
    schedule_end_date: cost.validTo,
    updated_by: params.userId,
  }));

  if (updates.length > 0) {
    const { error: recUpsertErr } = await supabase.from("app_recurring_costs").upsert(updates, {
      onConflict: "id",
    });
    throwIfSupabaseError("Saving recurring flows", recUpsertErr);

    const { error: auditErr } = await supabase.from("app_recurring_cost_audit").insert(
      updates.map((row) => ({
        recurring_cost_id: row.id,
        household_id: householdId,
        assigned_entity_id: row.assigned_entity_id,
        lane_order: row.lane_order,
        amount_sek: row.amount_sek,
        changed_by: params.userId,
        change_type: "upsert",
      })),
    );
    throwIfSupabaseError("Saving recurring flow audit", auditErr);
  }
}

export async function deleteRecurringCostRemote(
  recurringId: string,
  userId: string,
): Promise<void> {
  if (!hasSupabaseEnv || !supabase) return;
  const householdId = userId;
  const { error } = await supabase
    .from("app_recurring_costs")
    .delete()
    .eq("id", recurringId)
    .eq("household_id", householdId);
  if (error) throw error;
}

export async function saveHouseholdConfigDraft(
  config: HouseholdConfig,
  userId: string,
): Promise<void> {
  if (!hasSupabaseEnv || !supabase) return;
  const { error } = await supabase.from("app_household_config").upsert(
    {
      household_id: userId,
      config: config as unknown as Record<string, unknown>,
      updated_by: userId,
    },
    { onConflict: "household_id" },
  );
  throwIfSupabaseError("Saving household config", error);
}

export async function loadAppPersistedState(userId: string): Promise<{
  recurringCosts: RecurringCost[] | null;
  householdConfig: HouseholdConfig | null;
  entities: EntityRecord[] | null;
  accounts: BankAccountRecord[] | null;
} | null> {
  if (!hasSupabaseEnv || !supabase) return null;

  const [
    { data: recurringRows, error: recErr },
    { data: hRow, error: hErr },
    { data: entityRows, error: entErr },
    { data: accountRows, error: accErr },
  ] = await Promise.all([
    supabase
      .from("app_recurring_costs")
      .select(
        "id,label,amount_sek,assigned_entity_id,lane_order,flow_kind,spending_category_id,schedule_start_date,schedule_end_date",
      )
      .eq("household_id", userId),
    supabase
      .from("app_household_config")
      .select("config")
      .eq("household_id", userId)
      .maybeSingle(),
    supabase
      .from("app_entities")
      .select("id,name,entity_type,notes")
      .eq("household_id", userId),
    supabase
      .from("app_bank_accounts")
      .select("id,name,account_number,owner_entity_id,account_category,current_balance_sek")
      .eq("household_id", userId),
  ]);

  if (recErr || hErr || entErr || accErr) {
    console.warn(recErr ?? hErr ?? entErr ?? accErr);
  }

  let recurringCosts: RecurringCost[] | null = null;
  if (recurringRows?.length) {
    recurringCosts = recurringRows.map((row) => ({
      id: row.id as string,
      label: row.label as string,
      amountSek: Number(row.amount_sek),
      kind:
        row.flow_kind === "income" || row.flow_kind === "expense"
          ? row.flow_kind
          : "expense",
      assignedEntityId: row.assigned_entity_id as string,
      laneOrder: Number(row.lane_order ?? 0),
      categoryId: normalizeRecurringFlowCategoryId(
        (row as { spending_category_id?: unknown }).spending_category_id,
      ),
      validFrom:
        (row as { schedule_start_date?: string | null }).schedule_start_date != null
          ? String((row as { schedule_start_date: string }).schedule_start_date).slice(0, 10)
          : null,
      validTo:
        (row as { schedule_end_date?: string | null }).schedule_end_date != null
          ? String((row as { schedule_end_date: string }).schedule_end_date).slice(0, 10)
          : null,
    }));
  }

  let householdConfig: HouseholdConfig | null = null;
  if (hRow?.config && typeof hRow.config === "object") {
    householdConfig = hRow.config as HouseholdConfig;
  }

  let entities: EntityRecord[] | null = null;
  if (entityRows?.length) {
    entities = entityRows.map((row) => ({
      id: row.id as string,
      name: row.name as string,
      type: row.entity_type as EntityRecord["type"],
      notes: (row.notes as string) ?? "",
    }));
  }

  let accounts: BankAccountRecord[] | null = null;
  if (accountRows?.length) {
    accounts = accountRows.map((row) => ({
      id: row.id as string,
      name: row.name as string,
      accountNumber: row.account_number as string,
      ownerEntityId: row.owner_entity_id as string,
      category:
        row.account_category === "bank" ||
        row.account_category === "loan" ||
        row.account_category === "credit"
          ? row.account_category
          : "bank",
      currentBalanceSek: Number(row.current_balance_sek ?? 0),
    }));
  }

  if (!recurringCosts && !householdConfig && !entities?.length && !accounts?.length) return null;
  return { recurringCosts, householdConfig, entities, accounts };
}

export async function loadScenariosFromDb(userId: string): Promise<ScenarioDefinition[] | null> {
  if (!hasSupabaseEnv || !supabase) return null;
  const { data, error } = await supabase
    .from("app_scenarios")
    .select("id,name,definition")
    .eq("household_id", userId)
    .order("updated_at", { ascending: true });

  if (error) {
    console.warn(error);
    return null;
  }
  if (!data?.length) return null;
  return data.map((row) =>
    scenarioFromDbRow({
      id: row.id as string,
      name: row.name as string,
      definition: row.definition,
    }),
  );
}

export async function saveScenariosToDb(
  scenarios: ScenarioDefinition[],
  userId: string,
): Promise<void> {
  if (!hasSupabaseEnv || !supabase) return;
  const householdId = userId;
  const keepIds = new Set(scenarios.map((s) => s.id));

  const { data: existing, error: listErr } = await supabase
    .from("app_scenarios")
    .select("id")
    .eq("household_id", householdId);

  if (listErr) throw listErr;

  const toRemove = (existing ?? [])
    .map((r) => r.id as string)
    .filter((id) => !keepIds.has(id));

  if (toRemove.length > 0) {
    const { error: delErr } = await supabase.from("app_scenarios").delete().in("id", toRemove);
    if (delErr) throw delErr;
  }

  const rows = scenarios.map((s) => {
    const { id, name, description, startDate, endDate, transitionDateOverride, assumptions, events, tiles } = s;
    return {
      id,
      household_id: householdId,
      name,
      definition: {
        description,
        startDate,
        endDate,
        transitionDateOverride,
        assumptions,
        events,
        tiles,
      },
      updated_by: userId,
    };
  });

  if (rows.length === 0) return;

  const { error: upErr } = await supabase.from("app_scenarios").upsert(rows, {
    onConflict: "id",
  });
  if (upErr) throw upErr;
}

export interface HouseholdPlanningPersisted {
  calendarDays: PlanningCalendarDaysMap;
  workRules: WorkScheduleSegment[];
  /**
   * Parsed from `portal_snapshot`; null when empty or invalid JSON in DB.
   * On save, null is stored as `{}` in Postgres.
   */
  portalSnapshot: PlanningPortalReference | null;
}

function parsePlanningCalendarDays(raw: unknown): PlanningCalendarDaysMap {
  if (!raw || typeof raw !== "object") return {};
  const src = raw as Record<string, unknown>;
  const out: PlanningCalendarDaysMap = {};
  for (const [day, marks] of Object.entries(src)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const normalized = normalizePlanningDayMarks(marks);
    if (Object.keys(normalized).length > 0) out[day] = normalized;
  }
  return out;
}

function parseWorkRules(raw: unknown): WorkScheduleSegment[] {
  if (!Array.isArray(raw)) return [];
  const out: WorkScheduleSegment[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    if (
      (o.adultId === "adult1" || o.adultId === "adult2") &&
      typeof o.validFrom === "string" &&
      typeof o.validTo === "string" &&
      typeof o.workingPercentage === "number" &&
      typeof o.daysPerWeek === "number"
    ) {
      out.push({
        adultId: o.adultId,
        validFrom: o.validFrom,
        validTo: o.validTo,
        workingPercentage: o.workingPercentage,
        daysPerWeek: o.daysPerWeek,
      });
    }
  }
  return out;
}

export async function loadHouseholdPlanning(userId: string): Promise<HouseholdPlanningPersisted | null> {
  if (!hasSupabaseEnv || !supabase) return null;
  const { data, error } = await supabase
    .from("app_household_planning")
    .select("calendar_days, work_rules, portal_snapshot")
    .eq("household_id", userId)
    .maybeSingle();
  if (error) {
    console.warn(error);
    return null;
  }
  if (!data) return null;
  return {
    calendarDays: parsePlanningCalendarDays(data.calendar_days),
    workRules: parseWorkRules(data.work_rules),
    portalSnapshot: parsePlanningPortalSnapshot(data.portal_snapshot),
  };
}

export async function saveHouseholdPlanning(
  state: HouseholdPlanningPersisted,
  userId: string,
): Promise<void> {
  if (!hasSupabaseEnv || !supabase) return;
  const { error } = await supabase.from("app_household_planning").upsert(
    {
      household_id: userId,
      calendar_days: state.calendarDays as unknown as Record<string, unknown>,
      work_rules: state.workRules as unknown as Record<string, unknown>[],
      portal_snapshot: (state.portalSnapshot ?? {}) as unknown as Record<string, unknown>,
      updated_by: userId,
    },
    { onConflict: "household_id" },
  );
  throwIfSupabaseError("Saving household planning", error);
}

export async function loadExpenseTrackerBoardsFromDb(
  userId: string,
): Promise<ExpenseTrackerBoard[] | null> {
  if (!hasSupabaseEnv || !supabase) return null;
  const { data, error } = await supabase
    .from("app_expense_tracker_boards")
    .select("id,title,items,sort_order")
    .eq("household_id", userId)
    .order("sort_order", { ascending: true });

  if (error) {
    console.warn(error);
    return null;
  }
  if (!data?.length) return [];
  const out: ExpenseTrackerBoard[] = [];
  data.forEach((row, i) => {
    const b = parseExpenseTrackerBoard(
      {
        id: row.id,
        title: row.title,
        items: row.items,
        sort_order: row.sort_order,
      },
      i,
    );
    if (b) out.push(b);
  });
  return out;
}

export async function saveExpenseTrackerBoardsToDb(
  boards: ExpenseTrackerBoard[],
  userId: string,
): Promise<void> {
  if (!hasSupabaseEnv || !supabase) {
    throw new Error("Supabase is not configured; expense lists cannot be saved.");
  }
  const householdId = userId;
  const keepIds = new Set(boards.map((b) => b.id));

  const { data: existing, error: listErr } = await supabase
    .from("app_expense_tracker_boards")
    .select("id")
    .eq("household_id", householdId);

  if (listErr) throw listErr;

  const toRemove = (existing ?? [])
    .map((r) => r.id as string)
    .filter((id) => !keepIds.has(id));

  if (toRemove.length > 0) {
    const { error: delErr } = await supabase
      .from("app_expense_tracker_boards")
      .delete()
      .in("id", toRemove);
    if (delErr) throw delErr;
  }

  const rows = boards.map((b, index) => {
    let itemsJson: unknown[] = [];
    try {
      itemsJson = JSON.parse(JSON.stringify(b.items)) as unknown[];
    } catch {
      itemsJson = [];
    }
    return {
      id: b.id,
      household_id: householdId,
      title: b.title.trim() || "Untitled list",
      items: itemsJson,
      sort_order: b.sortOrder ?? index,
      updated_by: userId,
    };
  });

  if (rows.length === 0) return;

  const { error: upErr } = await supabase.from("app_expense_tracker_boards").upsert(rows, {
    onConflict: "id",
  });
  if (upErr) throw upErr;
}
