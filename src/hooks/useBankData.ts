import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { buildAccountBalanceHistory, type AccountBalancePoint, type DbTransaction } from "@/data/bankLiquidityHistory";
import { extractRecurringFromBankImports, type CsvRecurringResult } from "@/data/csvRecurringExtract";
import { buildAllTransactions, type MergedTransaction } from "@/data/allTransactions";
import {
  buildBankAccountsFromDb,
  defaultLiquidityFromAccounts,
  type BankAccountRow,
  type DbBankAccount,
} from "@/data/realWorldBalanceSheet";
import { useI18n } from "@/i18n/I18nContext";

/** Stable references when the DB returns no rows — avoids useMemo churn from `setState([])` identity changes. */
const EMPTY_DB_ACCOUNTS: DbBankAccount[] = [];
const EMPTY_DB_TX: DbTransaction[] = [];
const EMPTY_RECURRING: CsvRecurringResult = { incomeStreams: [], expenses: [], hasData: false };
const EMPTY_BALANCE_HISTORY: AccountBalancePoint[] = [];
const EMPTY_ALL_TX: MergedTransaction[] = [];

export type BankData = {
  loading: boolean;
  /** True after the first fetch cycle finishes while enabled (success or error). */
  fetchComplete: boolean;
  error: string | null;
  accounts: BankAccountRow[];
  transactionCount: number;
  balanceHistory: AccountBalancePoint[];
  recurring: CsvRecurringResult;
  allTransactions: MergedTransaction[];
  defaultLiquidity: number;
};

/**
 * Loads bank tables from Supabase. Requires an authenticated session (RLS).
 * @param enabled When false, skips network requests (e.g. logged out or auth still loading).
 */
export function useBankData(enabled: boolean): BankData {
  const { numberLocale } = useI18n();
  const [dbAccounts, setDbAccounts] = useState<DbBankAccount[]>(EMPTY_DB_ACCOUNTS);
  const [dbTx, setDbTx] = useState<DbTransaction[]>(EMPTY_DB_TX);
  const [loading, setLoading] = useState(true);
  const [fetchComplete, setFetchComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setDbAccounts(EMPTY_DB_ACCOUNTS);
      setDbTx(EMPTY_DB_TX);
      setError(null);
      setLoading(false);
      setFetchComplete(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setFetchComplete(false);
      setError(null);

      const [acctRes, txRes] = await Promise.all([
        supabase.from("bank_accounts").select("*"),
        supabase.from("bank_transactions").select("*").order("transaction_date", { ascending: false }),
      ]);

      if (cancelled) return;

      if (acctRes.error) {
        setError(acctRes.error.message);
        setDbAccounts(EMPTY_DB_ACCOUNTS);
        setDbTx(EMPTY_DB_TX);
        setLoading(false);
        setFetchComplete(true);
        return;
      }
      if (txRes.error) {
        setError(txRes.error.message);
        setDbAccounts(EMPTY_DB_ACCOUNTS);
        setDbTx(EMPTY_DB_TX);
        setLoading(false);
        setFetchComplete(true);
        return;
      }

      const accRows = (acctRes.data ?? []) as DbBankAccount[];
      const txRows = (txRes.data ?? []) as DbTransaction[];
      setDbAccounts(accRows.length > 0 ? accRows : EMPTY_DB_ACCOUNTS);
      setDbTx(txRows.length > 0 ? txRows : EMPTY_DB_TX);
      setLoading(false);
      setFetchComplete(true);
    }

    void load();
    return () => { cancelled = true; };
  }, [enabled]);

  const accounts = useMemo(() => buildBankAccountsFromDb(dbAccounts), [dbAccounts]);

  const balanceHistory = useMemo(
    () => (dbTx.length > 0 ? buildAccountBalanceHistory(dbTx, numberLocale).series : EMPTY_BALANCE_HISTORY),
    [dbTx, numberLocale],
  );

  const recurring = useMemo(
    () => (dbTx.length > 0 ? extractRecurringFromBankImports(dbTx) : EMPTY_RECURRING),
    [dbTx],
  );

  const allTransactions = useMemo(
    () => (dbTx.length > 0 ? buildAllTransactions(dbTx) : EMPTY_ALL_TX),
    [dbTx],
  );

  const defaultLiquidity = useMemo(() => defaultLiquidityFromAccounts(accounts), [accounts]);

  return {
    loading,
    fetchComplete,
    error,
    accounts,
    transactionCount: dbTx.length,
    balanceHistory,
    recurring,
    allTransactions,
    defaultLiquidity,
  };
}
