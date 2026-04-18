import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Settings } from "lucide-react";
import { AppSettingsModal } from "./components/AppSettingsModal";
import { AuthGate } from "./components/AuthGate";
import { DashboardHealthSection } from "./components/DashboardHealthSection";
import { MacosSwitch } from "./components/MacosSwitch";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  defaultBankAccounts,
  defaultEntities,
  defaultRecurringCosts,
  ENTITY_IDS,
  type BankAccountRecord,
  type EntityRecord,
  type RecurringCost,
  type RecurringKind,
} from "./data/bankData";
import { authEmailDisplayName } from "./config/authDisplayNames";
import {
  defaultHouseholdConfig,
  getHouseMetrics,
  type HouseholdConfig,
} from "./config/householdConfig";
import { useHouseholdMonthlySeries } from "./hooks/useHouseholdMonthlySeries";
import { useScenarioSimulation } from "./hooks/useScenarioSimulation";
import {
  deleteRecurringCostRemote,
  loadAppPersistedState,
  saveCurrentFinanceState,
  saveHouseholdConfigDraft,
} from "./lib/appDataService";
import { cn, parseOptionalNumberInput } from "@/lib/utils";
import { supabase } from "./lib/supabase";
import {
  buildDashboardInsights,
  recurringNetOutflowSek,
} from "./utils/finance/dashboardInsights";
import { recurringFlowClass } from "./utils/finance/recurringFlowStyle";

const RECURRING_CARD_HELP =
  "Drag blocks between entity lanes. Rows are seeded from bundled CSVs when the same label repeats with a stable amount across several months. Edit the label, amount, or expense/income type, or delete a row. Red tiles are costs, green tiles are inflows. When Supabase is configured, changes save automatically.";

function formatSek(value: number): string {
  return new Intl.NumberFormat("sv-SE", {
    style: "currency",
    currency: "SEK",
    maximumFractionDigits: 0,
  }).format(value);
}

/** Y-axis ticks: Swedish grouping, no currency suffix (narrower, no repeated “kr”). */
function formatChartAxisNumber(value: number): string {
  return new Intl.NumberFormat("sv-SE", {
    maximumFractionDigits: 0,
  }).format(Math.round(Number(value)));
}

/** Compact X ticks from `YYYY-MM` → `MM/YY` (e.g. 2025-10 → 10/25). */
function formatChartMonthTick(month: string): string {
  const [y, m] = month.split("-");
  if (!y || !m) return month;
  return `${m}/${y.slice(-2)}`;
}

const CHART_AXIS_TICK = { fontSize: 10, fill: "hsl(var(--muted-foreground))" } as const;
const CHART_GRID_DOT = {
  stroke: "hsl(var(--muted-foreground) / 0.22)",
  strokeWidth: 1.25,
  strokeDasharray: "2 8" as const,
  strokeLinecap: "round" as const,
};

/** Short legend label; disambiguates duplicate `name` (e.g. two Bolån rows) via account number tail. */
function accountSeriesLegendName(
  account: BankAccountRecord,
  allAccounts: BankAccountRecord[],
): string {
  const stripped = account.name.replace(/^Account\s+/i, "").trim();
  const sameLabel = allAccounts.filter((a) => a.name === account.name);
  if (sameLabel.length <= 1) return stripped;
  const digits = account.accountNumber.replace(/\D/g, "");
  const tail = digits.length >= 4 ? digits.slice(-4) : account.id.replace(/^acc-|^loan-/, "").slice(-4);
  return `${stripped} · ${tail}`;
}

type LegendPayloadItem = {
  value?: string;
  color?: string;
  dataKey?: string | number;
};

/** Dense, scroll-capped legend for many account series (Recharts default legend is tall and loose). */
function CompactFinanceChartLegend({ payload }: { payload?: LegendPayloadItem[] }) {
  if (!payload?.length) return null;
  return (
    <div className="chart-legend-scroll max-h-[3.25rem] w-full overflow-y-auto overscroll-y-contain px-0.5 pt-0.5">
      <ul className="flex flex-wrap justify-center gap-x-2 gap-y-0.5 text-center">
        {payload.map((item, index) => (
          <li
            key={`${String(item.dataKey ?? item.value ?? "k")}-${index}`}
            className="inline-flex max-w-[min(9rem,100%)] items-center gap-1 text-[10px] leading-tight text-muted-foreground"
          >
            <span
              className="size-1.5 shrink-0 rounded-[2px]"
              style={{ backgroundColor: item.color ?? "transparent" }}
              aria-hidden
            />
            <span className="truncate" title={item.value}>
              {item.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const ACCOUNT_LINE_COLORS = [
  "#a78bfa",
  "#f59e0b",
  "#14b8a6",
  "#e879f9",
  "#f97316",
  "#60a5fa",
  "#84cc16",
  "#fb7185",
];

export default function App() {
  return <AuthGate>{(user) => <AppWithSession user={user} />}</AuthGate>;
}

function AppWithSession({ user }: { user: User }) {
  const [activeTab, setActiveTab] = useState<"current_finances" | "scenarios">(
    "current_finances",
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [householdDraft, setHouseholdDraft] =
    useState<HouseholdConfig>(defaultHouseholdConfig);
  const [entities, setEntities] = useState<EntityRecord[]>(defaultEntities);
  const [accounts, setAccounts] = useState<BankAccountRecord[]>(defaultBankAccounts);
  const [recurringCosts, setRecurringCosts] =
    useState<RecurringCost[]>(defaultRecurringCosts);
  const [showIndividualAccounts, setShowIndividualAccounts] = useState(true);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editingAccountValue, setEditingAccountValue] = useState<number>(0);
  const [saveStatus, setSaveStatus] = useState("");
  const [monthlySeriesRefreshKey, setMonthlySeriesRefreshKey] = useState(0);

  const { series: currentSeries, dataSource: monthlySeriesSource, loading: monthlySeriesLoading } =
    useHouseholdMonthlySeries(monthlySeriesRefreshKey);
  const {
    scenarios,
    selectedScenarioId,
    setSelectedScenarioId,
    runPlan,
    engineResult,
    expenseInput,
    setExpenseInput,
    summary,
  } = useScenarioSimulation(householdDraft);

  const scenarioChartSeries = useMemo(
    () =>
      engineResult.projections.map((point) => ({
        month: point.month,
        totalIncomeSek: point.totalIncomeSek,
        totalCostSek: point.totalFixedCostsSek + point.totalVariableCostsSek,
        netCashflowSek: point.netCashflowSek,
      })),
    [engineResult.projections],
  );
  const {
    adults: [adult1, adult2],
    house,
    loans,
  } = householdDraft;
  const scenario = useMemo(() => scenarios.find((s) => s.id === selectedScenarioId), [
    scenarios,
    selectedScenarioId,
  ]);
  const houseMetrics = useMemo(
    () => getHouseMetrics(householdDraft),
    [householdDraft],
  );
  const monthlyFixedCostsTotal = useMemo(() => {
    const fixed = householdDraft.monthlyFixedCosts;
    return (
      fixed.brfAvgiftSek +
      fixed.heatingSek +
      fixed.electricitySek +
      fixed.fundContributionJune80Sek +
      fixed.fundContributionJune40Sek
    );
  }, [householdDraft]);

  const recurringNetCashAdjustSek = useMemo(
    () => recurringNetOutflowSek(recurringCosts),
    [recurringCosts],
  );

  const liquidBalancesSek = useMemo(
    () =>
      accounts
        .filter((a) => a.category !== "loan")
        .reduce((sum, a) => sum + Math.max(0, a.currentBalanceSek), 0),
    [accounts],
  );

  const dashboardInsights = useMemo(
    () =>
      buildDashboardInsights({
        householdConfig: householdDraft,
        recurringCostsMonthlySek: recurringNetCashAdjustSek,
        recurringItems: recurringCosts.map((c) => ({
          id: c.id,
          label: c.label,
          amountSek: c.amountSek,
          kind: c.kind,
        })),
        scenarioLowestMonthlyNetSek: engineResult.summary.lowestMonthlyNetCashflowSek,
        liquidBalancesSek,
      }),
    [
      householdDraft,
      recurringNetCashAdjustSek,
      recurringCosts,
      engineResult.summary.lowestMonthlyNetCashflowSek,
      liquidBalancesSek,
    ],
  );

  const [remoteHydrated, setRemoteHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadAppPersistedState(user.id).then((data) => {
      if (cancelled) return;
      if (data?.householdConfig) {
        setHouseholdDraft((prev) => ({
          ...prev,
          ...data.householdConfig,
          companyTypologyMonthlyEstimateSek:
            data.householdConfig!.companyTypologyMonthlyEstimateSek ??
            prev.companyTypologyMonthlyEstimateSek,
        }));
      }
      if (data?.recurringCosts?.length) {
        setRecurringCosts(
          data.recurringCosts.map((c) => ({
            ...c,
            kind: c.kind ?? "expense",
          })),
        );
      }
      setRemoteHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  useEffect(() => {
    if (!remoteHydrated) return;
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          await saveCurrentFinanceState({
            entities,
            accounts,
            recurringCosts,
            userId: user.id,
          });
          await saveHouseholdConfigDraft(householdDraft, user.id);
          setSaveStatus("");
        } catch (e) {
          setSaveStatus(
            e instanceof Error ? `Save failed: ${e.message}` : "Save failed.",
          );
        }
      })();
    }, 550);
    return () => window.clearTimeout(t);
  }, [
    remoteHydrated,
    entities,
    accounts,
    recurringCosts,
    householdDraft,
    user.id,
  ]);
  const monthlyVariableCostsTotal = useMemo(() => {
    const variable = householdDraft.monthlyVariableCosts;
    return (
      variable.adult1HouseholdEnvelopeSek + variable.adult2HouseholdEnvelopeSek
    );
  }, [householdDraft]);
  const totalBarnbidrag = useMemo(
    () => householdDraft.children.reduce((sum, child) => sum + child.monthlyBarnbidragSek, 0),
    [householdDraft],
  );

  const currentChartData = useMemo(
    () =>
      currentSeries.map((row) => {
        const enriched: Record<string, number | string> = {
          month: row.month,
          totalIncomeSek: row.totalIncomeSek,
          totalCostSek: row.totalCostSek,
          netCashflowSek: row.netCashflowSek,
        };
        for (const account of accounts) {
          enriched[account.id] = row.byAccountNetSek[account.id] ?? 0;
        }
        return enriched;
      }),
    [accounts, currentSeries],
  );

  /** Domain for the right axis so per-account lines are not clipped (AreaChart+Line dual-axis quirk). */
  const accountAxisDomain = useMemo((): [number, number] | undefined => {
    if (!showIndividualAccounts || currentChartData.length === 0) return undefined;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const row of currentChartData) {
      for (const acc of accounts) {
        const v = Number(row[acc.id] ?? 0);
        if (Number.isFinite(v)) {
          min = Math.min(min, v);
          max = Math.max(max, v);
        }
      }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return undefined;
    if (min === max) {
      const pad = Math.max(Math.abs(min) * 0.15, 500);
      return [min - pad, max + pad];
    }
    const pad = (max - min) * 0.1;
    return [min - pad, max + pad];
  }, [showIndividualAccounts, currentChartData, accounts]);

  const groupedAccounts = useMemo(() => {
    const groups: Record<string, BankAccountRecord[]> = {};
    for (const entity of entities) {
      groups[entity.id] = [];
    }
    for (const account of accounts) {
      const groupKey = account.category === "loan" ? ENTITY_IDS.SHARED : account.ownerEntityId;
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(account);
    }
    return groups;
  }, [accounts, entities]);

  const recurringByLane = useMemo(() => {
    const laneMap = new Map<string, RecurringCost[]>();
    for (const entity of entities) {
      laneMap.set(entity.id, []);
    }
    for (const cost of recurringCosts) {
      const lane = laneMap.get(cost.assignedEntityId);
      if (lane) {
        lane.push(cost);
      } else {
        const shared = laneMap.get(ENTITY_IDS.SHARED);
        if (shared) shared.push(cost);
      }
    }
    for (const lane of laneMap.values()) {
      lane.sort((a, b) => a.laneOrder - b.laneOrder);
    }
    return laneMap;
  }, [entities, recurringCosts]);

  const updateAccountBalance = (accountId: string, value: number) => {
    setAccounts((prev) =>
      prev.map((a) => (a.id === accountId ? { ...a, currentBalanceSek: value } : a)),
    );
  };

  const beginEditAccountBalance = (account: BankAccountRecord) => {
    setEditingAccountId(account.id);
    setEditingAccountValue(account.currentBalanceSek);
  };

  const commitEditAccountBalance = () => {
    if (!editingAccountId) return;
    updateAccountBalance(editingAccountId, editingAccountValue);
    setEditingAccountId(null);
  };

  const saveCurrentTab = async () => {
    try {
      await saveCurrentFinanceState({
        entities,
        accounts,
        recurringCosts,
        userId: user.id,
      });
      setSaveStatus("Current finances saved.");
    } catch (error) {
      setSaveStatus(
        error instanceof Error ? `Save failed: ${error.message}` : "Save failed.",
      );
    }
  };

  const saveScenarioTab = async () => {
    setSaveStatus("Scenario edits saved locally (engine uses current draft values).");
  };

  const handleDropRecurringCost = (costId: string, targetEntityId: string) => {
    setRecurringCosts((prev) => {
      const targetCosts = prev.filter((c) => c.assignedEntityId === targetEntityId);
      const nextOrder = targetCosts.length;
      return prev.map((c) =>
        c.id === costId
          ? { ...c, assignedEntityId: targetEntityId, laneOrder: nextOrder }
          : c,
      );
    });
  };

  const removeRecurringBlock = async (costId: string) => {
    setRecurringCosts((prev) => prev.filter((c) => c.id !== costId));
    try {
      await deleteRecurringCostRemote(costId);
    } catch {
      setSaveStatus("Could not delete this row on the server.");
    }
  };

  return (
    <main className="page-shell">
      <div className="dashboard-sticky-header">
        <Card className="border-border/80 shadow-bento ring-1 ring-black/[0.06] dark:ring-white/10">
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-3 sm:gap-4 sm:pb-4">
            <CardTitle className="text-lg tracking-tight">Financial Dashboard</CardTitle>
            <div className="flex min-w-0 shrink-0 flex-wrap items-center justify-end gap-x-2 gap-y-2 sm:gap-x-3">
              <span
                className="max-w-[5.5rem] truncate text-sm text-muted-foreground sm:max-w-[12rem] md:max-w-none"
                title={user.email ?? undefined}
              >
                {authEmailDisplayName(user.email)}
              </span>
              <Button
                type="button"
                size="sm"
                className="shrink-0"
                onClick={activeTab === "current_finances" ? saveCurrentTab : saveScenarioTab}
              >
                {activeTab === "current_finances" ? "Save finances" : "Save scenarios"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setSettingsOpen(true)}
              >
                <Settings className="size-4" aria-hidden />
                Settings
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={async () => {
                  if (supabase) {
                    await supabase.auth.signOut();
                  }
                }}
              >
                Sign out
              </Button>
            </div>
          </CardHeader>
          {saveStatus ? (
            <div
              className="border-t border-border/60 px-4 py-2 text-xs text-muted-foreground sm:px-6"
              role="status"
              aria-live="polite"
            >
              {saveStatus}
            </div>
          ) : null}
        </Card>
      </div>

      <AppSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        householdDraft={householdDraft}
        setHouseholdDraft={setHouseholdDraft}
        showIndividualAccounts={showIndividualAccounts}
        setShowIndividualAccounts={setShowIndividualAccounts}
        userId={user.id}
        accounts={accounts}
        onBankImportComplete={() => setMonthlySeriesRefreshKey((k) => k + 1)}
      />

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "current_finances" | "scenarios")}
      >
        <TabsList aria-label="Main views">
          <TabsTrigger value="current_finances">Current Finances</TabsTrigger>
          <TabsTrigger value="scenarios">Scenarios</TabsTrigger>
        </TabsList>

        <TabsContent value="current_finances" className="mt-3">
          <div className="finance-bento">
                       <div className="bento-span-full">
            <Card>
            <CardHeader className="flex flex-col gap-3 space-y-0 pb-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-0.5">
                <CardTitle className="text-base">Current Finances Trend</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {monthlySeriesLoading
                    ? "Loading chart data…"
                    : monthlySeriesSource === "supabase"
                      ? "From imported bank transactions (Supabase)."
                      : "Bundled sample CSVs until you import transactions."}
                </p>
              </div>
              <MacosSwitch
                id="chart-show-accounts"
                checked={showIndividualAccounts}
                onCheckedChange={setShowIndividualAccounts}
                label="Show individual accounts"
              />
            </CardHeader>
            <CardContent>
            <div className="chart-wrap">
              {currentChartData.length === 0 ? (
                <p className="text-muted-foreground">
                  No chart points yet. Import a bank CSV (with Supabase configured) or check bundled
                  sample data.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart
                    data={currentChartData}
                    margin={{
                      top: 10,
                      right: showIndividualAccounts ? 52 : 10,
                      left: 12,
                      bottom: 2,
                    }}
                  >
                    <CartesianGrid
                      {...CHART_GRID_DOT}
                      horizontal
                      vertical
                    />
                    <XAxis
                      dataKey="month"
                      tickFormatter={formatChartMonthTick}
                      tick={CHART_AXIS_TICK}
                      tickLine={false}
                      axisLine={{ stroke: "hsl(var(--border))", strokeOpacity: 0.85 }}
                      height={28}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      yAxisId="totals"
                      tickFormatter={(v) => formatChartAxisNumber(Number(v))}
                      width={54}
                      tick={CHART_AXIS_TICK}
                      tickLine={false}
                      axisLine={false}
                    />
                    {showIndividualAccounts ? (
                      <YAxis
                        yAxisId="accounts"
                        orientation="right"
                        tickFormatter={(v) => formatChartAxisNumber(Number(v))}
                        width={46}
                        domain={accountAxisDomain ?? ["auto", "auto"]}
                        allowDataOverflow
                        tick={CHART_AXIS_TICK}
                        tickLine={false}
                        axisLine={false}
                      />
                    ) : null}
                    <Tooltip formatter={(value: number | string) => formatSek(Number(value))} />
                    <Legend
                      verticalAlign="bottom"
                      align="center"
                      iconSize={0}
                      wrapperStyle={{ width: "100%", paddingTop: 2 }}
                      content={<CompactFinanceChartLegend />}
                    />
                    <Area
                      type="monotone"
                      yAxisId="totals"
                      dataKey="totalIncomeSek"
                      stroke="#22c55e"
                      strokeWidth={1.5}
                      fill="rgba(34,197,94,0.15)"
                      fillOpacity={0.6}
                      name="Income"
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      yAxisId="totals"
                      dataKey="totalCostSek"
                      stroke="#ef4444"
                      strokeWidth={1.5}
                      fill="rgba(239,68,68,0.12)"
                      fillOpacity={0.6}
                      name="Cost"
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      yAxisId="totals"
                      dataKey="netCashflowSek"
                      stroke="#38bdf8"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                      name="Net"
                      isAnimationActive={false}
                    />
                    {showIndividualAccounts
                      ? accounts.map((account, index) => (
                          <Line
                            key={account.id}
                            type="monotone"
                            yAxisId="accounts"
                            dataKey={account.id}
                            stroke={
                              ACCOUNT_LINE_COLORS[index % ACCOUNT_LINE_COLORS.length] ??
                              "#a78bfa"
                            }
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            dot={false}
                            connectNulls
                            isAnimationActive={false}
                            activeDot={{ r: 3 }}
                            name={accountSeriesLegendName(account, accounts)}
                            legendType="line"
                          />
                        ))
                      : null}
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
            </CardContent>
          </Card>
            </div>

          <div className="bento-span-full">
            <DashboardHealthSection
              insights={dashboardInsights}
              formatSek={formatSek}
              recurringNetCashAdjustSek={recurringNetCashAdjustSek}
            />
          </div>

          <Card className="bento-span-snap">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Current household snapshot</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <p className="text-muted-foreground">
                Transition date default: {householdDraft.transitionDate}
              </p>
              <p>Adults: {householdDraft.adults.length}</p>
              <p>Children: {householdDraft.children.length}</p>
              <p>Monthly fixed costs: {formatSek(monthlyFixedCostsTotal)}</p>
              <p>Monthly variable costs: {formatSek(monthlyVariableCostsTotal)}</p>
              <p>Barnbidrag total: {formatSek(totalBarnbidrag)}</p>
            </CardContent>
          </Card>

          <Card className="bento-span-adults">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Adult + company editable values</CardTitle>
            </CardHeader>
            <CardContent>
            <div className="form-grid">
              <div className="space-y-2">
              <div className="space-y-1">
                <Label htmlFor="adult2-brutto">Heli monthly brutto (SEK)</Label>
                <Input
                  id="adult2-brutto"
                  type="number"
                  inputMode="numeric"
                  autoComplete="off"
                  min={0}
                  step={1}
                  value={adult2.monthlyBruttoIncomeSek}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw.trim() === "") {
                      setHouseholdDraft((prev) => ({
                        ...prev,
                        adults: [
                          prev.adults[0],
                          { ...prev.adults[1], monthlyBruttoIncomeSek: 0 },
                        ],
                      }));
                      return;
                    }
                    const n = parseOptionalNumberInput(raw);
                    if (n === null) return;
                    setHouseholdDraft((prev) => ({
                      ...prev,
                      adults: [
                        prev.adults[0],
                        { ...prev.adults[1], monthlyBruttoIncomeSek: n },
                      ],
                    }));
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="adult2-sgi">Heli SGI (annual SEK)</Label>
                <Input
                  id="adult2-sgi"
                  type="number"
                  inputMode="numeric"
                  autoComplete="off"
                  min={0}
                  step={1}
                  value={adult2.annualSgiSek}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw.trim() === "") {
                      setHouseholdDraft((prev) => ({
                        ...prev,
                        adults: [
                          prev.adults[0],
                          { ...prev.adults[1], annualSgiSek: 0 },
                        ],
                      }));
                      return;
                    }
                    const n = parseOptionalNumberInput(raw);
                    if (n === null) return;
                    setHouseholdDraft((prev) => ({
                      ...prev,
                      adults: [
                        prev.adults[0],
                        { ...prev.adults[1], annualSgiSek: n },
                      ],
                    }));
                  }}
                />
              </div>
              </div>
              <div className="space-y-2">
                <div className="space-y-1">
                  <Label htmlFor="adult1-brutto">Christian monthly brutto (SEK)</Label>
                  <Input
                    id="adult1-brutto"
                    type="number"
                    inputMode="numeric"
                    autoComplete="off"
                    min={0}
                    step={1}
                    value={adult1.monthlyBruttoIncomeSek}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw.trim() === "") {
                        setHouseholdDraft((prev) => ({
                          ...prev,
                          adults: [
                            { ...prev.adults[0], monthlyBruttoIncomeSek: 0 },
                            prev.adults[1],
                          ],
                        }));
                        return;
                      }
                      const n = parseOptionalNumberInput(raw);
                      if (n === null) return;
                      setHouseholdDraft((prev) => ({
                        ...prev,
                        adults: [
                          {
                            ...prev.adults[0],
                            monthlyBruttoIncomeSek: n,
                          },
                          prev.adults[1],
                        ],
                      }));
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="adult1-sgi">Christian SGI (annual SEK)</Label>
                  <Input
                    id="adult1-sgi"
                    type="number"
                    inputMode="numeric"
                    autoComplete="off"
                    min={0}
                    step={1}
                    value={adult1.annualSgiSek}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw.trim() === "") {
                        setHouseholdDraft((prev) => ({
                          ...prev,
                          adults: [
                            { ...prev.adults[0], annualSgiSek: 0 },
                            prev.adults[1],
                          ],
                        }));
                        return;
                      }
                      const n = parseOptionalNumberInput(raw);
                      if (n === null) return;
                      setHouseholdDraft((prev) => ({
                        ...prev,
                        adults: [
                          { ...prev.adults[0], annualSgiSek: n },
                          prev.adults[1],
                        ],
                      }));
                    }}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="typology-monthly">Typology Network AB monthly estimate (SEK)</Label>
                <Input
                  id="typology-monthly"
                  type="number"
                  inputMode="numeric"
                  autoComplete="off"
                  min={0}
                  step={1000}
                  value={householdDraft.companyTypologyMonthlyEstimateSek}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw.trim() === "") {
                      setHouseholdDraft((prev) => ({
                        ...prev,
                        companyTypologyMonthlyEstimateSek: 0,
                      }));
                      return;
                    }
                    const n = parseOptionalNumberInput(raw);
                    if (n === null) return;
                    setHouseholdDraft((prev) => ({
                      ...prev,
                      companyTypologyMonthlyEstimateSek: n,
                    }));
                  }}
                />
                <p className="text-muted-foreground">
                  Stored on the household draft (scenario engine does not use this yet).
                </p>
              </div>
            </div>
            </CardContent>
          </Card>

          <Card className="bento-span-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">All bank accounts (grouped by entity / shared / loan)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
            {entities.map((entity) => (
              <div key={entity.id} className="min-w-0 space-y-2">
                <h3 className="text-base font-semibold">{entity.name}</h3>
                <div className="overflow-x-auto rounded-[10px] border border-border/60 bg-card/40">
                  <table className="data-table text-[13px]">
                    <thead>
                      <tr className="border-b border-border/80 bg-muted/30">
                        <th className="py-2 pl-3 pr-2">Account</th>
                        <th className="py-2 px-2">Type</th>
                        <th className="account-balance-cell py-2 pl-2 pr-3">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(groupedAccounts[entity.id] ?? []).map((account) => (
                        <tr key={account.id} className="hover:bg-muted/20">
                          <td className="max-w-[min(100vw,220px)] py-2 pl-3 pr-2 align-middle">
                            <span
                              className="account-table-name"
                              title={
                                account.accountNumber
                                  ? `${account.name} — account ${account.accountNumber}`
                                  : account.name
                              }
                            >
                              {account.name}
                            </span>
                          </td>
                          <td className="py-2 px-2 align-middle">
                            <span
                              className={cn(
                                "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium capitalize",
                                account.category === "loan" &&
                                  "bg-muted text-muted-foreground",
                                account.category === "credit" &&
                                  "bg-accent/80 text-accent-foreground",
                                account.category === "bank" &&
                                  "border border-border/80 bg-background/80 text-foreground",
                              )}
                            >
                              {account.category}
                            </span>
                          </td>
                          <td className="account-balance-cell py-2 pl-2 pr-3 align-middle">
                            {editingAccountId === account.id ? (
                              <div className="inline-flex flex-wrap items-center justify-end gap-1">
                                <Input
                                  type="number"
                                  className="max-w-[140px]"
                                  value={editingAccountValue}
                                  onChange={(e) =>
                                    setEditingAccountValue(Number(e.target.value || 0))
                                  }
                                />
                                <Button
                                  size="sm"
                                  type="button"
                                  onClick={commitEditAccountBalance}
                                >
                                  Save
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  type="button"
                                  onClick={() => setEditingAccountId(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <div className="inline-flex items-center justify-end gap-2">
                                <span
                                  className={
                                    account.currentBalanceSek < 0
                                      ? "text-finance-expense"
                                      : "text-foreground"
                                  }
                                >
                                  {formatSek(account.currentBalanceSek)}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="balance-edit-btn h-7 shrink-0 px-2 text-xs"
                                  type="button"
                                  onClick={() => beginEditAccountBalance(account)}
                                >
                                  Edit
                                </Button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
            </div>
            </CardContent>
          </Card>

          <Card className="bento-span-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                <span
                  className="cursor-help border-b border-dotted border-muted-foreground/60"
                  title={RECURRING_CARD_HELP}
                >
                  Recurring cash flows
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
            <div className="lane-grid">
              {entities.map((entity) => (
                <div
                  key={entity.id}
                  className="lane-drop"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    const costId = e.dataTransfer.getData("text/plain");
                    if (costId) handleDropRecurringCost(costId, entity.id);
                  }}
                >
                  <h3 className="mb-2 text-sm font-semibold">{entity.name}</h3>
                  {(recurringByLane.get(entity.id) ?? []).map((cost) => (
                    <div
                      key={cost.id}
                      className={cn("drag-item", recurringFlowClass(cost.kind))}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", cost.id);
                      }}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <Input
                          className="h-8 flex-1 text-sm font-medium"
                          value={cost.label}
                          aria-label="Recurring label"
                          onChange={(e) =>
                            setRecurringCosts((prev) =>
                              prev.map((item) =>
                                item.id === cost.id
                                  ? { ...item, label: e.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 shrink-0 px-2 text-finance-expense"
                          aria-label="Remove row"
                          onClick={() => void removeRecurringBlock(cost.id)}
                        >
                          ×
                        </Button>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Label className="text-[11px] text-muted-foreground">Type</Label>
                        <select
                          className="native-select h-8 max-w-[140px] py-1 text-xs"
                          value={cost.kind}
                          aria-label="Expense or income"
                          onChange={(e) =>
                            setRecurringCosts((prev) =>
                              prev.map((item) =>
                                item.id === cost.id
                                  ? {
                                      ...item,
                                      kind: e.target.value as RecurringKind,
                                    }
                                  : item,
                              ),
                            )
                          }
                        >
                          <option value="expense">Expense</option>
                          <option value="income">Income</option>
                        </select>
                      </div>
                      <div className="mt-1 flex items-baseline justify-between gap-2">
                        <Label className="text-[11px] text-muted-foreground">Amount (SEK/mo)</Label>
                        <span
                          className={
                            cost.kind === "expense"
                              ? "text-xs font-medium text-finance-expense"
                              : "text-xs font-medium text-finance-income"
                          }
                        >
                          {cost.kind === "expense" ? "−" : "+"}
                          {formatSek(Math.abs(cost.amountSek))}
                        </span>
                      </div>
                      <Input
                        className="mt-1"
                        type="number"
                        min={0}
                        step={1}
                        value={cost.amountSek}
                        onChange={(e) =>
                          setRecurringCosts((prev) =>
                            prev.map((item) =>
                              item.id === cost.id
                                ? {
                                    ...item,
                                    amountSek: Math.abs(
                                      Number(e.target.value || 0),
                                    ),
                                  }
                                : item,
                            ),
                          )
                        }
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
            </CardContent>
          </Card>

          <div className="bento-span-full grid gap-4 lg:grid-cols-12">
            <Card className="lg:col-span-5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Property & leverage</CardTitle>
                <CardDescription className="text-xs">
                  House value, loan principal, LTV
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                  <div className="space-y-2 rounded-xl border border-border/50 bg-muted/15 p-3">
                    <p className="kpi-tile-label">House value</p>
                    <Input
                      type="number"
                      value={house.currentEstimatedValueSek}
                      onChange={(e) =>
                        setHouseholdDraft((prev) => ({
                          ...prev,
                          house: {
                            ...prev.house,
                            currentEstimatedValueSek: Number(e.target.value || 0),
                          },
                        }))
                      }
                    />
                  </div>
                  <div className="rounded-xl border border-border/50 bg-muted/15 p-3">
                    <p className="kpi-tile-label">Total loans</p>
                    <p className="kpi-tile-value">
                      {formatSek(houseMetrics.totalLoanPrincipalSek)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/50 bg-muted/15 p-3">
                    <p className="kpi-tile-label">LTV</p>
                    <p className="kpi-tile-value">{`${(houseMetrics.ltvRatio * 100).toFixed(1)}%`}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="min-w-0 lg:col-span-7">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Loans</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Loan</th>
                        <th>Principal</th>
                        <th>Rate</th>
                        <th>Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loans.map((loan) => (
                        <tr key={loan.id}>
                          <td>{loan.label}</td>
                          <td>
                            <Input
                              type="number"
                              className="max-w-[140px]"
                              value={loan.principalSek}
                              onChange={(e) =>
                                setHouseholdDraft((prev) => ({
                                  ...prev,
                                  loans: prev.loans.map((item) =>
                                    item.id === loan.id
                                      ? {
                                          ...item,
                                          principalSek: Number(e.target.value || 0),
                                        }
                                      : item,
                                  ) as HouseholdConfig["loans"],
                                }))
                              }
                            />
                          </td>
                          <td>{loan.annualInterestRatePct.toFixed(2)}%</td>
                          <td>{loan.rateType}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
          </div>
        </TabsContent>

      <TabsContent value="scenarios" className="mt-3">
          <div className="finance-bento">
            <Card className="bento-span-chart">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Scenario trend</CardTitle>
            </CardHeader>
            <CardContent>
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={scenarioChartSeries}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="totalIncomeSek"
                    stroke="#22c55e"
                    fill="rgba(34,197,94,0.15)"
                    name="Total income"
                  />
                  <Area
                    type="monotone"
                    dataKey="totalCostSek"
                    stroke="#ef4444"
                    fill="rgba(239,68,68,0.12)"
                    name="Total cost"
                  />
                  <Line type="monotone" dataKey="netCashflowSek" stroke="#38bdf8" />
                </LineChart>
              </ResponsiveContainer>
            </div>
            </CardContent>
          </Card>

          <div className="bento-span-kpi-stack flex flex-col gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Scenario</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <select
                  id="scenario-select"
                  className="native-select mt-0"
                  aria-label="Select scenario"
                  value={selectedScenarioId}
                  onChange={(e) =>
                    setSelectedScenarioId(e.target.value as typeof selectedScenarioId)
                  }
                >
                  {scenarios.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <p className="text-sm text-muted-foreground">{scenario?.description}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="kpi-tile-label">Current monthly net</p>
                <p
                  className={`kpi-tile-value ${summary.currentMonthlyNetSek >= 0 ? "text-finance-income" : "text-finance-expense"}`}
                >
                  {formatSek(summary.currentMonthlyNetSek)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="kpi-tile-label">Cumulative projection</p>
                <p
                  className={`kpi-tile-value ${summary.cumulativeNetCashflowSek >= 0 ? "text-finance-income" : "text-finance-expense"}`}
                >
                  {formatSek(summary.cumulativeNetCashflowSek)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="kpi-tile-label">Worst month</p>
                <p className="kpi-tile-value text-finance-runway">
                  {formatSek(summary.lowestMonthlyNetCashflowSek)}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="bento-span-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Simulate expense</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="space-y-1">
                <Label htmlFor="expense-amount">Amount (SEK)</Label>
                <Input
                  id="expense-amount"
                  type="number"
                  min={0}
                  value={expenseInput.amountSek}
                  onChange={(e) =>
                    setExpenseInput((prev) => ({
                      ...prev,
                      amountSek: Number(e.target.value || 0),
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="expense-type">Type</Label>
                <select
                  id="expense-type"
                  className="native-select mt-0"
                  value={expenseInput.type}
                  onChange={(e) =>
                    setExpenseInput((prev) => ({
                      ...prev,
                      type: e.target.value as "one_off" | "recurring",
                    }))
                  }
                >
                  <option value="one_off">One-off</option>
                  <option value="recurring">Recurring</option>
                </select>
              </div>
              <p>
                Affordable: <strong>{summary.affordable ? "Yes" : "No"}</strong>
              </p>
              <p className="text-muted-foreground">Reason: {summary.blockingReason}</p>
              <p className="text-muted-foreground">
                Buffer after one-off: {formatSek(summary.oneOffBufferAfterSek)} (min{" "}
                {formatSek(summary.bufferMinAmountSek)}, floor{" "}
                {formatSek(summary.bufferAbsoluteFloorSek)})
              </p>
            </CardContent>
          </Card>

          <Card className="bento-span-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Monthly projection</CardTitle>
              <CardDescription>
                {runPlan.projectionStartMonth} for {runPlan.projectionMonths} months
              </CardDescription>
            </CardHeader>
            <CardContent>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Income</th>
                    <th>Fixed</th>
                    <th>Variable</th>
                    <th>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {engineResult.projections.map((row) => (
                    <tr key={row.month}>
                      <td>{row.month}</td>
                      <td>{formatSek(row.totalIncomeSek)}</td>
                      <td>{formatSek(row.totalFixedCostsSek)}</td>
                      <td>{formatSek(row.totalVariableCostsSek)}</td>
                      <td>{formatSek(row.netCashflowSek)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </CardContent>
          </Card>
          </div>
        </TabsContent>
      </Tabs>
    </main>
  );
}
