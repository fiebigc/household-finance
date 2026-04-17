import type { RecurringKind } from "../../data/bankData";

/** Expense tiles: red; income tiles: green (semantic cash direction). */
export function recurringFlowClass(kind: RecurringKind): string {
  return kind === "income" ? "recurring-flow-income" : "recurring-flow-expense";
}
