import type { SupabaseClient } from "@supabase/supabase-js";

/** One month of cashflow totals plus per-account net (same shape as bundled CSV aggregation). */
export interface MonthlySeriesPoint {
  month: string;
  totalIncomeSek: number;
  totalCostSek: number;
  netCashflowSek: number;
  byAccountNetSek: Record<string, number>;
}

export type BankTxForSeries = {
  dateIso: string;
  amountSek: number;
  accountId: string;
};

/**
 * Aggregates signed amounts by calendar month and bank account id (matches bundled CSV behaviour).
 */
export function aggregateMonthlySeriesFromTransactions(
  transactions: BankTxForSeries[],
): MonthlySeriesPoint[] {
  const bucket = new Map<string, MonthlySeriesPoint>();
  for (const tx of transactions) {
    const month = tx.dateIso.slice(0, 7);
    const existing = bucket.get(month) ?? {
      month,
      totalIncomeSek: 0,
      totalCostSek: 0,
      netCashflowSek: 0,
      byAccountNetSek: {},
    };
    if (tx.amountSek >= 0) {
      existing.totalIncomeSek += tx.amountSek;
    } else {
      existing.totalCostSek += Math.abs(tx.amountSek);
    }
    existing.netCashflowSek += tx.amountSek;
    existing.byAccountNetSek[tx.accountId] =
      (existing.byAccountNetSek[tx.accountId] ?? 0) + tx.amountSek;
    bucket.set(month, existing);
  }

  return Array.from(bucket.values()).sort((a, b) => a.month.localeCompare(b.month));
}

export async function loadMonthlySeriesFromSupabase(params: {
  supabase: SupabaseClient;
  householdId: string;
}): Promise<{ series: MonthlySeriesPoint[]; rowCount: number }> {
  const { data, error } = await params.supabase
    .from("app_bank_transaction_lines")
    .select("bank_account_id, booked_date, amount_sek")
    .eq("household_id", params.householdId);

  if (error) throw error;

  const rows = data ?? [];
  const txs: BankTxForSeries[] = rows.map((r) => {
    const raw = r.booked_date as string;
    const dateIso = typeof raw === "string" ? raw.slice(0, 10) : String(raw);
    return {
      dateIso,
      amountSek: Number(r.amount_sek),
      accountId: String(r.bank_account_id),
    };
  });

  return {
    series: aggregateMonthlySeriesFromTransactions(txs),
    rowCount: rows.length,
  };
}
