import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadHouseholdPlanning,
  saveHouseholdPlanning,
  type HouseholdPlanningPersisted,
} from "../lib/appDataService";
import type { PlanningPortalReference } from "../utils/finance/planningPortalSnapshot";
import {
  applyWeeklyPattern,
  eachDateInclusive,
  mergeCalendarDays,
} from "../utils/finance/householdCalendarMarks";
import type {
  PlanningCalendarDaysMap,
  PlanningDayMark,
  PlanningPersonBookings,
  PlanningPersonCode,
  WorkScheduleSegment,
} from "../utils/finance/householdCalendarTypes";
import { isBenefitMark, normalizePersonBookings } from "../utils/finance/householdCalendarTypes";

export function useHouseholdPlanningCalendar(userId: string | undefined) {
  const [calendarDays, setCalendarDays] = useState<PlanningCalendarDaysMap>({});
  const [workRules, setWorkRules] = useState<WorkScheduleSegment[]>([]);
  const [portalSnapshot, setPortalSnapshot] = useState<PlanningPortalReference | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [persistStatus, setPersistStatus] = useState("");
  const skipNextSave = useRef(true);
  /** Last portal parsed from DB; used on save so calendar-only edits do not clear `portal_snapshot`. */
  const lastLoadedPortalRef = useRef<PlanningPortalReference | null>(null);

  useEffect(() => {
    let cancelled = false;
    skipNextSave.current = true;
    if (!userId) {
      setCalendarDays({});
      setWorkRules([]);
      setPortalSnapshot(null);
      lastLoadedPortalRef.current = null;
      setHydrated(true);
      return;
    }
    void loadHouseholdPlanning(userId).then((data) => {
      if (cancelled) return;
      if (data) {
        setCalendarDays(data.calendarDays);
        setWorkRules(data.workRules);
        setPortalSnapshot(data.portalSnapshot);
        lastLoadedPortalRef.current = data.portalSnapshot;
      } else {
        setCalendarDays({});
        setWorkRules([]);
        setPortalSnapshot(null);
        lastLoadedPortalRef.current = null;
      }
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!hydrated || !userId) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const portalToPersist = portalSnapshot ?? lastLoadedPortalRef.current;
          const payload: HouseholdPlanningPersisted = {
            calendarDays,
            workRules,
            portalSnapshot: portalToPersist,
          };
          await saveHouseholdPlanning(payload, userId);
          setPersistStatus("");
        } catch (e) {
          setPersistStatus(
            e instanceof Error ? e.message : "Could not save planning calendar.",
          );
        }
      })();
    }, 800);
    return () => window.clearTimeout(t);
  }, [hydrated, userId, calendarDays, workRules, portalSnapshot]);

  const mergePatch = useCallback((patch: PlanningCalendarDaysMap) => {
    setCalendarDays((prev) => mergeCalendarDays(prev, patch));
  }, []);

  const applyWeekly = useCallback(
    (args: Omit<Parameters<typeof applyWeeklyPattern>[0], "base">) => {
      setCalendarDays((prev) => applyWeeklyPattern({ ...args, base: prev }));
    },
    [],
  );

  /** @deprecated Prefer setPersonBookings / appendBooking — kept for callers passing a single mark. */
  const setDayMark = useCallback((iso: string, person: PlanningPersonCode, mark: PlanningDayMark) => {
    const bookings =
      mark === "" ? [] : mark === "PL" || mark === "WK" || mark === "AK" ? [mark] : [];
    mergePatch({ [iso]: { [person]: bookings } });
  }, [mergePatch]);

  const setPersonBookings = useCallback(
    (iso: string, person: PlanningPersonCode, bookings: PlanningPersonBookings) => {
      const b = bookings.filter(isBenefitMark);
      mergePatch({ [iso]: { [person]: b } });
    },
    [mergePatch],
  );

  const appendBooking = useCallback(
    (iso: string, person: PlanningPersonCode, mark: "PL" | "WK" | "AK") => {
      setCalendarDays((prev) => {
        const cur = normalizePersonBookings(prev[iso]?.[person]);
        return mergeCalendarDays(prev, { [iso]: { [person]: [...cur, mark] } });
      });
    },
    [],
  );

  const removeBookingAt = useCallback((iso: string, person: PlanningPersonCode, index: number) => {
    setCalendarDays((prev) => {
      const cur = [...normalizePersonBookings(prev[iso]?.[person])];
      cur.splice(index, 1);
      return mergeCalendarDays(prev, { [iso]: { [person]: cur } });
    });
  }, []);

  const applyMarkToRange = useCallback(
    (
      fromIso: string,
      toIso: string,
      person: PlanningPersonCode,
      mark: "PL" | "WK" | "AK",
      mode: "replace" | "append",
    ) => {
      setCalendarDays((prev) => {
        const patch: PlanningCalendarDaysMap = {};
        for (const iso of eachDateInclusive(fromIso, toIso)) {
          if (mode === "replace") {
            patch[iso] = { [person]: [mark] };
          } else {
            const cur = normalizePersonBookings(prev[iso]?.[person]);
            patch[iso] = { [person]: [...cur, mark] };
          }
        }
        return mergeCalendarDays(prev, patch);
      });
    },
    [],
  );

  return {
    calendarDays,
    setCalendarDays,
    mergePatch,
    setDayMark,
    setPersonBookings,
    appendBooking,
    removeBookingAt,
    applyMarkToRange,
    applyWeekly,
    workRules,
    setWorkRules,
    portalSnapshot,
    setPortalSnapshot,
    persistStatus,
    hydrated,
  };
}
