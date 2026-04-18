import type { HouseholdConfig } from "../config/householdConfig";
import type {
  BankAccountRecord,
  EntityRecord,
  RecurringCost,
} from "../data/bankData";
import { hasSupabaseEnv, supabase } from "./supabase";

export const DEFAULT_HOUSEHOLD_ID = "demo-household-se-001";

export async function saveCurrentFinanceState(params: {
  entities: EntityRecord[];
  accounts: BankAccountRecord[];
  recurringCosts: RecurringCost[];
  userId: string;
}): Promise<void> {
  if (!hasSupabaseEnv || !supabase) return;

  const householdId = DEFAULT_HOUSEHOLD_ID;
  await supabase.from("app_entities").upsert(
    params.entities.map((entity) => ({
      id: entity.id,
      household_id: householdId,
      name: entity.name,
      entity_type: entity.type,
      notes: entity.notes,
      updated_by: params.userId,
    })),
    { onConflict: "id" },
  );

  await supabase.from("app_bank_accounts").upsert(
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

  const updates = params.recurringCosts.map((cost) => ({
    id: cost.id,
    household_id: householdId,
    label: cost.label,
    amount_sek: cost.amountSek,
    assigned_entity_id: cost.assignedEntityId,
    lane_order: cost.laneOrder,
    flow_kind: cost.kind,
    updated_by: params.userId,
  }));

  await supabase.from("app_recurring_costs").upsert(updates, {
    onConflict: "id",
  });

  await supabase.from("app_recurring_cost_audit").insert(
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
}

export async function deleteRecurringCostRemote(recurringId: string): Promise<void> {
  if (!hasSupabaseEnv || !supabase) return;
  const householdId = DEFAULT_HOUSEHOLD_ID;
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
  await supabase.from("app_household_config").upsert(
    {
      household_id: DEFAULT_HOUSEHOLD_ID,
      config: config as unknown as Record<string, unknown>,
      updated_by: userId,
    },
    { onConflict: "household_id" },
  );
}

export async function loadAppPersistedState(userId: string): Promise<{
  recurringCosts: RecurringCost[] | null;
  householdConfig: HouseholdConfig | null;
} | null> {
  if (!hasSupabaseEnv || !supabase) return null;

  const [{ data: recurringRows, error: recErr }, { data: hRow, error: hErr }] =
    await Promise.all([
      supabase
        .from("app_recurring_costs")
        .select("id,label,amount_sek,assigned_entity_id,lane_order,flow_kind")
        .eq("household_id", DEFAULT_HOUSEHOLD_ID),
      supabase
        .from("app_household_config")
        .select("config")
        .eq("household_id", DEFAULT_HOUSEHOLD_ID)
        .maybeSingle(),
    ]);

  if (recErr || hErr) {
    console.warn(recErr ?? hErr);
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
    }));
  }

  let householdConfig: HouseholdConfig | null = null;
  if (hRow?.config && typeof hRow.config === "object") {
    householdConfig = hRow.config as HouseholdConfig;
  }

  if (!recurringCosts && !householdConfig) return null;
  return { recurringCosts, householdConfig };
}
