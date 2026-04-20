/**
 * Recurring row category for UI grouping and icons. Persisted as `app_recurring_costs.spending_category_id`.
 */
export const RECURRING_FLOW_CATEGORY_IDS = [
  "housing",
  "utilities",
  "transport",
  "food",
  "insurance",
  "subscriptions",
  "childcare",
  "health",
  "salary",
  "benefits",
  "other",
] as const;

export type RecurringFlowCategoryId = (typeof RECURRING_FLOW_CATEGORY_IDS)[number];

const LABELS: Record<RecurringFlowCategoryId, string> = {
  housing: "Housing",
  utilities: "Utilities",
  transport: "Transport",
  food: "Food & groceries",
  insurance: "Insurance",
  subscriptions: "Subscriptions",
  childcare: "Childcare",
  health: "Health",
  salary: "Salary / wages",
  benefits: "Benefits & transfers in",
  other: "Other",
};

export function recurringFlowCategoryLabel(id: RecurringFlowCategoryId): string {
  return LABELS[id] ?? LABELS.other;
}

export function normalizeRecurringFlowCategoryId(raw: unknown): RecurringFlowCategoryId {
  if (
    typeof raw === "string" &&
    (RECURRING_FLOW_CATEGORY_IDS as readonly string[]).includes(raw)
  ) {
    return raw as RecurringFlowCategoryId;
  }
  return "other";
}
