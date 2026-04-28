import { useEffect, useCallback, useRef } from "react";
import { useAppStore } from "@/stores/appStore";
import { getBackend } from "./useBackend";
import { activeOnly } from "@/utils/activeOnly";
import {
  restoreFileStorageFromDisk,
  getFileStorageDirectoryName,
} from "@/adapter/fileJson";

export function useFinanceData() {
  const dataStorageMode = useAppStore((s) => s.dataStorageMode);
  const {
    user, setHousehold,
    setEntities, setAccounts, setCashflows, setLoans, setBenefits, setPeriods,
    setLoading, setCardLayout, setRefreshFn,
  } = useAppStore();

  const userRef = useRef(user);
  userRef.current = user;

  const refresh = useCallback(async () => {
    const u = userRef.current;
    if (!u) return;
    const state = useAppStore.getState();
    if (state.dataStorageMode === "file") {
      await restoreFileStorageFromDisk();
      state.setFileStorageFolderName(getFileStorageDirectoryName());
    }
    const be = getBackend(state.dataStorageMode);
    setLoading(true);
    try {
      let hh = await be.getHouseholdForUser(u.id);
      if (!hh) {
        const id = crypto.randomUUID();
        hh = await be.upsertHousehold({
          id,
          name: "My Household",
          currency: "SEK",
          country: "SE",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        if (state.dataStorageMode === "supabase") {
          const { supabase } = await import("@/lib/supabase");
          await supabase.from("household_members").insert({
            household_id: hh.id,
            user_id: u.id,
            role: "owner",
          });
        }
      }
      setHousehold(hh);

      const [entities, accounts, cashflows, loans, benefits, periods] = await Promise.all([
        be.listEntities(hh.id),
        be.listAccounts(hh.id),
        be.listCashflows(hh.id),
        be.listLoans(hh.id),
        be.listBenefits(hh.id),
        be.listPeriods(hh.id),
      ]);

      setEntities(activeOnly(entities));
      setAccounts(activeOnly(accounts));
      setCashflows(activeOnly(cashflows));
      setLoans(loans);
      setBenefits(activeOnly(benefits));
      setPeriods(activeOnly(periods));

      for (const tab of ["overview", "planning", "data", "expenses", "retirement"] as const) {
        const layout = await be.getCardLayout(u.id, tab);
        if (layout) setCardLayout(tab, layout.cards);
      }
    } catch (err) {
      console.error("Failed to load finance data:", err);
    } finally {
      setLoading(false);
    }
  }, [
    setHousehold, setEntities, setAccounts, setCashflows, setLoans, setBenefits, setPeriods,
    setLoading, setCardLayout, dataStorageMode,
  ]);

  useEffect(() => {
    setRefreshFn(refresh);
  }, [refresh, setRefreshFn]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { refresh };
}
