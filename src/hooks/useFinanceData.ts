import { useEffect, useCallback, useRef } from "react";
import { useAppStore } from "@/stores/appStore";
import { getBackend } from "./useBackend";
import { activeOnly } from "@/utils/activeOnly";
import {
  restoreFileStorageFromDisk,
  getFileStorageDirectoryName,
  isLocalVaultLockedOnDisk,
  lockLocalVaultForSignOut,
} from "@/adapter/fileJson";
import { useCardValuesStore } from "@/stores/cardValuesStore";

export function useFinanceData() {
  const dataStorageMode = useAppStore((s) => s.dataStorageMode);
  const {
    user, setHousehold,
    setEntities, setAccounts, setTransactions, setCashflows, setLoans, setBenefits, setPeriods,
    setLoading, setCardLayout, setRefreshFn,
  } = useAppStore();

  const userRef = useRef(user);
  userRef.current = user;

  const refresh = useCallback(async () => {
    const u = userRef.current;
    if (!u) return;
    const state = useAppStore.getState();
    if (state.dataStorageMode === "file") {
      try {
        await restoreFileStorageFromDisk();
      } catch (e) {
        console.warn("Could not restore file storage from disk:", e);
      }
      state.setFileStorageFolderName(getFileStorageDirectoryName());

      if (await isLocalVaultLockedOnDisk()) {
        console.warn(
          "[file storage] Vault file is encrypted but this session never unlocked it. Signing you out — use Local sign-in with your vault password so data can load (linking the folder from settings without unlocking can destroy data; this build blocks that overwrite).",
        );
        lockLocalVaultForSignOut();
        state.clearFinanceData();
        state.setUser(null);
        setLoading(false);
        return;
      }
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
          city: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        if (state.dataStorageMode === "supabase") {
          const { getSupabase } = await import("@/lib/supabase");
          await getSupabase().from("household_members").insert({
            household_id: hh.id,
            user_id: u.id,
            role: "owner",
          });
        }
      }
      setHousehold(hh);
      useCardValuesStore.getState().ensureHousehold(hh.id);

      const [entities, accounts, cashflows, loans, benefits, periods, transactions] = await Promise.all([
        be.listEntities(hh.id),
        be.listAccounts(hh.id),
        be.listCashflows(hh.id),
        be.listLoans(hh.id),
        be.listBenefits(hh.id),
        be.listPeriods(hh.id),
        be.listTransactionsForHousehold(hh.id),
      ]);

      setEntities(activeOnly(entities));
      setAccounts(activeOnly(accounts));
      setTransactions(transactions);
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
    setHousehold, setEntities, setAccounts, setTransactions, setCashflows, setLoans, setBenefits, setPeriods,
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
