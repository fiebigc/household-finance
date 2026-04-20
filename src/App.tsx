import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Payload } from "recharts/types/component/DefaultLegendContent";
import { ListOrdered, Pencil, Plus, Settings } from "lucide-react";
import { AppSettingsModal } from "./components/AppSettingsModal";
import { ScenarioBuilderPanel } from "./components/ScenarioBuilderPanel";
import { ExpenseTrackerTab } from "./components/ExpenseTrackerTab";
import { ChartTooltipAnchor, PortalCompactSekTooltip } from "./components/FinancePortalTooltip";
import { AuthGate } from "./components/AuthGate";
import { RecurringCategoryIcon } from "./components/RecurringCategoryIcon";
import { DashboardHealthSection } from "./components/DashboardHealthSection";
import { HouseholdPlanningCalendarCard } from "./components/HouseholdPlanningCalendarCard";
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
  entityIsReferenced,
  ENTITY_IDS,
  entityNameForHouseholdSlot,
  type BankAccountRecord,
  type EntityRecord,
  type EntityType,
  type RecurringCost,
  type RecurringKind,
} from "./data/bankData";
import { authUserDisplayName } from "./config/authDisplayNames";
import {
  getHouseholdConfig,
  getHouseMetrics,
  normalizeHouseholdFromRemote,
  type HouseholdConfig,
} from "./config/householdConfig";
import {
  createBlankScenario,
  INITIAL_BASELINE_SCENARIO_ID,
  type ScenarioDefinition,
} from "./config/scenarios";
import { useBentoCardSurfaces } from "./hooks/useBentoCardSurfaces";
import { useHouseholdPlanningCalendar } from "./hooks/useHouseholdPlanningCalendar";
import { useHouseholdMonthlySeries } from "./hooks/useHouseholdMonthlySeries";
import { useScenarioSimulation } from "./hooks/useScenarioSimulation";
import {
  deleteRecurringCostRemote,
  loadAppPersistedState,
  loadExpenseTrackerBoardsFromDb,
  loadScenariosFromDb,
  saveCurrentFinanceState,
  saveExpenseTrackerBoardsToDb,
  saveHouseholdConfigDraft,
  saveScenariosToDb,
} from "./lib/appDataService";
import { cn, formatUnknownError, parseOptionalNumberInput } from "@/lib/utils";
import { supabase } from "./lib/supabase";
import {
  buildDashboardInsights,
  recurringNetOutflowSek,
} from "./utils/finance/dashboardInsights";
import {
  RECURRING_FLOW_CATEGORY_IDS,
  normalizeRecurringFlowCategoryId,
  recurringFlowCategoryLabel,
} from "./utils/finance/recurringFlowCategory";
import {
  loanMonthlyInterestCostSek,
  totalLoansMonthlyInterestCostSek,
} from "./utils/finance/loanMonthlyCost";
import { recurringFlowClass } from "./utils/finance/recurringFlowStyle";
import type { ExpenseTrackerBoard } from "./utils/finance/expenseTrackerModel";

type MainDashboardTab = "current_finances" | "scenarios" | "expense_tracker";

const RECURRING_CARD_HELP =
  "Drag blocks between entity lanes. Use Add recurring to create a manual row. Rows are seeded from bundled CSVs when the same label repeats with a stable amount across several months. Edit the label, amount, or expense/income type, or delete a row. Red tiles are costs, green tiles are inflows. When Supabase is configured, the list (including removals) syncs automatically after a short pause.";

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

const GENERAL_CHART_KEYS = new Set(["totalIncomeSek", "totalCostSek", "netCashflowSek"]);

function legendPayloadFromRecharts(entries: Payload[] | undefined): LegendPayloadItem[] {
  return (entries ?? []).map((p) => ({
    value: typeof p.value === "string" ? p.value : undefined,
    color: typeof p.color === "string" ? p.color : undefined,
    dataKey:
      typeof p.dataKey === "string" || typeof p.dataKey === "number"
        ? p.dataKey
        : undefined,
  }));
}

function financeLegendPayloadKey(entries: Payload[] | undefined): string {
  return JSON.stringify(
    (entries ?? []).map((p) => [String(p.dataKey ?? ""), p.value ?? "", p.color ?? ""]),
  );
}

function legendPayloadEqual(a: LegendPayloadItem[], b: LegendPayloadItem[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i]?.dataKey !== b[i]?.dataKey ||
      a[i]?.value !== b[i]?.value ||
      a[i]?.color !== b[i]?.color
    ) {
      return false;
    }
  }
  return true;
}

/** Syncs Recharts legend payload into React state without rendering the default legend UI. */
function FinanceLegendPayloadSink({
  payload,
  onPayload,
}: {
  payload?: Payload[];
  onPayload: (items: LegendPayloadItem[]) => void;
}) {
  const key = useMemo(() => financeLegendPayloadKey(payload), [payload]);
  useLayoutEffect(() => {
    onPayload(legendPayloadFromRecharts(payload));
  }, [key, payload, onPayload]);
  return null;
}

/** Legend in three columns: Income/Cost/Net, bank accounts, loan accounts. */
function CompactFinanceChartLegend({
  payload,
  accounts,
}: {
  payload?: LegendPayloadItem[];
  accounts: readonly BankAccountRecord[];
}) {
  if (!payload?.length) return null;

  const loanIds = new Set(accounts.filter((a) => a.category === "loan").map((a) => a.id));
  const accountIdSet = new Set(accounts.map((a) => a.id));

  const general: LegendPayloadItem[] = [];
  const acctLines: LegendPayloadItem[] = [];
  const loanLines: LegendPayloadItem[] = [];

  for (const item of payload) {
    const dk = String(item.dataKey ?? "");
    if (GENERAL_CHART_KEYS.has(dk)) {
      general.push(item);
    } else if (loanIds.has(dk)) {
      loanLines.push(item);
    } else if (accountIdSet.has(dk)) {
      acctLines.push(item);
    } else {
      acctLines.push(item);
    }
  }

  function LegendColumn({ title, items }: { title: string; items: LegendPayloadItem[] }) {
    return (
      <div className="min-w-0 space-y-1">
        <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        <ul className="flex flex-col gap-0.5">
          {items.length === 0 ? (
            <li className="text-[10px] text-muted-foreground/70">—</li>
          ) : (
            items.map((item, index) => (
              <li
                key={`${String(item.dataKey ?? item.value ?? "k")}-${index}`}
                className="inline-flex max-w-full min-w-0 items-center gap-1 text-[10px] leading-tight text-muted-foreground"
              >
                <span
                  className="size-1.5 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: item.color ?? "transparent" }}
                  aria-hidden
                />
                <span
                  className="min-w-0 max-w-[5.5rem] flex-1 truncate text-muted-foreground/85 opacity-90 sm:max-w-[7rem]"
                  title={item.value}
                >
                  {item.value}
                </span>
              </li>
            ))
          )}
        </ul>
      </div>
    );
  }

  return (
    <div className="chart-legend-scroll max-h-[min(16rem,50vh)] w-full overflow-y-auto overscroll-y-contain px-1 py-0.5">
      <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-left sm:gap-x-4">
        <LegendColumn title="General" items={general} />
        <LegendColumn title="Accounts" items={acctLines} />
        <LegendColumn title="Loans" items={loanLines} />
      </div>
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
  const { surfaceFor, surfaceMap, setSurface, applyPreset, resetToDefaultMix } =
    useBentoCardSurfaces();
  const planningCalendar = useHouseholdPlanningCalendar(user.id);
  const [activeTab, setActiveTab] = useState<MainDashboardTab>("current_finances");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [householdDraft, setHouseholdDraft] = useState<HouseholdConfig>(() => getHouseholdConfig());
  const [entities, setEntities] = useState<EntityRecord[]>(defaultEntities);
  const [accounts, setAccounts] = useState<BankAccountRecord[]>(defaultBankAccounts);
  const [recurringCosts, setRecurringCosts] =
    useState<RecurringCost[]>(defaultRecurringCosts);
  const [showIndividualAccounts, setShowIndividualAccounts] = useState(true);
  const [financeChartLegendPayload, setFinanceChartLegendPayload] = useState<LegendPayloadItem[]>(
    [],
  );
  const handleFinanceChartLegendPayload = useCallback((items: LegendPayloadItem[]) => {
    setFinanceChartLegendPayload((prev) => (legendPayloadEqual(prev, items) ? prev : items));
  }, []);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editingAccountValue, setEditingAccountValue] = useState<number>(0);
  const [saveStatus, setSaveStatus] = useState("");
  const [monthlySeriesRefreshKey, setMonthlySeriesRefreshKey] = useState(0);
  const [scenarioLibrary, setScenarioLibrary] = useState<ScenarioDefinition[]>(() => [
    createBlankScenario({
      id: INITIAL_BASELINE_SCENARIO_ID,
      name: "Baseline",
      household: getHouseholdConfig(),
    }),
  ]);
  const [selectedScenarioId, setSelectedScenarioId] = useState(INITIAL_BASELINE_SCENARIO_ID);
  const [expenseTrackerBoards, setExpenseTrackerBoards] = useState<ExpenseTrackerBoard[]>([]);
  const [editHouseholdSnapshot, setEditHouseholdSnapshot] = useState(false);

  const { series: currentSeries, dataSource: monthlySeriesSource, loading: monthlySeriesLoading } =
    useHouseholdMonthlySeries(user.id, monthlySeriesRefreshKey);

  const trendChartTitleTooltip = useMemo(
    () =>
      monthlySeriesLoading
        ? "Loading chart data…"
        : monthlySeriesSource === "supabase"
          ? "From imported bank transactions stored in Supabase."
          : "Bundled sample CSVs until you import live transactions.",
    [monthlySeriesLoading, monthlySeriesSource],
  );

  const {
    adults: [adult1, adult2],
    children: [child1, child2],
    house,
    loans,
  } = householdDraft;

  const companyEntity = useMemo(
    () => entities.find((e) => e.type === "company"),
    [entities],
  );
  const companyDisplayName = companyEntity?.name?.trim() || "Company";
  const adult1EntityLabel = useMemo(
    () => entityNameForHouseholdSlot(entities, "adult1", adult1.label),
    [entities, adult1.label],
  );
  const adult2EntityLabel = useMemo(
    () => entityNameForHouseholdSlot(entities, "adult2", adult2.label),
    [entities, adult2.label],
  );
  const houseMetrics = useMemo(
    () => getHouseMetrics(householdDraft),
    [householdDraft],
  );
  const loansMonthlyInterestTotalSek = useMemo(
    () => totalLoansMonthlyInterestCostSek(loans),
    [loans],
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

  const addEntityRow = useCallback(() => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? `entity-${crypto.randomUUID()}`
        : `entity-${Date.now()}`;
    setEntities((prev) => [...prev, { id, name: "New member", type: "adult", notes: "" }]);
  }, []);

  const removeEntityRow = useCallback(
    (id: string) => {
      setEntities((prevEntities) => {
        if (!prevEntities.some((e) => e.id === id)) return prevEntities;
        const replacement =
          prevEntities.find((e) => e.id !== id && e.id === ENTITY_IDS.SHARED)?.id ??
          prevEntities.find((e) => e.id !== id)?.id;
        if (!replacement) return prevEntities;

        setAccounts((prevAccounts) =>
          prevAccounts.map((a) =>
            a.ownerEntityId === id ? { ...a, ownerEntityId: replacement } : a,
          ),
        );

        setRecurringCosts((prevCosts) => {
          const moved = prevCosts.map((c) =>
            c.assignedEntityId === id ? { ...c, assignedEntityId: replacement } : c,
          );
          const laneOrderByEntity = new Map<string, number>();
          return moved.map((c) => {
            const next = laneOrderByEntity.get(c.assignedEntityId) ?? 0;
            laneOrderByEntity.set(c.assignedEntityId, next + 1);
            return { ...c, laneOrder: next };
          });
        });

        return prevEntities.filter((e) => e.id !== id);
      });
    },
    [],
  );

  const liquidBalancesSek = useMemo(
    () =>
      accounts
        .filter((a) => a.category !== "loan")
        .reduce((sum, a) => sum + Math.max(0, a.currentBalanceSek), 0),
    [accounts],
  );

  const {
    runPlan,
    engineResult,
    expenseInput,
    setExpenseInput,
    explorationAnchors,
    loanInterestMonthlySek,
    setLoanInterestMonthlySek,
    incomeMonthlySek,
    setIncomeMonthlySek,
    recurringNetMonthlySek,
    setRecurringNetMonthlySek,
    cfRecurringBaselineSek,
    resetScenarioExploration,
    summary,
  } = useScenarioSimulation(
    householdDraft,
    {
      recurringNetMonthlySek: recurringNetCashAdjustSek,
      liquidBalancesSek,
    },
    scenarioLibrary,
    selectedScenarioId,
  );

  const scenarioChartSeries = useMemo(
    () =>
      engineResult.projections.map((point) => ({
        month: point.month,
        totalIncomeSek: point.totalIncomeSek,
        totalCostSek: point.totalFixedCostsSek + point.totalVariableCostsSek,
        netCashflowSek: point.netCashflowSek,
        cumulativeLiquiditySek: point.cumulativeLiquiditySek,
      })),
    [engineResult.projections],
  );

  const depletedMonthLabel = useMemo(() => {
    const n = summary.monthsUntilDepleted;
    if (n === null) return null;
    const row = engineResult.projections[n - 1];
    return row?.month ?? null;
  }, [summary.monthsUntilDepleted, engineResult.projections]);

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
    void Promise.all([
      loadAppPersistedState(user.id),
      loadScenariosFromDb(user.id),
      loadExpenseTrackerBoardsFromDb(user.id),
    ]).then(([data, scenarios, expenseBoards]) => {
      if (cancelled) return;
      if (data?.householdConfig) {
        setHouseholdDraft(normalizeHouseholdFromRemote(data.householdConfig));
      }
      if (data?.entities?.length) {
        setEntities(data.entities);
      }
      if (data?.accounts?.length) {
        setAccounts(data.accounts);
      }
      if (data?.recurringCosts?.length) {
        setRecurringCosts(
          data.recurringCosts.map((c) => ({
            ...c,
            kind: c.kind ?? "expense",
            categoryId: normalizeRecurringFlowCategoryId(c.categoryId),
            validFrom: c.validFrom ?? null,
            validTo: c.validTo ?? null,
          })),
        );
      }
      if (scenarios?.length) {
        setScenarioLibrary(scenarios);
        setSelectedScenarioId(scenarios[0]!.id);
      }
      if (expenseBoards !== null) {
        setExpenseTrackerBoards(expenseBoards);
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
          setSaveStatus(`Save failed: ${formatUnknownError(e)}`);
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

  useEffect(() => {
    if (!remoteHydrated) return;
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          await saveScenariosToDb(scenarioLibrary, user.id);
        } catch (e) {
          setSaveStatus(`Scenarios save failed: ${formatUnknownError(e)}`);
        }
      })();
    }, 550);
    return () => window.clearTimeout(t);
  }, [remoteHydrated, scenarioLibrary, user.id]);

  useEffect(() => {
    if (!remoteHydrated) return;
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          await saveExpenseTrackerBoardsToDb(expenseTrackerBoards, user.id);
        } catch (e) {
          setSaveStatus(`Expense lists save failed: ${formatUnknownError(e)}`);
        }
      })();
    }, 550);
    return () => window.clearTimeout(t);
  }, [remoteHydrated, expenseTrackerBoards, user.id]);

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

  const setAccountOwnerEntity = (accountId: string, ownerEntityId: string) => {
    setAccounts((prev) =>
      prev.map((a) => (a.id === accountId ? { ...a, ownerEntityId } : a)),
    );
  };

  const removeAccountRow = (accountId: string) => {
    setAccounts((prev) => prev.filter((a) => a.id !== accountId));
    if (editingAccountId === accountId) {
      setEditingAccountId(null);
    }
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
      setSaveStatus(`Save failed: ${formatUnknownError(error)}`);
    }
  };

  const saveScenarioTab = async () => {
    try {
      await saveScenariosToDb(scenarioLibrary, user.id);
      setSaveStatus("Scenarios saved to Supabase.");
    } catch (error) {
      setSaveStatus(`Save failed: ${formatUnknownError(error)}`);
    }
  };

  const saveExpenseTrackerTab = async () => {
    try {
      await saveExpenseTrackerBoardsToDb(expenseTrackerBoards, user.id);
      setSaveStatus("Expense lists saved to Supabase.");
    } catch (error) {
      setSaveStatus(`Save failed: ${formatUnknownError(error)}`);
    }
  };

  const linkBankAccountToEntityForImport = useCallback(
    async (accountId: string, entityId: string) => {
      const nextAccounts = accounts.map((a) =>
        a.id === accountId ? { ...a, ownerEntityId: entityId } : a,
      );
      setAccounts(nextAccounts);
      await saveCurrentFinanceState({
        entities,
        accounts: nextAccounts,
        recurringCosts,
        userId: user.id,
      });
    },
    [accounts, entities, recurringCosts, user.id],
  );

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

  const removeRecurringBlock = (costId: string) => {
    setRecurringCosts((prev) => prev.filter((c) => c.id !== costId));
    void deleteRecurringCostRemote(costId, user.id).catch(() => {
      setSaveStatus(
        "Could not delete this row on the server immediately; it will be removed on the next sync if saving works.",
      );
    });
  };

  const addRecurringRow = (entityId: string) => {
    setRecurringCosts((prev) => {
      const inLane = prev.filter((c) => c.assignedEntityId === entityId);
      const nextOrder =
        inLane.reduce((max, c) => Math.max(max, c.laneOrder), -1) + 1;
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? `rec-${crypto.randomUUID()}`
          : `rec-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      return [
        ...prev,
        {
          id,
          label: "New recurring flow",
          amountSek: 0,
          kind: "expense" as RecurringKind,
          assignedEntityId: entityId,
          laneOrder: nextOrder,
          categoryId: "other",
          validFrom: null,
          validTo: null,
        },
      ];
    });
  };

  return (
    <main className="page-shell">
      <div className="dashboard-sticky-header">
        <Card
          bentoSurface={surfaceFor("sticky_header")}
          className="border-border/80 shadow-bento ring-1 ring-black/[0.06] dark:ring-white/10"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-3 sm:gap-4 sm:pb-4">
            <CardTitle className="text-lg tracking-tight">Financial Dashboard</CardTitle>
            <div className="flex min-w-0 shrink-0 flex-wrap items-center justify-end gap-x-2 gap-y-2 sm:gap-x-3">
              <span
                className="max-w-[5.5rem] truncate text-sm text-muted-foreground sm:max-w-[12rem] md:max-w-none"
                title={user.email ?? undefined}
              >
                {authUserDisplayName(user)}
              </span>
              <Button
                type="button"
                size="sm"
                className="shrink-0"
                onClick={() => {
                  if (activeTab === "current_finances") void saveCurrentTab();
                  else if (activeTab === "scenarios") void saveScenarioTab();
                  else void saveExpenseTrackerTab();
                }}
              >
                {activeTab === "current_finances"
                  ? "Save finances"
                  : activeTab === "scenarios"
                    ? "Save scenarios"
                    : "Save expense lists"}
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
        userEmail={user.email}
        accounts={accounts}
        entities={entities}
        onLinkBankAccountToEntity={linkBankAccountToEntityForImport}
        onBankImportComplete={() => setMonthlySeriesRefreshKey((k) => k + 1)}
        bentoSurfaceMap={surfaceMap}
        onBentoSurfaceChange={setSurface}
        onBentoApplyPreset={applyPreset}
        onBentoResetDefaultMix={resetToDefaultMix}
      />

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as MainDashboardTab)}
      >
        <TabsList aria-label="Main views">
          <TabsTrigger value="current_finances">Current Finances</TabsTrigger>
          <TabsTrigger value="scenarios">Scenarios</TabsTrigger>
          <TabsTrigger value="expense_tracker">Expense tracker</TabsTrigger>
        </TabsList>

        <TabsContent value="current_finances" className="mt-3">
          <div className="finance-bento">
            <div className="bento-span-full relative z-20">
            <Card bentoSurface={surfaceFor("trend_chart")}>
            <CardHeader className="flex flex-col gap-3 space-y-0 pb-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <CardTitle title={trendChartTitleTooltip} className="cursor-default">
                  Current Finances Trend
                </CardTitle>
              </div>
              <MacosSwitch
                id="chart-show-accounts"
                checked={showIndividualAccounts}
                onCheckedChange={setShowIndividualAccounts}
                label="Show individual accounts"
              />
            </CardHeader>
            <CardContent>
            <div className="chart-wrap relative">
              {currentChartData.length === 0 ? (
                <p className="text-muted-foreground">
                  No chart points yet. Import a bank CSV (with Supabase configured) or check bundled
                  sample data.
                </p>
              ) : (
                <>
                <div className="pointer-events-none absolute right-1 top-1 z-20 sm:right-2 sm:top-2">
                  <div className="group/leg pointer-events-auto relative -m-1 inline-block rounded-lg p-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-8 border-border/80 bg-card/90 shadow-sm backdrop-blur-sm dark:bg-card/80"
                      aria-label="Show chart legend"
                      title="Chart legend"
                    >
                      <ListOrdered className="size-4" aria-hidden />
                    </Button>
                    <div
                      className="pointer-events-none invisible absolute right-0 top-full z-30 mt-0 w-[min(22rem,calc(100vw-2rem))] min-w-[16rem] origin-top-right scale-95 rounded-xl border border-border/80 bg-card/95 p-1 pt-2 opacity-0 shadow-lg ring-1 ring-black/[0.04] backdrop-blur-md transition duration-150 ease-out group-hover/leg:pointer-events-auto group-hover/leg:visible group-hover/leg:scale-100 group-hover/leg:opacity-100 group-focus-within/leg:pointer-events-auto group-focus-within/leg:visible group-focus-within/leg:scale-100 group-focus-within/leg:opacity-100 dark:ring-white/[0.06]"
                      role="region"
                      aria-label="Chart legend"
                    >
                      <CompactFinanceChartLegend
                        payload={financeChartLegendPayload}
                        accounts={accounts}
                      />
                    </div>
                  </div>
                </div>
                <ChartTooltipAnchor>
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
                    <Tooltip
                      content={(tp) => (
                        <PortalCompactSekTooltip
                          {...tp}
                          formatSek={formatSek}
                          formatMonthLabel={formatChartMonthTick}
                        />
                      )}
                      allowEscapeViewBox={{ x: true, y: true }}
                      isAnimationActive={false}
                      cursor={{ stroke: "hsl(var(--muted-foreground) / 0.35)", strokeWidth: 1 }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      align="center"
                      iconSize={0}
                      wrapperStyle={{
                        height: 0,
                        width: 0,
                        padding: 0,
                        margin: 0,
                        position: "absolute",
                        visibility: "hidden",
                        pointerEvents: "none",
                        overflow: "hidden",
                      }}
                      content={(legendProps) => (
                        <FinanceLegendPayloadSink
                          payload={legendProps.payload}
                          onPayload={handleFinanceChartLegendPayload}
                        />
                      )}
                    />
                    <Area
                      type="monotone"
                      yAxisId="totals"
                      dataKey="totalIncomeSek"
                      stroke="#22c55e"
                      strokeWidth={3}
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
                      strokeWidth={3}
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
                      strokeWidth={3.5}
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
                            strokeWidth={1.75}
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
                </ChartTooltipAnchor>
                </>
              )}
            </div>
            </CardContent>
          </Card>
            </div>

          <div className="bento-span-full relative z-10">
            <DashboardHealthSection
              insights={dashboardInsights}
              formatSek={formatSek}
              recurringNetCashAdjustSek={recurringNetCashAdjustSek}
              surfaceFor={surfaceFor}
            />
          </div>

          <Card
            bentoSurface={surfaceFor("household_snapshot")}
            className="bento-span-snap"
          >
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
              <div className="min-w-0">
                <CardTitle
                  title="Names and entities are stored in Supabase (app_household_config and app_entities). Bank accounts and recurring lanes use the entity list."
                  className="cursor-default"
                >
                  Current household snapshot
                </CardTitle>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5"
                onClick={() => setEditHouseholdSnapshot((v) => !v)}
              >
                <Pencil className="size-3.5" aria-hidden />
                {editHouseholdSnapshot ? "Done" : "Edit"}
              </Button>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {editHouseholdSnapshot ? (
              <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="snap-adult1-name">Adult 1 display name</Label>
                  <Input
                    id="snap-adult1-name"
                    value={adult1.label}
                    onChange={(e) =>
                      setHouseholdDraft((prev) => ({
                        ...prev,
                        adults: [{ ...prev.adults[0], label: e.target.value }, prev.adults[1]],
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="snap-adult2-name">Adult 2 display name</Label>
                  <Input
                    id="snap-adult2-name"
                    value={adult2.label}
                    onChange={(e) =>
                      setHouseholdDraft((prev) => ({
                        ...prev,
                        adults: [prev.adults[0], { ...prev.adults[1], label: e.target.value }],
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="snap-child1-name">Child 1 display name</Label>
                  <Input
                    id="snap-child1-name"
                    value={child1.label}
                    onChange={(e) =>
                      setHouseholdDraft((prev) => ({
                        ...prev,
                        children: [{ ...prev.children[0], label: e.target.value }, prev.children[1]],
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="snap-child2-name">Child 2 display name</Label>
                  <Input
                    id="snap-child2-name"
                    value={child2.label}
                    onChange={(e) =>
                      setHouseholdDraft((prev) => ({
                        ...prev,
                        children: [prev.children[0], { ...prev.children[1], label: e.target.value }],
                      }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-2 rounded-xl border border-border/50 bg-muted/15 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-foreground">People & companies (entities)</p>
                  <Button type="button" size="sm" variant="secondary" className="h-8 text-xs" onClick={addEntityRow}>
                    Add entity
                  </Button>
                </div>
                <ul className="space-y-2">
                  {entities.map((ent) => {
                    const referenced = entityIsReferenced(ent.id, accounts, recurringCosts);
                    const canRemove = entities.length > 1;
                    return (
                      <li
                        key={ent.id}
                        className="flex flex-col gap-2 rounded-lg border border-border/40 bg-background/60 p-2 sm:flex-row sm:items-end sm:gap-2"
                      >
                        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Name</Label>
                            <Input
                              value={ent.name}
                              onChange={(e) => {
                                const v = e.target.value;
                                setEntities((prev) =>
                                  prev.map((x) => (x.id === ent.id ? { ...x, name: v } : x)),
                                );
                              }}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Type</Label>
                            <select
                              className="native-select mt-0 h-9 text-sm"
                              value={ent.type}
                              onChange={(e) => {
                                const v = e.target.value as EntityType;
                                setEntities((prev) =>
                                  prev.map((x) => (x.id === ent.id ? { ...x, type: v } : x)),
                                );
                              }}
                            >
                              <option value="adult">Adult</option>
                              <option value="child">Child</option>
                              <option value="company">Company</option>
                              <option value="shared">Shared</option>
                            </select>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 shrink-0 text-xs text-muted-foreground hover:text-finance-expense"
                          disabled={!canRemove}
                          title={
                            !canRemove
                              ? "At least one entity is required."
                              : referenced
                                ? "Remove entity and move linked accounts/flows to Shared."
                                : "Remove entity"
                          }
                          onClick={() => removeEntityRow(ent.id)}
                        >
                          Remove
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </div>
              </>
              ) : null}

              <div className="space-y-1.5 border-t border-border/40 pt-3 text-muted-foreground">
                <p>Transition date default: {householdDraft.transitionDate}</p>
                <p>
                  Adults: {householdDraft.adults.length} (1: {adult1.label || "—"}, 2:{" "}
                  {adult2.label || "—"})
                </p>
                <p>
                  Children: {householdDraft.children.length} ({child1.label}, {child2.label})
                </p>
                <p>Monthly fixed costs: {formatSek(monthlyFixedCostsTotal)}</p>
                <p>Monthly variable costs: {formatSek(monthlyVariableCostsTotal)}</p>
                <p>Barnbidrag total: {formatSek(totalBarnbidrag)}</p>
              </div>
            </CardContent>
          </Card>

          <Card
            bentoSurface={surfaceFor("adult_company_editor")}
            className="bento-span-adults"
          >
            <CardHeader className="pb-2">
              <CardTitle
                title="Brutto and SGI rows are keyed to Adult 1 / Adult 2 (household config). Custom display names are edited under Current household snapshot → Edit; they appear in this card’s tooltips and elsewhere in the app."
                className="cursor-default"
              >
                Income & company
              </CardTitle>
            </CardHeader>
            <CardContent>
            <div className="form-grid">
              <div className="space-y-2">
              <div className="space-y-1">
                <Label
                  htmlFor="adult2-brutto"
                  title={
                    adult2.label.trim() !== adult2EntityLabel
                      ? `Household snapshot label: ${adult2.label}. Entity row: ${adult2EntityLabel}.`
                      : `Linked entity: ${adult2EntityLabel}.`
                  }
                >
                  {adult2EntityLabel} monthly brutto (SEK)
                </Label>
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
                <Label
                  htmlFor="adult2-sgi"
                  title={
                    adult2.label.trim() !== adult2EntityLabel
                      ? `Household snapshot label: ${adult2.label}. Entity row: ${adult2EntityLabel}.`
                      : `Linked entity: ${adult2EntityLabel}.`
                  }
                >
                  {adult2EntityLabel} SGI (annual SEK)
                </Label>
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
                  <Label
                    htmlFor="adult1-brutto"
                    title={
                      adult1.label.trim() !== adult1EntityLabel
                        ? `Household snapshot label: ${adult1.label}. Entity row: ${adult1EntityLabel}.`
                        : `Linked entity: ${adult1EntityLabel}.`
                    }
                  >
                    {adult1EntityLabel} monthly brutto (SEK)
                  </Label>
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
                  <Label
                    htmlFor="adult1-sgi"
                    title={
                      adult1.label.trim() !== adult1EntityLabel
                        ? `Household snapshot label: ${adult1.label}. Entity row: ${adult1EntityLabel}.`
                        : `Linked entity: ${adult1EntityLabel}.`
                    }
                  >
                    {adult1EntityLabel} SGI (annual SEK)
                  </Label>
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
                <Label
                  htmlFor="typology-monthly"
                  title="Stored on the household draft in Supabase. The scenario engine does not use this field yet."
                >
                  {companyDisplayName} monthly estimate (SEK)
                </Label>
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
              </div>
            </div>
            </CardContent>
          </Card>

          <HouseholdPlanningCalendarCard
            bentoSurface={surfaceFor("household_planning_calendar")}
            portalFkBentoSurface={surfaceFor("household_planning_fk_reference")}
            portalPensionBentoSurface={surfaceFor("household_planning_pension_reference")}
            householdConfig={householdDraft}
            portalSnapshot={planningCalendar.portalSnapshot}
            calendarDays={planningCalendar.calendarDays}
            appendBooking={planningCalendar.appendBooking}
            removeBookingAt={planningCalendar.removeBookingAt}
            setPersonBookings={planningCalendar.setPersonBookings}
            applyMarkToRange={planningCalendar.applyMarkToRange}
            applyWeekly={planningCalendar.applyWeekly}
            workRules={planningCalendar.workRules}
            setWorkRules={planningCalendar.setWorkRules}
            persistStatus={planningCalendar.persistStatus}
            formatSek={formatSek}
            entities={entities}
            setPortalSnapshot={planningCalendar.setPortalSnapshot}
          />

          <Card bentoSurface={surfaceFor("bank_accounts")} className="bento-span-full">
            <CardHeader className="pb-2">
              <CardTitle
                title="Each account is stored with an owner entity. Hover the account name (or focus the row) to change owner; loans stay grouped under shared."
              >
                All bank accounts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
            {entities.map((entity) => (
              <div key={entity.id} className="min-w-0 space-y-2">
                <h3 className="border-b border-border/50 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {entity.name}
                </h3>
                <div className="overflow-x-auto overflow-y-visible rounded-[10px] border border-border/60 bg-card/40">
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
                          <td className="max-w-[min(100vw,260px)] py-2 pl-3 pr-2 align-middle">
                            {account.category === "loan" ? (
                              <div className="min-w-0">
                                <span
                                  className="account-table-name block truncate"
                                  title={
                                    account.accountNumber
                                      ? `${account.name} — account ${account.accountNumber}`
                                      : account.name
                                  }
                                >
                                  {account.name}
                                </span>
                                <span
                                  className="mt-1 block text-[11px] text-muted-foreground"
                                  title="Loan accounts are always grouped under the shared household column for reporting."
                                >
                                  Shared
                                </span>
                              </div>
                            ) : (
                              <div
                                className={cn(
                                  "group/name grid min-w-0 grid-cols-1 transition-[grid-template-rows] duration-150",
                                  "[grid-template-rows:auto_1fr]",
                                  "sm:[grid-template-rows:auto_0fr] sm:hover:[grid-template-rows:auto_1fr] sm:focus-within:[grid-template-rows:auto_1fr]",
                                )}
                              >
                                <span
                                  className="account-table-name min-h-[1.25rem] cursor-default truncate"
                                  title={
                                    account.accountNumber
                                      ? `${account.name} — account ${account.accountNumber}. Hover the name to show owner.`
                                      : `${account.name}. Hover the name to show owner.`
                                  }
                                >
                                  {account.name}
                                </span>
                                <div className="min-h-0 overflow-hidden pt-1 sm:pt-0 sm:group-hover/name:pt-1 sm:group-focus-within/name:pt-1">
                                  <select
                                    className="native-select h-8 w-full max-w-[min(100%,14rem)] py-1 text-xs"
                                    value={account.ownerEntityId}
                                    aria-label={`Owner for ${account.name}`}
                                    onChange={(e) =>
                                      setAccountOwnerEntity(account.id, e.target.value)
                                    }
                                  >
                                    {!entities.some((e) => e.id === account.ownerEntityId) ? (
                                      <option value={account.ownerEntityId}>
                                        Unknown ({account.ownerEntityId})
                                      </option>
                                    ) : null}
                                    {entities.map((ent) => (
                                      <option key={ent.id} value={ent.id}>
                                        {ent.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            )}
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
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="balance-edit-btn h-7 shrink-0 px-2 text-xs text-finance-expense"
                                  type="button"
                                  title="Remove account from current finances and Supabase on next autosave."
                                  onClick={() => removeAccountRow(account.id)}
                                >
                                  Remove
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

          <Card bentoSurface={surfaceFor("recurring_flows")} className="bento-span-full">
            <CardHeader className="pb-2">
              <CardTitle>
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
                          onClick={() => removeRecurringBlock(cost.id)}
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
                      <div className="mt-1 flex items-center gap-2">
                        <RecurringCategoryIcon categoryId={cost.categoryId} />
                        <select
                          className="native-select h-8 min-w-0 flex-1 py-1 text-xs"
                          aria-label="Recurring category"
                          value={cost.categoryId}
                          onChange={(e) =>
                            setRecurringCosts((prev) =>
                              prev.map((item) =>
                                item.id === cost.id
                                  ? {
                                      ...item,
                                      categoryId: normalizeRecurringFlowCategoryId(
                                        e.target.value,
                                      ),
                                    }
                                  : item,
                              ),
                            )
                          }
                        >
                          {RECURRING_FLOW_CATEGORY_IDS.map((cid) => (
                            <option key={cid} value={cid}>
                              {recurringFlowCategoryLabel(cid)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="mt-1 grid grid-cols-2 gap-1.5">
                        <div className="space-y-0.5">
                          <Label className="text-[10px] text-muted-foreground">Active from</Label>
                          <Input
                            type="date"
                            className="h-8 text-xs"
                            value={cost.validFrom ?? ""}
                            onChange={(e) =>
                              setRecurringCosts((prev) =>
                                prev.map((item) =>
                                  item.id === cost.id
                                    ? {
                                        ...item,
                                        validFrom:
                                          e.target.value.trim() === ""
                                            ? null
                                            : e.target.value,
                                      }
                                    : item,
                                ),
                              )
                            }
                          />
                        </div>
                        <div className="space-y-0.5">
                          <Label className="text-[10px] text-muted-foreground">Active until</Label>
                          <Input
                            type="date"
                            className="h-8 text-xs"
                            value={cost.validTo ?? ""}
                            onChange={(e) =>
                              setRecurringCosts((prev) =>
                                prev.map((item) =>
                                  item.id === cost.id
                                    ? {
                                        ...item,
                                        validTo:
                                          e.target.value.trim() === ""
                                            ? null
                                            : e.target.value,
                                      }
                                    : item,
                                ),
                              )
                            }
                          />
                        </div>
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
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2 h-8 w-full gap-1 text-xs font-normal"
                    onClick={() => addRecurringRow(entity.id)}
                  >
                    <Plus className="size-3.5 shrink-0" aria-hidden />
                    Add recurring
                  </Button>
                </div>
              ))}
            </div>
            </CardContent>
          </Card>

          <div className="bento-span-full grid gap-4 lg:grid-cols-12">
            <Card bentoSurface={surfaceFor("loans_table")} className="min-w-0 lg:col-span-12">
              <CardHeader className="pb-2">
                <CardTitle>Loans</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Loan</th>
                        <th className="text-right">Principal</th>
                        <th className="text-right">Rate</th>
                        <th>Type</th>
                        <th className="text-right">Cost (mo)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loans.map((loan) => (
                        <tr key={loan.id}>
                          <td>{loan.label}</td>
                          <td className="text-right tabular-nums">
                            <Input
                              type="number"
                              className="ml-auto max-w-[140px] text-right"
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
                          <td className="text-right tabular-nums">
                            {loan.annualInterestRatePct.toFixed(2)}%
                          </td>
                          <td>{loan.rateType}</td>
                          <td className="text-right tabular-nums text-muted-foreground">
                            {formatSek(loanMonthlyInterestCostSek(loan))}
                            <span className="sr-only"> interest-only, per month</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border bg-muted/25 font-medium text-foreground">
                        <td colSpan={4}>Total (interest / month)</td>
                        <td className="text-right tabular-nums">
                          {formatSek(loansMonthlyInterestTotalSek)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card bentoSurface={surfaceFor("property_leverage")} className="bento-span-full">
            <CardHeader className="pb-2">
              <CardTitle>Property & leverage</CardTitle>
              <CardDescription className="text-xs">
                House value, loan principal, LTV
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end">
                <div className="flex min-h-[5.25rem] flex-col gap-2 rounded-xl border border-border/50 bg-muted/15 p-3">
                  <p className="kpi-tile-label shrink-0">House value</p>
                  <div className="mt-auto flex min-h-9 items-end">
                    <Input
                      type="number"
                      className="w-full text-right tabular-nums"
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
                </div>
                <div className="flex min-h-[5.25rem] flex-col gap-2 rounded-xl border border-border/50 bg-muted/15 p-3">
                  <p className="kpi-tile-label shrink-0">Total loans</p>
                  <p className="kpi-tile-value mt-auto min-h-9 text-right tabular-nums leading-9">
                    {formatSek(houseMetrics.totalLoanPrincipalSek)}
                  </p>
                </div>
                <div className="flex min-h-[5.25rem] flex-col gap-2 rounded-xl border border-border/50 bg-muted/15 p-3">
                  <p className="kpi-tile-label shrink-0">LTV</p>
                  <p className="kpi-tile-value mt-auto min-h-9 text-right tabular-nums leading-9">
                    {`${(houseMetrics.ltvRatio * 100).toFixed(1)}%`}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          </div>
        </TabsContent>

      <TabsContent value="scenarios" className="mt-3">
          <div className="finance-bento finance-bento--scenarios">
            <Card bentoSurface={surfaceFor("scenario_trend_chart")} className="bento-span-chart">
            <CardHeader className="pb-2">
              <CardTitle>Scenario cashflow & liquidity runway</CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                Left axis: monthly modeled income, total cost, and net (after the three Current
                Finances blocks in Scenario & exploration). Right axis: cumulative liquidity starting
                from the sum of non-loan account balances on the Current Finances tab, plus the
                running sum of net. The horizontal line at 0 kr is insolvency. “Max runway (worst
                burn)” in the KPI stack uses that same starting liquidity.
              </CardDescription>
            </CardHeader>
            <CardContent>
            <div className="chart-wrap">
              <ChartTooltipAnchor>
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={scenarioChartSeries}>
                  <CartesianGrid {...CHART_GRID_DOT} horizontal vertical />
                  <XAxis
                    dataKey="month"
                    tickFormatter={formatChartMonthTick}
                    tick={CHART_AXIS_TICK}
                    tickLine={false}
                    height={28}
                  />
                  <YAxis
                    yAxisId="flow"
                    tickFormatter={(v) => formatChartAxisNumber(Number(v))}
                    width={52}
                    tick={CHART_AXIS_TICK}
                    tickLine={false}
                    axisLine={false}
                    label={{
                      value: "SEK / month",
                      angle: -90,
                      position: "insideLeft",
                      style: { fontSize: 9, fill: "hsl(var(--muted-foreground))" },
                    }}
                  />
                  <YAxis
                    yAxisId="liq"
                    orientation="right"
                    tickFormatter={(v) => formatChartAxisNumber(Number(v))}
                    width={52}
                    tick={CHART_AXIS_TICK}
                    tickLine={false}
                    axisLine={false}
                    label={{
                      value: "Liquidity (SEK)",
                      angle: 90,
                      position: "insideRight",
                      style: { fontSize: 9, fill: "hsl(var(--muted-foreground))" },
                    }}
                  />
                  <Tooltip
                    content={(tp) => (
                      <PortalCompactSekTooltip
                        {...tp}
                        formatSek={formatSek}
                        formatMonthLabel={formatChartMonthTick}
                      />
                    )}
                    allowEscapeViewBox={{ x: true, y: true }}
                    isAnimationActive={false}
                  />
                  <Legend
                    wrapperStyle={{
                      fontSize: 11,
                      color: "hsl(var(--muted-foreground))",
                    }}
                  />
                  <Area
                    yAxisId="flow"
                    type="monotone"
                    dataKey="totalIncomeSek"
                    stroke="#4ade80"
                    fill="rgba(74,222,128,0.18)"
                    name="Income (mo)"
                  />
                  <Area
                    yAxisId="flow"
                    type="monotone"
                    dataKey="totalCostSek"
                    stroke="#fb7185"
                    fill="rgba(251,113,133,0.16)"
                    name="Total cost (mo)"
                  />
                  <Line
                    yAxisId="flow"
                    type="monotone"
                    dataKey="netCashflowSek"
                    stroke="#7dd3fc"
                    strokeWidth={2}
                    dot={false}
                    name="Net (mo)"
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="liq"
                    type="monotone"
                    dataKey="cumulativeLiquiditySek"
                    stroke="#c4b5fd"
                    strokeWidth={2.5}
                    dot={false}
                    name="Cumulative liquidity"
                    isAnimationActive={false}
                  />
                  <ReferenceLine
                    yAxisId="liq"
                    y={0}
                    stroke="hsl(var(--muted-foreground))"
                    strokeDasharray="4 4"
                    strokeOpacity={0.85}
                  />
                </ComposedChart>
              </ResponsiveContainer>
              </ChartTooltipAnchor>
            </div>
            </CardContent>
          </Card>

          <div className="bento-span-kpi-stack flex flex-col gap-4">
            <Card bentoSurface={surfaceFor("scenario_selector")}>
              <CardHeader className="pb-2">
                <CardTitle>Scenario & exploration</CardTitle>
                <CardDescription className="text-xs">
                  Scenario events still apply month by month. The three blocks below start from
                  your Current Finances tab (loans, recurring list, modeled month-0 income) and only
                  affect this projection (not saved config).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ScenarioBuilderPanel
                  scenarioLibrary={scenarioLibrary}
                  setScenarioLibrary={setScenarioLibrary}
                  selectedScenarioId={selectedScenarioId}
                  setSelectedScenarioId={setSelectedScenarioId}
                  householdDraft={householdDraft}
                  recurringCosts={recurringCosts}
                  formatSek={formatSek}
                />

                <p className="rounded-lg border border-border/50 bg-muted/20 px-2 py-1.5 text-[11px] text-muted-foreground">
                  Starting liquidity for the purple line:{" "}
                  <span className="font-medium text-foreground">
                    {formatSek(liquidBalancesSek)}
                  </span>{" "}
                  (sum of non-loan accounts with positive balances on Current Finances).
                </p>

                <div className="space-y-3 rounded-xl border border-border/60 bg-muted/15 p-3">
                  <p className="text-xs font-semibold text-foreground">Loan (monthly cost)</p>
                  <p className="text-[11px] text-muted-foreground">
                    Modeled loan interest from the Loans / household draft for the first projection
                    month, then it follows principals as scenario events apply. Anchor:{" "}
                    {formatSek(explorationAnchors.loanInterestAnchorSek)} / month. Your edit shifts
                    every month by the same offset from that anchor.
                  </p>
                  <div className="space-y-1">
                    <Label className="text-[11px]" htmlFor="scenario-loan-monthly">
                      Loan interest (SEK / month)
                    </Label>
                    <Input
                      id="scenario-loan-monthly"
                      type="number"
                      min={0}
                      step={500}
                      value={Math.round(loanInterestMonthlySek)}
                      onChange={(e) =>
                        setLoanInterestMonthlySek(Number(e.target.value || 0))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-3 rounded-xl border border-border/60 bg-muted/15 p-3">
                  <p className="text-xs font-semibold text-foreground">Recurring (costs)</p>
                  <p className="text-[11px] text-muted-foreground">
                    Net from Recurring cash flows (out − in). List total:{" "}
                    {formatSek(cfRecurringBaselineSek)} / month.
                  </p>
                  <div className="space-y-1">
                    <Label className="text-[11px]" htmlFor="scenario-recurring-net">
                      Recurring net outflow (SEK / month)
                    </Label>
                    <Input
                      id="scenario-recurring-net"
                      type="number"
                      step={500}
                      value={Math.round(recurringNetMonthlySek)}
                      onChange={(e) =>
                        setRecurringNetMonthlySek(Number(e.target.value || 0))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-3 rounded-xl border border-border/60 bg-muted/15 p-3">
                  <p className="text-xs font-semibold text-foreground">Income</p>
                  <p className="text-[11px] text-muted-foreground">
                    Modeled month-0 household income (adults, benefits, barnbidrag, company
                    estimate). Anchor: {formatSek(explorationAnchors.incomeAnchorSek)} / month. Your
                    edit shifts the income curve by the offset from that anchor while events still
                    change employment month to month.
                  </p>
                  <div className="space-y-1">
                    <Label className="text-[11px]" htmlFor="scenario-income-monthly">
                      Income (SEK / month)
                    </Label>
                    <Input
                      id="scenario-income-monthly"
                      type="number"
                      min={0}
                      step={500}
                      value={Math.round(incomeMonthlySek)}
                      onChange={(e) =>
                        setIncomeMonthlySek(Number(e.target.value || 0))
                      }
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-border/50 bg-background/60 px-2 py-2 text-[11px] text-muted-foreground">
                  <p>
                    <span className="font-medium text-foreground">Liquidity path: </span>
                    lowest {formatSek(summary.minCumulativeLiquiditySek)} ·{" "}
                    {depletedMonthLabel ? (
                      <>
                        hits ≤ 0 kr by{" "}
                        <span className="font-medium text-foreground">{depletedMonthLabel}</span> (
                        month {summary.monthsUntilDepleted} of the projection)
                      </>
                    ) : (
                      <>stays above 0 kr for all {runPlan.projectionMonths} projected months</>
                    )}
                  </p>
                  <p className="mt-1">
                    <span className="font-medium text-foreground">Max runway (worst burn): </span>
                    {summary.worstMonthBurnRunwayMonths !== null
                      ? `${summary.worstMonthBurnRunwayMonths} months at the weakest monthly net (${formatSek(summary.lowestMonthlyNetCashflowSek)}).`
                      : "Not applicable (no negative net month in the window)."}
                  </p>
                </div>

                <Button type="button" variant="outline" size="sm" onClick={resetScenarioExploration}>
                  Reset to Current Finances baselines
                </Button>
              </CardContent>
            </Card>
            <Card bentoSurface={surfaceFor("scenario_kpi_current_net")}>
              <CardContent className="p-3">
                <p className="kpi-tile-label">Current monthly net</p>
                <p
                  className={`kpi-tile-value ${summary.currentMonthlyNetSek >= 0 ? "text-finance-income" : "text-finance-expense"}`}
                >
                  {formatSek(summary.currentMonthlyNetSek)}
                </p>
              </CardContent>
            </Card>
            <Card bentoSurface={surfaceFor("scenario_kpi_cumulative")}>
              <CardContent className="p-3">
                <p className="kpi-tile-label">Cumulative projection</p>
                <p
                  className={`kpi-tile-value ${summary.cumulativeNetCashflowSek >= 0 ? "text-finance-income" : "text-finance-expense"}`}
                >
                  {formatSek(summary.cumulativeNetCashflowSek)}
                </p>
              </CardContent>
            </Card>
            <Card bentoSurface={surfaceFor("scenario_kpi_worst")}>
              <CardContent className="p-3">
                <p className="kpi-tile-label">Worst month</p>
                <p className="kpi-tile-value text-finance-runway">
                  {formatSek(summary.lowestMonthlyNetCashflowSek)}
                </p>
              </CardContent>
            </Card>
            <Card bentoSurface={surfaceFor("scenario_kpi_runway")}>
              <CardContent className="space-y-2 p-3">
                <p className="kpi-tile-label">Runway summary</p>
                <p className="text-xs text-muted-foreground">
                  Min liquidity on path:{" "}
                  <span
                    className={
                      summary.minCumulativeLiquiditySek < 0
                        ? "font-semibold text-finance-expense"
                        : "font-semibold text-foreground"
                    }
                  >
                    {formatSek(summary.minCumulativeLiquiditySek)}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Max runway (worst burn):{" "}
                  <span className="font-semibold text-foreground">
                    {summary.worstMonthBurnRunwayMonths !== null
                      ? `${summary.worstMonthBurnRunwayMonths} mo`
                      : "—"}
                  </span>
                </p>
              </CardContent>
            </Card>
          </div>

          <Card bentoSurface={surfaceFor("scenario_simulate_expense")} className="bento-span-full">
            <CardHeader className="pb-2">
              <CardTitle>Simulate expense</CardTitle>
              <CardDescription className="text-xs">
                Uses the same liquid balance pool as the scenario runway chart (non-loan accounts on
                Current Finances).
              </CardDescription>
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

          <Card
            bentoSurface={surfaceFor("scenario_monthly_projection")}
            className="bento-span-full"
          >
            <CardHeader className="pb-2">
              <CardTitle>Monthly projection</CardTitle>
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
                    <th>Liquidity</th>
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
                      <td>{formatSek(row.cumulativeLiquiditySek)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </CardContent>
          </Card>
          </div>
        </TabsContent>

        <TabsContent value="expense_tracker" className="mt-3">
          <ExpenseTrackerTab
            boards={expenseTrackerBoards}
            setBoards={setExpenseTrackerBoards}
            formatSek={formatSek}
            cardSurface={surfaceFor("recurring_flows")}
          />
        </TabsContent>
      </Tabs>
    </main>
  );
}
