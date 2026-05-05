import { useMemo } from "react";
import { useAppStore } from "@/stores/appStore";
import { computeProjection, type ProjectionInput } from "@/engine/projection";
import type { HouseholdProjection, MonthlyProjection } from "@/types/engine";
import { startOfMonth } from "date-fns";

/**
 * Runs the projection engine using current app state.
 * Returns a per-entity-per-month breakdown for the next `months` months.
 */
export function useProjection(months = 6): HouseholdProjection {
  const { entities, accounts, cashflows, periods, loans, benefits, household } = useAppStore();

  return useMemo(() => {
    if (entities.length === 0) {
      return { months: [], totals: { gross_income: 0, net_income: 0, total_expenses: 0, surplus: 0 } };
    }
    const input: ProjectionInput = {
      entities,
      accounts,
      cashflows,
      periods,
      dayOverrides: [],
      loans,
      benefits,
      taxProfiles: [],
      startMonth: startOfMonth(new Date()),
      months,
      householdLocation: household
        ? { country: household.country, city: household.city }
        : null,
    };
    return computeProjection(input);
  }, [entities, accounts, cashflows, periods, loans, benefits, household, months]);
}

/** Current month's projection row for a specific entity. */
export function useCurrentMonthProjection(entityId: string): MonthlyProjection | null {
  const projection = useProjection(1);
  return projection.months.find(m => m.entity_id === entityId) ?? null;
}
