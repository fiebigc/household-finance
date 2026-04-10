import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { CashflowTrajectoryChart } from "@/components/CashflowTrajectoryChart";
import { GoalsTab } from "@/components/GoalsTab";
import { HouseholdPersonasBoard } from "@/components/HouseholdPersonasBoard";
import { InfoTip } from "@/components/InfoTip";
import { LoginPage } from "@/components/LoginPage";
import { RealBalancesCard } from "@/components/RealBalancesCard";
import { ScenariosTab } from "@/components/ScenariosTab";
import { SettingsDialog } from "@/components/SettingsDialog";
import { TransactionsTab } from "@/components/TransactionsTab";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useI18n } from "@/i18n/I18nContext";
import { useTheme } from "@/theme/ThemeContext";
import { useBankData } from "@/hooks/useBankData";
import { usePersonaSettings } from "@/hooks/usePersonaSettings";
import { useUserUiPreferences } from "@/hooks/useUserUiPreferences";
import type { ExpenseItem, IncomeStream, Persona } from "@/lib/cashflow";
import { totalMonthlyNetIncomeStockholm, totalMonthlyExpenses, DEFAULT_WORK_PARAMS } from "@/lib/cashflow";
import { inferWorkParamsFromStreams, inferDaycareFromExpenses } from "@/lib/detectIncomeSource";

const defaultPersonas: Persona[] = [
  { id: "christian", name: "Christian", type: "person", workParams: { ...DEFAULT_WORK_PARAMS } },
  { id: "heli", name: "Heli", type: "person", workParams: { ...DEFAULT_WORK_PARAMS } },
  { id: "aaro", name: "Aaro", type: "person", workParams: { ...DEFAULT_WORK_PARAMS, workHoursPerWeek: 0 } },
  { id: "unto", name: "Unto", type: "person", workParams: { ...DEFAULT_WORK_PARAMS, workHoursPerWeek: 0 } },
];

const LS_KEY_PERSONAS = "fin:personas";
const LS_KEY_INCOME = "fin:incomeStreams";
const LS_KEY_EXPENSES = "fin:expenses";
const LS_KEY_BALANCE = "fin:startingBalance";

function loadJson<T>(key: string): T | null {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
}
function saveJson(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
}

function applyWorkParamInference(
  streams: IncomeStream[],
  expenses: Array<{ title: string; personaId: string | null }>,
  personas: Persona[],
  setPersonas: (p: Persona[]) => void,
) {
  const daycareKids = inferDaycareFromExpenses(expenses);
  const updated = personas.map((p) => {
    const inferred = inferWorkParamsFromStreams(streams, p.id);
    if (!inferred) return p;
    return {
      ...p,
      workParams: {
        ...(p.workParams ?? DEFAULT_WORK_PARAMS),
        ...inferred,
        daycareChildren: daycareKids,
      },
    };
  });
  if (JSON.stringify(updated) !== JSON.stringify(personas)) {
    setPersonas(updated);
  }
}

export default function App() {
  const { user, loading: authLoading } = useAuth();
  const { t, numberLocale, locale, setLocale } = useI18n();
  const { theme, setTheme } = useTheme();
  useUserUiPreferences(user?.id, locale, theme, setLocale, setTheme);
  const sessionReady = !authLoading && !!user;
  const bank = useBankData(sessionReady);
  const personaSettings = usePersonaSettings(user?.id, user?.email);

  const mySetting = user ? personaSettings.settings.get(user.userKey) : undefined;
  const mySgi = mySetting?.sgiAnnual ?? 0;
  const myFullTimeGross = mySetting?.fullTimeGross ?? 0;

  const [simType, setSimType] = useState<"one-off" | "recurring">("one-off");
  const [simAmount, setSimAmount] = useState("5000");

  const savedPersonas = loadJson<Persona[]>(LS_KEY_PERSONAS)?.map((p) => ({
    ...p,
    type: p.type ?? "person" as const,
    workParams: p.workParams ?? { ...DEFAULT_WORK_PARAMS },
  }));
  const savedIncome = loadJson<IncomeStream[]>(LS_KEY_INCOME);
  const savedExpenses = loadJson<ExpenseItem[]>(LS_KEY_EXPENSES);
  const savedBalance = loadJson<number>(LS_KEY_BALANCE);

  const [personas, setPersonasRaw] = useState<Persona[]>(savedPersonas ?? defaultPersonas);
  const [incomeStreams, setIncomeStreamsRaw] = useState<IncomeStream[]>(savedIncome ?? []);
  const [expenseItems, setExpenseItemsRaw] = useState<ExpenseItem[]>(savedExpenses ?? []);
  const [startingBalanceSek, setStartingBalanceSekRaw] = useState(savedBalance ?? 0);

  const setPersonas = useCallback((p: Persona[]) => { setPersonasRaw(p); saveJson(LS_KEY_PERSONAS, p); }, []);
  const setIncomeStreams = useCallback((s: IncomeStream[]) => { setIncomeStreamsRaw(s); saveJson(LS_KEY_INCOME, s); }, []);
  const setExpenseItems = useCallback((e: ExpenseItem[]) => { setExpenseItemsRaw(e); saveJson(LS_KEY_EXPENSES, e); }, []);
  const setStartingBalanceSek = useCallback((v: number) => { setStartingBalanceSekRaw(v); saveJson(LS_KEY_BALANCE, v); }, []);

  /** User chose manual income/expense rows — do not overwrite from bank CSV. */
  const skipCsvImportRef = useRef(
    (savedIncome ?? []).some((s) => s.source === "manual")
    || (savedExpenses ?? []).some((e) => e.source === "manual"),
  );
  const csvMergeDoneRef = useRef(false);
  const balanceFromBankDoneRef = useRef(false);

  useEffect(() => {
    if (!sessionReady) {
      csvMergeDoneRef.current = false;
      balanceFromBankDoneRef.current = false;
      return;
    }
    if (bank.loading || !bank.fetchComplete) return;

    if (!balanceFromBankDoneRef.current) {
      balanceFromBankDoneRef.current = true;
      setStartingBalanceSek(bank.defaultLiquidity);
    }

    if (csvMergeDoneRef.current) return;
    csvMergeDoneRef.current = true;

    if (skipCsvImportRef.current) return;

    if (bank.recurring.hasData) {
      setIncomeStreams(bank.recurring.incomeStreams);
      setExpenseItems(bank.recurring.expenses);
      applyWorkParamInference(bank.recurring.incomeStreams, bank.recurring.expenses, personas, setPersonas);
    }
  }, [
    sessionReady,
    bank.loading,
    bank.fetchComplete,
    bank.defaultLiquidity,
    bank.recurring,
    personas,
    setExpenseItems,
    setIncomeStreams,
    setPersonas,
    setStartingBalanceSek,
  ]);

  const migrateRef = useRef(false);
  useEffect(() => {
    if (!sessionReady || bank.loading || !bank.fetchComplete || migrateRef.current) return;
    const migKey = "fin:workParamsInferred";
    if (localStorage.getItem(migKey)) return;
    migrateRef.current = true;
    applyWorkParamInference(incomeStreams, expenseItems, personas, setPersonas);
    localStorage.setItem(migKey, "1");
  }, [sessionReady, bank.loading, bank.fetchComplete, incomeStreams, expenseItems, personas, setPersonas]);

  const liveFinances = useMemo(() => {
    const { grossScaled, net } = totalMonthlyNetIncomeStockholm(incomeStreams);
    const expenses = totalMonthlyExpenses(expenseItems);
    const surplus = Math.round(net - expenses);
    const runway = surplus > 0 && startingBalanceSek > 0
      ? Math.round(startingBalanceSek / surplus)
      : surplus <= 0 && startingBalanceSek > 0
        ? Math.round(startingBalanceSek / Math.abs(surplus || 1))
        : 0;
    return { grossScaled, net, expenses, surplus, runway };
  }, [incomeStreams, expenseItems, startingBalanceSek]);

  const projectedBuffer = startingBalanceSek - Number(simAmount || "0");
  const threeMonthFloor = liveFinances.expenses * 3;
  const canAfford = projectedBuffer > threeMonthFloor;

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  const fmt = (n: number) => Math.round(n).toLocaleString(numberLocale);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-screen bg-background">
        <header className="border-b border-border">
          <div className="container flex h-14 items-center justify-between gap-2">
            <h1 className="text-base font-semibold">{t("common.title")}</h1>
            <div className="flex items-center gap-2">
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {user.displayName}
              </span>
              <SettingsDialog
                startingBalanceSek={startingBalanceSek} onStartingBalanceChange={setStartingBalanceSek}
                sgiAnnual={mySgi}
                onSgiChange={(v) => user && personaSettings.upsert(user.userKey, { sgiAnnual: v })}
                fullTimeGross={myFullTimeGross}
                onFullTimeGrossChange={(v) => user && personaSettings.upsert(user.userKey, { fullTimeGross: v })}
              />
              <Badge variant="secondary" className="text-[10px]">{t("common.badge")}</Badge>
            </div>
          </div>
        </header>

        <main className="container py-4">
          {bank.loading ? (
            <div className="flex items-center justify-center py-20">
              <p className="text-sm text-muted-foreground">Loading bank data…</p>
            </div>
          ) : bank.error ? (
            <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
              Failed to load bank data: {bank.error}
            </div>
          ) : (
            <Tabs defaultValue="dashboard" className="space-y-4">
              <TabsList className="grid h-auto w-full grid-cols-2 gap-1.5 p-1 sm:grid-cols-4">
                <TabsTrigger value="dashboard">{t("nav.dashboard")}</TabsTrigger>
                <TabsTrigger value="goals">{t("nav.goals")}</TabsTrigger>
                <TabsTrigger value="transactions">{t("nav.transactions")}</TabsTrigger>
                <TabsTrigger value="scenarios">{t("nav.scenarios")}</TabsTrigger>
              </TabsList>

              <TabsContent value="dashboard" className="space-y-4">
                <Card>
                  <CardHeader className="flex flex-row items-center gap-2 pb-2">
                    <CardTitle className="text-base">{t("chart.title")}</CardTitle>
                    <InfoTip text={t("chart.titleTip")} />
                  </CardHeader>
                  <CardContent>
                    <CashflowTrajectoryChart data={bank.balanceHistory} />
                  </CardContent>
                </Card>

                <div className="flex flex-wrap gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{t("household.summaryTitle")}</span>
                  <span>{t("household.summaryGrossNet", { gross: fmt(liveFinances.grossScaled), net: fmt(liveFinances.net), currency: t("common.currency") })}</span>
                  <span>{t("household.summaryExpenses", { amount: fmt(liveFinances.expenses), currency: t("common.currency") })}</span>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid grid-cols-3 gap-3">
                    <Card>
                      <CardContent className="p-3">
                        <p className="text-[11px] text-muted-foreground">{t("dashboard.netIncome")}</p>
                        <p className="text-sm font-semibold">
                          {fmt(liveFinances.net)} {t("common.currency")}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-3">
                        <p className="text-[11px] text-muted-foreground">{t("dashboard.surplus")}</p>
                        <p className={`text-sm font-semibold ${liveFinances.surplus >= 0 ? "text-finance-income" : "text-finance-expense"}`}>
                          {fmt(liveFinances.surplus)} {t("common.currency")}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-3">
                        <p className="text-[11px] text-muted-foreground">{t("dashboard.runway")}</p>
                        <p className="text-sm font-semibold text-finance-runway">
                          {liveFinances.runway} {t("common.months")}
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader className="flex flex-row items-center gap-2 pb-2">
                      <CardTitle className="text-sm">{t("dashboard.simulateTitle")}</CardTitle>
                      <InfoTip text={t("dashboard.simulateTip")} />
                    </CardHeader>
                    <CardContent className="flex flex-wrap items-end gap-2">
                      <Input className="h-8 w-28" value={simAmount} onChange={(e) => setSimAmount(e.target.value)} />
                      <Select value={simType} onValueChange={(v: "one-off" | "recurring") => setSimType(v)}>
                        <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="one-off">{t("dashboard.oneOff")}</SelectItem>
                          <SelectItem value="recurring">{t("dashboard.recurring")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button size="sm">{t("dashboard.runCanAfford")}</Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>{canAfford ? t("dashboard.affordable") : t("dashboard.blocked")}</DialogTitle>
                            <DialogDescription>
                              {t("dashboard.bufferAfter", {
                                type: simType, currency: t("common.currency"),
                                amount: fmt(projectedBuffer), floor: fmt(Math.round(threeMonthFloor)),
                              })}
                            </DialogDescription>
                          </DialogHeader>
                        </DialogContent>
                      </Dialog>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                  <RealBalancesCard accounts={bank.accounts} currentUserKey={user.userKey} />
                  <HouseholdPersonasBoard
                    personas={personas} onPersonasChange={setPersonas}
                    streams={incomeStreams} onStreamsChange={setIncomeStreams}
                    expenses={expenseItems} onExpensesChange={setExpenseItems}
                    importedRecurringFromCsv={bank.recurring.hasData}
                    personaSettings={personaSettings.settings}
                  />
                </div>
              </TabsContent>

              <TabsContent value="goals">
                <GoalsTab />
              </TabsContent>

              <TabsContent value="transactions">
                <TransactionsTab transactions={bank.allTransactions} />
              </TabsContent>

              <TabsContent value="scenarios">
                <ScenariosTab
                  incomeStreams={incomeStreams} expenses={expenseItems}
                  startingBalanceSek={startingBalanceSek}
                  personas={personas}
                  personaSettings={personaSettings.settings}
                />
              </TabsContent>
            </Tabs>
          )}
        </main>
      </div>
    </TooltipProvider>
  );
}
