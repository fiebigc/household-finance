import { useAppStore } from "@/stores/appStore";
import { useCardValuesStore, getMergedCardValues, type CardValuesForHousehold } from "@/stores/cardValuesStore";
import { useMemo } from "react";

export function useHouseholdCardValues() {
  const householdId = useAppStore((s) => s.household?.id ?? null);
  const byHousehold = useCardValuesStore((s) => s.byHousehold);
  const updateHousehold = useCardValuesStore((s) => s.updateHousehold);

  const values = useMemo(() => getMergedCardValues(householdId), [byHousehold, householdId]);

  const update = (fn: (prev: CardValuesForHousehold) => CardValuesForHousehold) => {
    if (householdId) updateHousehold(householdId, fn);
  };

  return { householdId, values, update };
}
