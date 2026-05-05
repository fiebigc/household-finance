import { useState, useMemo, useEffect, useCallback } from "react";
import { BentoGrid, type BentoCardDefinition } from "@/components/BentoGrid";
import { Card } from "@/components/ui/BentoCard";
import { useAppStore } from "@/stores/appStore";
import { accountVisibleForEntity } from "@/utils/accountShared";
import { cashflowContributesToPnLTotals } from "@/utils/cashflowAccounts";
import { cashflowIncomeInternalHideFromFlow, cashflowExcludedFromHouseholdTotals } from "@/utils/cashflowIncomeVisibility";
import { employmentIncomeCountsInProjectionMonth } from "@/utils/cashflowEmployment";
import { useHouseholdCardValues } from "@/hooks/useHouseholdCardValues";
import { useProjection } from "@/hooks/useProjection";
import { CardNumericFieldsDialog } from "@/components/CardNumericFieldsDialog";
import { formatSEK, formatPercent, formatCompact } from "@/lib/utils";
import {
  TrendingUp, Wallet, PiggyBank, Building2,
  CreditCard, Activity, DollarSign, Users, BarChart3,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import {
  buildMonthlyAccountFlowChartData,
  chartShortAccountName,
  type AccountFlowSeries,
} from "@/utils/accountTxMonthlyChart";
import type { HouseholdProjection } from "@/types/engine";
import type { Account } from "@/types/schema";
import { format, parseISO, startOfMonth, addMonths } from "date-fns";
import { CsvImportModal } from "@/components/CsvImportModal";
import { OpenCsvImportContext } from "@/context/OpenCsvImportContext";
import { usePlanningBentoCards } from "@/pages/PlanningPage";
import { useDataSettingsBentoCards } from "@/pages/DataSettingsPage";
import { useExpensesBentoCards } from "@/pages/ExpensesPage";
import { useRetirementBentoCards } from "@/pages/RetirementPage";
import { useTranslation } from "react-i18next";

type BentoRender = Parameters<BentoCardDefinition["render"]>[0];

function mirrorCardsForOverview(defs: BentoCardDefinition[]): BentoCardDefinition[] {
  return defs.map((d) => ({ ...d, defaultVisible: false }));
}

/** Forward steps aligned with balance chart (projection engine horizons). */
const BALANCE_CHART_PROJECTION_MONTHS = 6;

/**
 * Builds balance chart rows aligned with Import detail: same bank-like accounts, same data keys
 * (`householdNet`, `balance_<accountId>`). Per-account = snapshot × (1+drift)^step + share × cumulative modeled surplus.
 */
function buildBalanceProjectionRows(
  accounts: Account[],
  drift: number,
  projection: HouseholdProjection,
  series: AccountFlowSeries[],
): Record<string, unknown>[] {
  let liquidity: Account[] = [];
  if (series.length > 0) {
    for (const s of series) {
      const a = accounts.find((x) => x.id === s.id && !x.archived_at);
      if (a) liquidity.push(a);
    }
  } else {
    liquidity = accounts.filter((a) => !a.archived_at && a.type !== "loan" && a.type !== "credit");
  }

  const surplusByMonth = new Map<string, number>();
  for (const row of projection.months) {
    surplusByMonth.set(row.month, (surplusByMonth.get(row.month) ?? 0) + row.surplus);
  }
  const monthKeys = [...surplusByMonth.keys()].sort();

  let snapTotal = 0;
  for (const a of liquidity) {
    snapTotal += a.balance_snapshot || 0;
  }

  const shareOfAccount = (a: Account): number =>
    snapTotal > 0
      ? (a.balance_snapshot || 0) / snapTotal
      : liquidity.length > 0
        ? 1 / liquidity.length
        : 0;

  const monthlySurplus = monthKeys.map((mk) => surplusByMonth.get(mk) ?? 0);
  let cumulativeModeledHouseholdSurplus = 0;
  const rows: Record<string, unknown>[] = [];

  for (let step = 0; step < BALANCE_CHART_PROJECTION_MONTHS; step++) {
    if (step >= 1) cumulativeModeledHouseholdSurplus += monthlySurplus[step - 1] ?? 0;
    const driftFactor = Math.pow(1 + drift, step);

    const mk = monthKeys[step];
    const monthLabel = mk
      ? format(parseISO(`${mk}-01`), "MMM yy")
      : format(addMonths(startOfMonth(new Date()), step), "MMM yy");

    const row: Record<string, unknown> = { monthLabel };

    let householdTotal = 0;
    for (const a of liquidity) {
      const snap = a.balance_snapshot || 0;
      const v = snap * driftFactor + shareOfAccount(a) * cumulativeModeledHouseholdSurplus;
      row[`balance_${a.id}`] = v;
      householdTotal += v;
    }
    row.householdNet = householdTotal;
    rows.push(row);
  }

  return rows;
}

function barMonthFactor(i: number, count: number, spreadPct: number): number {
  if (count <= 1 || spreadPct === 0) return 1;
  const t = i / (count - 1);
  return 1 + (t - 0.5) * 2 * (spreadPct / 100);
}

const CHART_COLORS = ["#3b82f6", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#64748b"];

function AccountOverviewCardContent() {
  const { accounts, transactions } = useAppStore();
  const { values } = useHouseholdCardValues();
  const drift = values.overview.accountBalanceMonthlyDrift;
  const [view, setView] = useState<"imports" | "projection">("imports");

  /** Calendar periods + cashflows → monthly surplus feeds balance steps (snapshots unchanged). */
  const projectionForBalance = useProjection(BALANCE_CHART_PROJECTION_MONTHS);

  const { data: importChartData, series: chartBankSeries } = useMemo(
    () => buildMonthlyAccountFlowChartData(accounts, transactions),
    [accounts, transactions],
  );

  /** Same accounts & short labels as Import detail; fallback if no bank-like accounts yet. */
  const balanceSeriesForChart = useMemo((): AccountFlowSeries[] => {
    if (chartBankSeries.length > 0) return chartBankSeries;
    return accounts
      .filter((a) => !a.archived_at && a.type !== "loan" && a.type !== "credit")
      .map((a) => ({
        id: a.id,
        name: a.name,
        shortLabel: chartShortAccountName(a.name),
      }));
  }, [accounts, chartBankSeries]);

  const hasImportChart = importChartData.length > 0 && chartBankSeries.length > 0;

  const projectionData = useMemo(
    () =>
      buildBalanceProjectionRows(accounts, drift, projectionForBalance, balanceSeriesForChart),
    [accounts, drift, projectionForBalance, balanceSeriesForChart],
  );

  const importAreaData = useMemo(() => {
    return importChartData.map((row) => {
      const o: Record<string, unknown> = {
        monthLabel: row.monthLabel,
        monthKey: row.monthKey,
      };
      let householdNet = 0;
      for (const s of chartBankSeries) {
        const inf = Number(row[`in_${s.id}`] ?? 0);
        const outf = Number(row[`out_${s.id}`] ?? 0);
        const net = inf - outf;
        o[`net_${s.id}`] = net;
        householdNet += net;
      }
      o.householdNet = householdNet;
      return o;
    });
  }, [importChartData, chartBankSeries]);

  useEffect(() => {
    if (!hasImportChart) setView("projection");
  }, [hasImportChart]);

  if (accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground text-sm">
        <Wallet className="w-8 h-8 mb-2 opacity-40" />
        <p>No accounts yet</p>
        <p className="text-xs mt-1">Add accounts in Data & Settings</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 min-h-0 flex-1">
      {hasImportChart && (
        <div className="flex gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setView("imports")}
            className={`px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
              view === "imports"
                ? "bg-primary text-primary-foreground"
                : "bg-muted/60 text-muted-foreground hover:bg-muted"
            }`}
          >
            Import detail
          </button>
          <button
            type="button"
            onClick={() => setView("projection")}
            className={`px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
              view === "projection"
                ? "bg-primary text-primary-foreground"
                : "bg-muted/60 text-muted-foreground hover:bg-muted"
            }`}
          >
            Balance projection
          </button>
        </div>
      )}

      {view === "imports" && hasImportChart ? (
        <>
          <p className="text-[10px] text-muted-foreground shrink-0 leading-snug">
            From CSV imports (bank, savings, credit, investment): <span className="font-medium text-card-foreground">Household net</span> is total inflow minus outflow per month. Dashed lines are each account&apos;s net (in − out).
          </p>
          <ResponsiveContainer width="100%" height={280} className="min-h-[200px]">
            <AreaChart data={importAreaData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="import-household-net-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(142 71% 45%)" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="hsl(142 71% 45%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 91%)" />
              <XAxis
                dataKey="monthLabel"
                tick={{ fontSize: 10 }}
                stroke="hsl(220 9% 46%)"
                interval={0}
                angle={-20}
                textAnchor="end"
                height={44}
              />
              <YAxis tick={{ fontSize: 10 }} stroke="hsl(220 9% 46%)" tickFormatter={(v) => formatCompact(v)} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(0 0% 100%)",
                  border: "1px solid hsl(220 13% 91%)",
                  borderRadius: "10px",
                  fontSize: "11px",
                  maxWidth: 280,
                }}
                formatter={(v: number) => formatSEK(v)}
              />
              <Legend wrapperStyle={{ fontSize: "10px" }} />
              <Area
                type="monotone"
                dataKey="householdNet"
                name="Household net"
                stroke="hsl(142 71% 45%)"
                fill="url(#import-household-net-grad)"
                strokeWidth={2}
              />
              {chartBankSeries.map((s, i) => (
                <Area
                  key={s.id}
                  type="monotone"
                  dataKey={`net_${s.id}`}
                  name={s.shortLabel}
                  stroke={CHART_COLORS[i % CHART_COLORS.length]}
                  fill="transparent"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </>
      ) : (
        <>
          {hasImportChart && (
            <p className="text-[10px] text-muted-foreground shrink-0 leading-snug">
              Same legend as Import detail — <span className="font-medium text-card-foreground">Household net</span>: summed projected balances across the same accounts; dashed lines match each shortened account label.
            </p>
          )}
          {!hasImportChart && (
            <p className="text-[10px] text-muted-foreground shrink-0 leading-snug">
              No imported CSV data yet — showing modeled balances only: snapshots with optional drift plus your share of{" "}
              <span className="font-medium text-card-foreground">
                cumulative monthly surplus from Planning (cashflows × calendar periods)
              </span>
              . Import bank CSVs here for alternate import-based charts.
            </p>
          )}
          <ResponsiveContainer width="100%" height={hasImportChart ? 280 : 220} className="min-h-[180px]">
            <AreaChart data={projectionData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="projection-household-net-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(142 71% 45%)" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="hsl(142 71% 45%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 91%)" />
              <XAxis dataKey="monthLabel" tick={{ fontSize: 10 }} stroke="hsl(220 9% 46%)" />
              <YAxis tick={{ fontSize: 10 }} stroke="hsl(220 9% 46%)" tickFormatter={(v) => formatCompact(v)} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(0 0% 100%)",
                  border: "1px solid hsl(220 13% 91%)",
                  borderRadius: "10px",
                  fontSize: "11px",
                  maxWidth: 280,
                }}
                formatter={(v: number) => formatSEK(v)}
              />
              <Legend wrapperStyle={{ fontSize: "10px" }} />
              <Area
                type="monotone"
                dataKey="householdNet"
                name="Household net"
                stroke="hsl(142 71% 45%)"
                fill="url(#projection-household-net-grad)"
                strokeWidth={2}
              />
              {balanceSeriesForChart.map((s, i) => (
                <Area
                  key={s.id}
                  type="monotone"
                  dataKey={`balance_${s.id}`}
                  name={s.shortLabel}
                  stroke={CHART_COLORS[i % CHART_COLORS.length]}
                  fill="transparent"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  );
}

function HouseholdHealthCardContent() {
  const { entities, loans } = useAppStore();
  const adults = entities.filter(e => e.type === "adult");
  const projection = useProjection(1);
  const totalIncome = projection.months.reduce((s, m) => s + m.net_income, 0);
  const totalExpense = projection.months.reduce((s, m) => s + m.total_expenses, 0);
  const totalLoanPayment = loans.reduce((s, l) => s + (l.monthly_payment ?? 0), 0);
  const netMonthly = totalIncome - totalExpense - totalLoanPayment;
  const healthScore = Math.min(100, Math.max(0, Math.round(50 + (netMonthly / Math.max(1, totalIncome)) * 50)));

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-28 h-16">
        <svg viewBox="0 0 120 70" className="w-full h-full">
          <path d="M 10 60 A 50 50 0 0 1 110 60" fill="none" stroke="hsl(220 13% 91%)" strokeWidth="10" strokeLinecap="round" />
          <path
            d="M 10 60 A 50 50 0 0 1 110 60"
            fill="none"
            stroke={healthScore >= 60 ? "hsl(142 71% 45%)" : healthScore >= 30 ? "hsl(38 92% 50%)" : "hsl(0 84% 60%)"}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${(healthScore / 100) * 157} 157`}
          />
        </svg>
      </div>
      <div className="text-center">
        <span className="text-2xl font-bold tabular-nums">{healthScore}%</span>
        <p className="text-xs text-muted-foreground">
          {healthScore >= 70 ? "Healthy" : healthScore >= 40 ? "Needs attention" : "Critical"}
        </p>
      </div>
      <div className="text-xs text-muted-foreground text-center">
        {adults.length} adult{adults.length !== 1 ? "s" : ""}, {entities.filter(e => e.type === "child").length} child{entities.filter(e => e.type === "child").length !== 1 ? "ren" : ""}
      </div>
    </div>
  );
}

function KPIValue({
  label,
  value,
  trend,
  color,
  labelClassName,
}: {
  label: string;
  value: string;
  trend?: string;
  color?: string;
  /** Defaults to muted label; pass e.g. text-expense to match value color */
  labelClassName?: string;
}) {
  return (
    <div>
      <p className={`text-xs mb-0.5 ${labelClassName ?? "text-muted-foreground"}`}>{label}</p>
      <p className={`text-lg font-bold tabular-nums ${color ?? ""}`}>{value}</p>
      {trend && <p className="text-xs text-muted-foreground">{trend}</p>}
    </div>
  );
}

function TotalLoanCardContent() {
  const { loans } = useAppStore();
  const totalOutstanding = loans.reduce((s, l) => s + l.outstanding, 0);
  const totalMonthly = loans.reduce((s, l) => s + (l.monthly_payment ?? 0), 0);
  return (
    <div className="space-y-3">
      <KPIValue
        label="Monthly payment"
        value={`−${formatSEK(totalMonthly)}`}
        color="text-expense"
        labelClassName="text-expense"
      />
      <KPIValue
        label="Outstanding"
        value={`−${formatSEK(totalOutstanding)}`}
        color="text-expense"
        labelClassName="text-expense"
      />
      <div className="space-y-1.5">
        {loans.map(l => (
          <div key={l.id} className="flex justify-between text-xs">
            <span className="text-muted-foreground truncate mr-2">{l.name}</span>
            <span className="tabular-nums shrink-0">{formatSEK(l.outstanding)}</span>
          </div>
        ))}
        {loans.length === 0 && <p className="text-xs text-muted-foreground">No loans</p>}
      </div>
    </div>
  );
}

function FixedCostsCardContent() {
  const { cashflows, accounts } = useAppStore();
  const recurring = cashflows.filter(
    (c) =>
      c.direction === "expense" &&
      c.frequency === "monthly" &&
      cashflowContributesToPnLTotals(c, accounts),
  );
  const total = recurring.reduce((s, c) => s + c.amount, 0);

  const byCat = recurring.reduce<Record<string, number>>((acc, c) => {
    acc[c.category] = (acc[c.category] ?? 0) + c.amount;
    return acc;
  }, {});

  return (
    <div className="space-y-3">
      <KPIValue label="Monthly fixed costs" value={formatSEK(total)} color="text-expense" />
      <div className="space-y-1.5">
        {Object.entries(byCat)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 6)
          .map(([cat, amt]) => (
            <div key={cat} className="flex justify-between text-xs">
              <span className="text-muted-foreground capitalize">{cat.replace(/_/g, " ")}</span>
              <span className="tabular-nums">{formatSEK(amt)}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

function TotalIncomeCardContent() {
  const { entities } = useAppStore();
  const projection = useProjection(1);
  const adults = entities.filter(e => e.type === "adult");
  const totalGross = projection.months.reduce((s, m) => s + m.gross_income, 0);
  const totalNet = projection.months.reduce((s, m) => s + m.net_income, 0);

  return (
    <div className="space-y-3">
      <KPIValue label="Monthly income (projected net)" value={formatSEK(totalNet)} color="text-income" />
      <p className="text-[10px] text-muted-foreground">Gross: {formatSEK(totalGross)}</p>
      <div className="space-y-1.5">
        {adults.map(entity => {
          const row = projection.months.find(m => m.entity_id === entity.id);
          return (
            <div key={entity.id} className="flex justify-between text-xs">
              <span className="text-muted-foreground">{entity.name}</span>
              <span className="tabular-nums">{row ? formatSEK(row.net_income) : "—"}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NetSurplusCardContent() {
  const { loans } = useAppStore();
  const projection = useProjection(1);
  const totalNet = projection.months.reduce((s, m) => s + m.net_income, 0);
  const totalExpense = projection.months.reduce((s, m) => s + m.total_expenses, 0);
  const totalLoan = loans.reduce((s, l) => s + (l.monthly_payment ?? 0), 0);
  const surplus = totalNet - totalExpense - totalLoan;
  const savingsRate = totalNet > 0 ? surplus / totalNet : 0;

  return (
    <div className="space-y-3">
      <KPIValue
        label="Monthly surplus (projected)"
        value={formatSEK(surplus)}
        color={surplus >= 0 ? "text-income" : "text-expense"}
      />
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(100, Math.max(0, savingsRate * 100))}%`,
              backgroundColor: savingsRate >= 0.1 ? "hsl(142 71% 45%)" : "hsl(38 92% 50%)",
            }}
          />
        </div>
        <span className="tabular-nums">{formatPercent(savingsRate)}</span>
      </div>
      <p className="text-xs text-muted-foreground">Savings rate (net income vs surplus after costs + loans)</p>
    </div>
  );
}

function CashflowBarCardContent() {
  const { cashflows, accounts } = useAppStore();
  const { values } = useHouseholdCardValues();
  const spread = values.overview.cashflowBarSpreadPct;
  const months = ["Jan", "Feb", "Mar", "Apr"];
  const overviewMonthStart = startOfMonth(new Date());
  const incomeBase = cashflows
    .filter(
      (c) =>
        c.direction === "income" &&
        cashflowContributesToPnLTotals(c, accounts) &&
        employmentIncomeCountsInProjectionMonth(c, overviewMonthStart) &&
        !cashflowIncomeInternalHideFromFlow(c) &&
        !cashflowExcludedFromHouseholdTotals(c),
    )
    .reduce((s, c) => s + c.amount, 0);
  const expenseBase = cashflows
    .filter(
      (c) =>
        c.direction === "expense" &&
        cashflowContributesToPnLTotals(c, accounts) &&
        !cashflowIncomeInternalHideFromFlow(c) &&
        !cashflowExcludedFromHouseholdTotals(c),
    )
    .reduce((s, c) => s + c.amount, 0);
  const data = months.map((m, i) => ({
    month: m,
    Income: incomeBase * barMonthFactor(i, months.length, spread),
    Expenses: expenseBase * barMonthFactor(i, months.length, spread),
  }));

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 91%)" />
        <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(220 9% 46%)" />
        <YAxis tick={{ fontSize: 11 }} stroke="hsl(220 9% 46%)" tickFormatter={formatCompact} />
        <Tooltip
          contentStyle={{ backgroundColor: "hsl(0 0% 100%)", border: "1px solid hsl(220 13% 91%)", borderRadius: "10px", fontSize: "12px" }}
          formatter={(v: number) => formatSEK(v)}
        />
        <Bar dataKey="Income" fill="hsl(142 71% 45%)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="Expenses" fill="hsl(0 84% 60%)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function InvestmentsCardContent() {
  const { accounts } = useAppStore();
  const investments = accounts.filter(a => a.type === "investment" || a.type === "pension");
  const total = investments.reduce((s, a) => s + (a.balance_snapshot || 0), 0);

  return (
    <div className="space-y-3">
      <KPIValue label="Portfolio value" value={formatSEK(total)} />
      <div className="space-y-1.5">
        {investments.map(a => (
          <div key={a.id} className="flex justify-between text-xs">
            <span className="text-muted-foreground truncate mr-2">{a.name}</span>
            <span className="tabular-nums">{formatSEK(a.balance_snapshot || 0)}</span>
          </div>
        ))}
        {investments.length === 0 && <p className="text-xs text-muted-foreground">No investments tracked</p>}
      </div>
    </div>
  );
}

function EntityAccountCardContent({ entityType }: { entityType: "adult" }) {
  const { t } = useTranslation();
  const { entities, accounts, periods } = useAppStore();
  const projection = useProjection(1);
  const adults = entities.filter(e => e.type === entityType);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {adults.map(entity => {
        const entityAccounts = accounts.filter(
          a => accountVisibleForEntity(a, entity.id) && a.type !== "loan"
        );
        const row = projection.months.find(m => m.entity_id === entity.id);
        const currentPeriod = periods.find(p => {
          if (p.entity_id !== entity.id) return false;
          const now = new Date().toISOString().slice(0, 10);
          return p.date_from <= now && (!p.date_to || p.date_to >= now);
        });
        return (
          <div key={entity.id} className="p-3 rounded-bento-inner bg-muted/30">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium">{entity.name}</h4>
              {currentPeriod && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary capitalize">
                  {currentPeriod.type.replace(/_/g, " ")}{currentPeriod.pct_fte != null && currentPeriod.pct_fte !== 100 ? ` ${currentPeriod.pct_fte}%` : ""}
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs mb-2">
              <div>
                <span className="text-muted-foreground">Net income</span>
                <p className="font-medium tabular-nums text-income">{row ? formatSEK(row.net_income) : "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Tax</span>
                <p className="font-medium tabular-nums text-expense">{row ? formatSEK(row.tax) : "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Benefits</span>
                <p className="font-medium tabular-nums">{row ? formatSEK(row.benefits) : "—"}</p>
              </div>
            </div>
            {entityAccounts.map(a => (
              <div key={a.id} className="flex justify-between text-xs text-muted-foreground">
                <span className="truncate mr-2">{a.name}</span>
                <span className="tabular-nums">{formatSEK(a.balance_snapshot || 0)}</span>
              </div>
            ))}
          </div>
        );
      })}
      {adults.length === 0 && (
        <p className="text-xs text-muted-foreground col-span-full">{t("cards.overview.no_adults_accounts")}</p>
      )}
    </div>
  );
}

function AccountOverviewCard(p: BentoRender) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { values, update } = useHouseholdCardValues();
  const { transactions, accounts } = useAppStore();
  const hasBankImportData = useMemo(() => {
    const ids = new Set(
      accounts
        .filter(
          (a) =>
            !a.archived_at &&
            ["bank", "savings", "credit", "investment"].includes(a.type),
        )
        .map((a) => a.id),
    );
    return transactions.some((t) => ids.has(t.account_id));
  }, [accounts, transactions]);
  return (
    <>
      <Card
        title={t("cards.overview.account_overview")}
        subtitle={
          hasBankImportData
            ? t("cards.overview.account_overview_sub_imports")
            : t("cards.overview.account_overview_sub_snapshots")
        }
        icon={<BarChart3 className="w-4 h-4" />}
        onEdit={() => setOpen(true)}
        {...p}
      >
        <AccountOverviewCardContent />
      </Card>
      <CardNumericFieldsDialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("cards.overview.account_overview_chart_dialog")}
        description={t("cards.overview.account_overview_chart_desc")}
        fields={[
          {
            key: "drift",
            label: t("cards.overview.field_monthly_drift"),
            hint: t("cards.overview.field_monthly_drift_hint"),
          },
        ]}
        initial={{ drift: values.overview.accountBalanceMonthlyDrift }}
        onSave={(next) =>
          update((v) => ({
            ...v,
            overview: { ...v.overview, accountBalanceMonthlyDrift: next.drift ?? 0 },
          }))
        }
      />
    </>
  );
}

function CashflowBarCard(p: BentoRender) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { values, update } = useHouseholdCardValues();
  return (
    <>
      <Card title={t("cards.overview.cashflow")} subtitle={t("cards.overview.cashflow_sub")} icon={<BarChart3 className="w-4 h-4" />} onEdit={() => setOpen(true)} {...p}>
        <CashflowBarCardContent />
      </Card>
      <CardNumericFieldsDialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("cards.overview.cashflow_chart_dialog")}
        description={t("cards.overview.cashflow_chart_desc")}
        fields={[
          {
            key: "spread",
            label: t("cards.overview.field_cashflow_spread"),
          },
        ]}
        initial={{ spread: values.overview.cashflowBarSpreadPct }}
        onSave={(next) =>
          update((v) => ({
            ...v,
            overview: { ...v.overview, cashflowBarSpreadPct: next.spread ?? 0 },
          }))
        }
      />
    </>
  );
}

export function OverviewPage() {
  const { t } = useTranslation();
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [csvImportPresetAccountId, setCsvImportPresetAccountId] = useState<string | null>(null);
  const openCsvImport = useCallback((presetAccountId: string | null) => {
    setCsvImportPresetAccountId(presetAccountId);
    setCsvImportOpen(true);
  }, []);

  const planningCards = usePlanningBentoCards();
  const dataCards = useDataSettingsBentoCards();
  const expensesCards = useExpensesBentoCards();
  const retirementCards = useRetirementBentoCards();

  const cards = useMemo((): BentoCardDefinition[] => {
    const overviewNative: BentoCardDefinition[] = [
      {
        id: "account-overview",
        title: t("cards.overview.account_overview"),
        defaultSize: "large",
        render: (p) => <AccountOverviewCard {...p} />,
      },
    {
      id: "household-health",
      title: t("cards.overview.household"),
      defaultSize: "small",
      render: (p) => (
        <Card title={t("cards.overview.household")} icon={<Activity className="w-4 h-4" />} {...p}>
          <HouseholdHealthCardContent />
        </Card>
      ),
    },
    {
      id: "total-loan",
      title: t("cards.overview.total_loans"),
      defaultSize: "small",
      render: (p) => (
        <Card title={t("cards.overview.total_loans")} icon={<Building2 className="w-4 h-4" />} {...p}>
          <TotalLoanCardContent />
        </Card>
      ),
    },
    {
      id: "fixed-costs",
      title: t("cards.overview.fixed_costs"),
      defaultSize: "small",
      render: (p) => (
        <Card title={t("cards.overview.fixed_costs")} icon={<CreditCard className="w-4 h-4" />} {...p}>
          <FixedCostsCardContent />
        </Card>
      ),
    },
    {
      id: "total-income",
      title: t("cards.overview.total_income"),
      defaultSize: "small",
      render: (p) => (
        <Card title={t("cards.overview.total_income")} icon={<TrendingUp className="w-4 h-4" />} {...p}>
          <TotalIncomeCardContent />
        </Card>
      ),
    },
    {
      id: "net-surplus",
      title: t("cards.overview.total_net"),
      defaultSize: "small",
      render: (p) => (
        <Card title={t("cards.overview.total_net")} icon={<DollarSign className="w-4 h-4" />} {...p}>
          <NetSurplusCardContent />
        </Card>
      ),
    },
    {
      id: "cashflow-bar",
      title: t("cards.overview.cashflow"),
      defaultSize: "medium",
      render: (p) => <CashflowBarCard {...p} />,
    },
    {
      id: "entity-accounts",
      title: t("cards.overview.individual_accounts"),
      defaultSize: "medium",
      render: (p) => (
        <Card title={t("cards.overview.individual_accounts")} icon={<Users className="w-4 h-4" />} {...p}>
          <EntityAccountCardContent entityType="adult" />
        </Card>
      ),
    },
    {
      id: "investments-1",
      title: t("cards.overview.investments"),
      defaultSize: "small",
      render: (p) => (
        <Card title={t("cards.overview.investments")} icon={<PiggyBank className="w-4 h-4" />} {...p}>
          <InvestmentsCardContent />
        </Card>
      ),
    },
    ];

    return [
      ...overviewNative,
      ...mirrorCardsForOverview(planningCards),
      ...mirrorCardsForOverview(dataCards),
      ...mirrorCardsForOverview(expensesCards),
      ...mirrorCardsForOverview(retirementCards),
    ];
  }, [planningCards, dataCards, expensesCards, retirementCards, t]);

  return (
    <OpenCsvImportContext.Provider value={openCsvImport}>
      <CsvImportModal
        open={csvImportOpen}
        presetAccountId={csvImportPresetAccountId}
        onClose={() => {
          setCsvImportOpen(false);
          setCsvImportPresetAccountId(null);
        }}
      />
      <BentoGrid tab="overview" cards={cards} />
    </OpenCsvImportContext.Provider>
  );
}
