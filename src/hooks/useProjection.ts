import { useMemo, useState, useEffect } from "react";
import { useAppStore } from "@/stores/appStore";
import { getBackend } from "@/hooks/useBackend";
import { computeProjection, type ProjectionInput } from "@/engine/projection";
import type { HouseholdProjection, MonthlyProjection } from "@/types/engine";
import type { PeriodDayOverride } from "@/types/schema";
import { startOfMonth } from "date-fns";

/**
 * Runs the projection engine using current app state.
 * Returns a per-entity-per-month breakdown for the next `months` months.
 */
export function useProjection(months = 6): HouseholdProjection {
  const entities = useAppStore((s) => s.entities);
  const accounts = useAppStore((s) => s.accounts);
  const cashflows = useAppStore((s) => s.cashflows);
  const periods = useAppStore((s) => s.periods);
  const loans = useAppStore((s) => s.loans);
  const benefits = useAppStore((s) => s.benefits);
  const household = useAppStore((s) => s.household);
  const dataStorageMode = useAppStore((s) => s.dataStorageMode);

  const [dayOverrides, setDayOverrides] = useState<PeriodDayOverride[]>([]);

  const periodIdsKey = useMemo(() => {
    const ids = periods.filter((p) => !p.archived_at).map((p) => p.id);
    ids.sort();
    return ids.join(",");
  }, [periods]);

  useEffect(() => {
    let cancelled = false;
    if (!periodIdsKey) {
      setDayOverrides([]);
      return;
    }
    const ids = periodIdsKey.split(",").filter(Boolean);
    void (async () => {
      const be = getBackend(dataStorageMode);
      const batches = await Promise.all(ids.map((id) => be.listDayOverrides(id)));
      const flat = batches.flat();
      if (!cancelled) setDayOverrides(flat);
    })();
    return () => {
      cancelled = true;
    };
  }, [dataStorageMode, periodIdsKey]);

  return useMemo(() => {
    if (entities.length === 0) {
      return { months: [], totals: { gross_income: 0, net_income: 0, total_expenses: 0, surplus: 0 } };
    }
    const input: ProjectionInput = {
      entities,
      accounts,
      cashflows,
      periods,
      dayOverrides,
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
  }, [entities, accounts, cashflows, periods, loans, benefits, household, months, dayOverrides]);
}

/** Current month's projection row for a specific entity. */
export function useCurrentMonthProjection(entityId: string): MonthlyProjection | null {
  const projection = useProjection(1);
  return projection.months.find(m => m.entity_id === entityId) ?? null;
}
