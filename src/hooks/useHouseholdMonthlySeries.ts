import { useEffect, useState } from "react";
import { buildMonthlySeriesFromCsv } from "@/data/bankData";
import { hasSupabaseEnv, supabase } from "@/lib/supabase";
import type { MonthlySeriesPoint } from "@/utils/finance/bankTransactionSeries";
import { loadMonthlySeriesFromSupabase } from "@/utils/finance/bankTransactionSeries";

export type MonthlySeriesDataSource = "supabase" | "bundled";

export function useHouseholdMonthlySeries(userId: string | undefined, refreshKey: number): {
  series: MonthlySeriesPoint[];
  dataSource: MonthlySeriesDataSource;
  loading: boolean;
} {
  const [series, setSeries] = useState<MonthlySeriesPoint[]>(() => buildMonthlySeriesFromCsv());
  const [dataSource, setDataSource] = useState<MonthlySeriesDataSource>("bundled");
  const [loading, setLoading] = useState(() => Boolean(hasSupabaseEnv && supabase));

  useEffect(() => {
    if (!hasSupabaseEnv || !supabase || !userId) {
      setSeries(buildMonthlySeriesFromCsv());
      setDataSource("bundled");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void loadMonthlySeriesFromSupabase({
      supabase,
      householdId: userId,
    })
      .then(({ series: next, rowCount }) => {
        if (cancelled) return;
        if (rowCount > 0) {
          setSeries(next);
          setDataSource("supabase");
        } else {
          setSeries(buildMonthlySeriesFromCsv());
          setDataSource("bundled");
        }
        setLoading(false);
      })
      .catch((e) => {
        console.warn(e);
        if (cancelled) return;
        setSeries(buildMonthlySeriesFromCsv());
        setDataSource("bundled");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, refreshKey]);

  return { series, dataSource, loading };
}
