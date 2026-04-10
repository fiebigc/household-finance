import { useCallback, useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronDown, ChevronRight, Copy, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { useI18n } from "@/i18n/I18nContext";
import type { ExpenseItem, IncomeStream, Persona, PersonaWorkParams } from "@/lib/cashflow";
import { DEFAULT_WORK_PARAMS, effectiveMonthlyGross, totalMonthlyExpenses, totalMonthlyNetIncomeStockholm } from "@/lib/cashflow";
import { computeBenefitBreakdown } from "@/lib/swedishBenefits2026";
import { stockholmTabellMonthlyNetFromMonthlyGrossCombined } from "@/lib/swedenStockholmTax";
import type { PersonaSetting } from "@/hooks/usePersonaSettings";

// ─── Types ──────────────────────────────────────────────────────────
type PhaseWorkParams = PersonaWorkParams & { extraExpenseSek: number };

type ScenarioPhase = {
  id: string;
  label: string;
  durationMonths: number;
  params: Record<string, PhaseWorkParams>; // keyed by persona.id
};

type TimelineScenario = {
  id: string;
  name: string;
  phases: ScenarioPhase[];
};

// ─── Persistence ────────────────────────────────────────────────────
const STORAGE_KEY = "finance-scenarios-v2";

function load(): TimelineScenario[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TimelineScenario[]) : [];
  } catch { return []; }
}
function persist(s: TimelineScenario[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

// ─── Helpers ────────────────────────────────────────────────────────
function defaultPhaseParams(personas: Persona[]): Record<string, PhaseWorkParams> {
  const rec: Record<string, PhaseWorkParams> = {};
  for (const p of personas) {
    if (p.type !== "person") continue;
    rec[p.id] = { ...p.workParams, extraExpenseSek: 0 };
  }
  return rec;
}

function monthLabel(offset: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return d.toLocaleDateString("en", { month: "short", year: "2-digit" });
}

const BENEFIT_RE = /\b(fkassa|a[\s-]?kassa|sk\d+)\b/i;

function computeMonthlyNet(
  personas: Persona[],
  pSettings: Map<string, PersonaSetting>,
  overrides: Record<string, PhaseWorkParams>,
  baseExpenses: number,
  incomeStreams: IncomeStream[],
): { gross: number; net: number; expenses: number } {
  let totalExtra = 0;
  const modelledPersonaIds = new Set<string>();

  const personaGross = new Map<string | null, number>();

  for (const p of personas) {
    if (p.type !== "person") continue;
    const wp = overrides[p.id];
    if (!wp) continue;
    const setting = pSettings.get(p.id);
    const sgi = setting?.sgiAnnual ?? 0;
    const ftGross = setting?.fullTimeGross ?? 0;

    if (sgi > 0 || ftGross > 0) {
      modelledPersonaIds.add(p.id);
      const bd = computeBenefitBreakdown({
        sgiAnnual: sgi,
        fullTimeMonthlyGross: ftGross,
        workHoursPerWeek: wp.workHoursPerWeek,
        parentalLeavePercent: wp.parentalLeavePercent,
        akassaPercent: wp.akassaPercent,
        startaEgetPercent: wp.startaEgetPercent,
        daycareChildren: wp.daycareChildren,
      });
      personaGross.set(p.id, (personaGross.get(p.id) ?? 0) + bd.totalGross);
      totalExtra += wp.extraExpenseSek + bd.daycareCost;
    }
  }

  for (const s of incomeStreams) {
    if (s.personaId && modelledPersonaIds.has(s.personaId) && BENEFIT_RE.test(s.label)) continue;
    const g = effectiveMonthlyGross(s);
    const key = s.personaId ?? "__unassigned__";
    personaGross.set(key, (personaGross.get(key) ?? 0) + g);
  }

  let totalNet = 0;
  for (const [, gross] of personaGross) {
    totalNet += stockholmTabellMonthlyNetFromMonthlyGrossCombined(gross);
  }
  const totalGross = [...personaGross.values()].reduce((a, b) => a + b, 0);
  return { gross: totalGross, net: totalNet, expenses: baseExpenses + totalExtra };
}

type ChartPoint = {
  label: string;
  month: number;
  balance: number;
  surplus: number;
  net: number;
  expenses: number;
};

function projectTimeline(
  scenarios: TimelineScenario[],
  personas: Persona[],
  pSettings: Map<string, PersonaSetting>,
  baseExpenses: number,
  startingBalance: number,
  currentParams: Record<string, PhaseWorkParams>,
  incomeStreams: IncomeStream[],
): Map<string, ChartPoint[]> {
  const result = new Map<string, ChartPoint[]>();

  const currentLine = computeMonthlyNet(personas, pSettings, currentParams, baseExpenses, incomeStreams);
  const baselinePts: ChartPoint[] = [];
  let bal = startingBalance;
  for (let m = 0; m < 24; m++) {
    const surplus = currentLine.net - currentLine.expenses;
    bal += surplus;
    baselinePts.push({
      label: monthLabel(m + 1),
      month: m + 1,
      balance: Math.round(bal),
      surplus: Math.round(surplus),
      net: Math.round(currentLine.net),
      expenses: Math.round(currentLine.expenses),
    });
  }
  result.set("__baseline__", baselinePts);

  for (const sc of scenarios) {
    const pts: ChartPoint[] = [];
    let b = startingBalance;
    let monthCursor = 0;

    for (const phase of sc.phases) {
      const line = computeMonthlyNet(personas, pSettings, phase.params, baseExpenses, incomeStreams);
      for (let m = 0; m < phase.durationMonths; m++) {
        monthCursor++;
        const surplus = line.net - line.expenses;
        b += surplus;
        pts.push({
          label: monthLabel(monthCursor),
          month: monthCursor,
          balance: Math.round(b),
          surplus: Math.round(surplus),
          net: Math.round(line.net),
          expenses: Math.round(line.expenses),
        });
      }
    }

    const remaining = 24 - monthCursor;
    if (remaining > 0 && sc.phases.length > 0) {
      const lastPhase = sc.phases[sc.phases.length - 1]!;
      const line = computeMonthlyNet(personas, pSettings, lastPhase.params, baseExpenses, incomeStreams);
      for (let m = 0; m < remaining; m++) {
        monthCursor++;
        const surplus = line.net - line.expenses;
        b += surplus;
        pts.push({
          label: monthLabel(monthCursor),
          month: monthCursor,
          balance: Math.round(b),
          surplus: Math.round(surplus),
          net: Math.round(line.net),
          expenses: Math.round(line.expenses),
        });
      }
    }

    result.set(sc.id, pts);
  }

  return result;
}

// ─── Slider row (reused from HouseholdPersonasBoard) ────────────────
function SliderRow({ label, value, min, max, step, unit, onChange }: {
  label: string; value: number; min: number; max: number; step: number; unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 text-[10px] text-muted-foreground">{label}</span>
      <Slider className="flex-1" min={min} max={max} step={step} value={[value]}
        onValueChange={([v]) => onChange(v)} />
      <div className="flex w-16 items-center gap-0.5">
        <Input className="h-5 w-12 px-1 text-[10px] tabular-nums" inputMode="numeric"
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isNaN(n)) onChange(Math.min(max, Math.max(min, n)));
          }} />
        <span className="text-[9px] text-muted-foreground">{unit}</span>
      </div>
    </div>
  );
}

// ─── Phase editor for one persona ───────────────────────────────────
function PhasePersonaEditor({ persona, params, onChange, numberLocale, pSetting }: {
  persona: Persona;
  params: PhaseWorkParams;
  onChange: (p: PhaseWorkParams) => void;
  numberLocale: string;
  pSetting?: PersonaSetting;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const sgi = pSetting?.sgiAnnual ?? 0;
  const ftGross = pSetting?.fullTimeGross ?? 0;
  const hasSgi = sgi > 0 || ftGross > 0;

  const breakdown = hasSgi
    ? computeBenefitBreakdown({
      sgiAnnual: sgi,
      fullTimeMonthlyGross: ftGross,
      workHoursPerWeek: params.workHoursPerWeek,
      parentalLeavePercent: params.parentalLeavePercent,
      akassaPercent: params.akassaPercent,
      startaEgetPercent: params.startaEgetPercent,
      daycareChildren: params.daycareChildren,
    })
    : null;

  const net = breakdown
    ? stockholmTabellMonthlyNetFromMonthlyGrossCombined(breakdown.totalGross)
    : 0;

  return (
    <div className="rounded border border-border/40 bg-muted/20 p-2">
      <button type="button" className="flex w-full items-center gap-1 text-left"
        onClick={() => setOpen(!open)}>
        {open ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
        <span className="flex-1 text-xs font-medium">{persona.name}</span>
        {breakdown && (
          <span className="text-[10px] tabular-nums text-green-700 dark:text-green-400">
            {Math.round(net).toLocaleString(numberLocale)} {t("common.currency")}/mo net
          </span>
        )}
      </button>
      {open && (
        <div className="mt-2 space-y-1.5">
          <SliderRow label={t("workParams.workHours")} value={params.workHoursPerWeek}
            min={0} max={40} step={1} unit={t("workParams.hWeek")}
            onChange={(v) => onChange({ ...params, workHoursPerWeek: v })} />
          <SliderRow label={t("workParams.parentalLeave")} value={params.parentalLeavePercent}
            min={0} max={100} step={5} unit="%"
            onChange={(v) => onChange({ ...params, parentalLeavePercent: v })} />
          <SliderRow label={t("workParams.akassa")} value={params.akassaPercent}
            min={0} max={100} step={5} unit="%"
            onChange={(v) => onChange({ ...params, akassaPercent: v })} />
          <SliderRow label={t("workParams.startaEget")} value={params.startaEgetPercent}
            min={0} max={100} step={5} unit="%"
            onChange={(v) => onChange({ ...params, startaEgetPercent: v })} />
          <SliderRow label={t("workParams.daycare")} value={params.daycareChildren}
            min={0} max={5} step={1} unit={t("workParams.children")}
            onChange={(v) => onChange({ ...params, daycareChildren: v })} />
          <SliderRow label={t("scenarios.extraExpense")} value={params.extraExpenseSek}
            min={0} max={30000} step={500} unit={t("common.currency")}
            onChange={(v) => onChange({ ...params, extraExpenseSek: v })} />

          {breakdown && (
            <div className="mt-1 space-y-0.5 border-t border-border/30 pt-1">
              <div className="flex justify-between text-[9px]">
                <span className="text-muted-foreground">{t("scenarios.grossIncome")}</span>
                <span className="tabular-nums font-medium">
                  {Math.round(breakdown.totalGross).toLocaleString(numberLocale)} {t("common.currency")}
                </span>
              </div>
              <div className="flex justify-between text-[9px]">
                <span className="text-muted-foreground">{t("scenarios.netIncome")}</span>
                <span className="tabular-nums font-medium text-green-700 dark:text-green-400">
                  {Math.round(net).toLocaleString(numberLocale)} {t("common.currency")}
                </span>
              </div>
              {breakdown.daycareCost > 0 && (
                <div className="flex justify-between text-[9px]">
                  <span className="text-muted-foreground">{t("workParams.daycare")}</span>
                  <span className="tabular-nums font-medium text-red-600 dark:text-red-400">
                    -{Math.round(breakdown.daycareCost).toLocaleString(numberLocale)} {t("common.currency")}
                  </span>
                </div>
              )}
            </div>
          )}
          {!hasSgi && (
            <p className="text-[9px] italic text-muted-foreground">{t("workParams.noSgi")}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Single phase card ──────────────────────────────────────────────
function PhaseCard({ phase, index, personas, pSettings, onUpdate, onRemove, numberLocale }: {
  phase: ScenarioPhase;
  index: number;
  personas: Persona[];
  pSettings: Map<string, PersonaSetting>;
  onUpdate: (p: ScenarioPhase) => void;
  onRemove: () => void;
  numberLocale: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(index === 0);

  return (
    <div className="rounded-lg border border-border/60 bg-background/60 p-2.5">
      <div className="flex items-center gap-2">
        <button type="button" className="text-muted-foreground" onClick={() => setOpen(!open)}>
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <span className="text-[10px] font-semibold text-muted-foreground shrink-0">
          {t("scenarios.phase")} {index + 1}
        </span>
        <Input className="h-7 flex-1 text-xs" value={phase.label}
          placeholder={t("scenarios.phaseName")}
          onChange={(e) => onUpdate({ ...phase, label: e.target.value })} />
        <div className="flex items-center gap-1">
          <Input className="h-7 w-14 text-xs text-center tabular-nums" inputMode="numeric"
            value={phase.durationMonths}
            onChange={(e) => onUpdate({ ...phase, durationMonths: Math.max(1, Math.min(36, Number(e.target.value) || 1)) })} />
          <span className="text-[10px] text-muted-foreground">{t("common.months")}</span>
        </div>
        <Button size="sm" variant="ghost" className="h-7 w-7 shrink-0 p-0" onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </div>
      {open && (
        <div className="mt-2 space-y-2">
          {personas.filter((p) => p.type === "person").map((p) => (
            <PhasePersonaEditor
              key={p.id}
              persona={p}
              params={phase.params[p.id] ?? { ...DEFAULT_WORK_PARAMS, extraExpenseSek: 0 }}
              pSetting={pSettings.get(p.id)}
              numberLocale={numberLocale}
              onChange={(wp) => onUpdate({
                ...phase,
                params: { ...phase.params, [p.id]: wp },
              })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Scenario colors ────────────────────────────────────────────────
const COLORS = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c"];

// ─── Main component ─────────────────────────────────────────────────
type Props = {
  incomeStreams: IncomeStream[];
  expenses: ExpenseItem[];
  startingBalanceSek: number;
  personas: Persona[];
  personaSettings: Map<string, PersonaSetting>;
};

export function ScenariosTab({ incomeStreams, expenses, startingBalanceSek, personas, personaSettings }: Props) {
  const { t, numberLocale } = useI18n();
  const [scenarios, setScenarios] = useState<TimelineScenario[]>(load);

  const update = useCallback((next: TimelineScenario[]) => {
    setScenarios(next);
    persist(next);
  }, []);

  const currentParams = useMemo(() => defaultPhaseParams(personas), [personas]);
  const baseExpenses = totalMonthlyExpenses(expenses);

  const addScenario = () => {
    const sc: TimelineScenario = {
      id: crypto.randomUUID(),
      name: "",
      phases: [{
        id: crypto.randomUUID(),
        label: "",
        durationMonths: 6,
        params: defaultPhaseParams(personas),
      }],
    };
    update([...scenarios, sc]);
  };

  const removeScenario = (id: string) => update(scenarios.filter((s) => s.id !== id));

  const patchScenario = (id: string, patch: Partial<TimelineScenario>) =>
    update(scenarios.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const addPhase = (scenarioId: string) => {
    const sc = scenarios.find((s) => s.id === scenarioId);
    if (!sc) return;
    const lastPhase = sc.phases[sc.phases.length - 1];
    const newPhase: ScenarioPhase = {
      id: crypto.randomUUID(),
      label: "",
      durationMonths: 6,
      params: lastPhase ? structuredClone(lastPhase.params) : defaultPhaseParams(personas),
    };
    patchScenario(scenarioId, { phases: [...sc.phases, newPhase] });
  };

  const duplicateScenario = (id: string) => {
    const src = scenarios.find((s) => s.id === id);
    if (!src) return;
    const dup: TimelineScenario = {
      ...structuredClone(src),
      id: crypto.randomUUID(),
      name: `${src.name} (copy)`,
      phases: src.phases.map((p) => ({ ...structuredClone(p), id: crypto.randomUUID() })),
    };
    update([...scenarios, dup]);
  };

  const projected = useMemo(
    () => projectTimeline(scenarios, personas, personaSettings, baseExpenses, startingBalanceSek, currentParams, incomeStreams),
    [scenarios, personas, personaSettings, baseExpenses, startingBalanceSek, currentParams, incomeStreams],
  );

  const fmt = (n: number) => Math.round(n).toLocaleString(numberLocale);
  const baseline = projected.get("__baseline__") ?? [];

  const chartData = useMemo(() => {
    if (baseline.length === 0) return [];
    return baseline.map((bp, i) => {
      const row: Record<string, string | number> = {
        label: bp.label,
        month: bp.month,
        baseline: bp.balance,
      };
      for (const sc of scenarios) {
        const pts = projected.get(sc.id);
        if (pts && pts[i]) row[sc.id] = pts[i]!.balance;
      }
      return row;
    });
  }, [baseline, scenarios, projected]);

  const currentLine = useMemo(
    () => computeMonthlyNet(personas, personaSettings, currentParams, baseExpenses, incomeStreams),
    [personas, personaSettings, currentParams, baseExpenses, incomeStreams],
  );

  return (
    <div className="space-y-4">
      {/* Projection chart */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-3 pb-3">
          <CardTitle className="text-base">{t("scenarios.projectionTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ fontSize: 11 }}
                  formatter={(value: number, name: string) => {
                    const label = name === "baseline"
                      ? t("scenarios.baseline")
                      : scenarios.find((s) => s.id === name)?.name || t("scenarios.unnamed");
                    return [fmt(value) + " " + t("common.currency"), label];
                  }}
                />
                <Legend
                  formatter={(value: string) =>
                    value === "baseline"
                      ? t("scenarios.baseline")
                      : scenarios.find((s) => s.id === value)?.name || t("scenarios.unnamed")
                  }
                  wrapperStyle={{ fontSize: 11 }}
                />
                <ReferenceLine y={0} stroke="#aaa" strokeDasharray="3 3" />
                <Area
                  type="monotone" dataKey="baseline"
                  fill="#6b7280" fillOpacity={0.06} stroke="#6b7280"
                  strokeWidth={2} strokeDasharray="6 3" dot={false}
                />
                {scenarios.map((sc, i) => (
                  <Line
                    key={sc.id} type="monotone" dataKey={sc.id}
                    stroke={COLORS[i % COLORS.length]}
                    strokeWidth={2} dot={false}
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("scenarios.noProjection")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Current situation summary */}
      <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
        <p className="mb-1 text-xs font-medium">{t("scenarios.currentSituation")}</p>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
          <span>{t("scenarios.netIncome")}: <strong className="text-foreground">{fmt(currentLine.net)}</strong> {t("common.currency")}</span>
          <span>{t("scenarios.totalExpenses")}: <strong className="text-foreground">{fmt(currentLine.expenses)}</strong> {t("common.currency")}</span>
          <span className={currentLine.net - currentLine.expenses >= 0 ? "text-finance-income" : "text-finance-expense"}>
            {t("scenarios.surplus")}: <strong>{fmt(currentLine.net - currentLine.expenses)}</strong> {t("common.currency")}
          </span>
          <span>{t("scenarios.buffer")}: <strong className="text-foreground">{fmt(startingBalanceSek)}</strong> {t("common.currency")}</span>
          {personas.filter((p) => p.type === "person").map((p) => {
            const wp = p.workParams;
            const parts: string[] = [];
            if (wp.workHoursPerWeek > 0) parts.push(`${wp.workHoursPerWeek}h ${t("workParams.employment").toLowerCase()}`);
            if (wp.parentalLeavePercent > 0) parts.push(`${wp.parentalLeavePercent}% ${t("workParams.parentalLeave").toLowerCase()}`);
            if (wp.akassaPercent > 0) parts.push(`${wp.akassaPercent}% ${t("workParams.akassa").toLowerCase()}`);
            if (wp.startaEgetPercent > 0) parts.push(`${wp.startaEgetPercent}% ${t("workParams.startaEget").toLowerCase()}`);
            if (parts.length === 0) return null;
            return (
              <span key={p.id} className="text-foreground/70">
                {p.name}: {parts.join(", ")}
              </span>
            );
          })}
        </div>
      </div>

      {/* Scenario list */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-3 pb-3">
          <CardTitle className="text-base">{t("scenarios.title")}</CardTitle>
          <Button size="sm" variant="outline" className="ml-auto h-7 gap-1 text-xs" onClick={addScenario}>
            <Plus className="h-3.5 w-3.5" /> {t("scenarios.add")}
          </Button>
        </CardHeader>
        <CardContent>
          {scenarios.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("scenarios.empty")}</p>
          ) : (
            <div className="space-y-4">
              {scenarios.map((sc, scIdx) => {
                const scPts = projected.get(sc.id) ?? [];
                const endBal = scPts.length > 0 ? scPts[scPts.length - 1]!.balance : startingBalanceSek;
                const baseBal = baseline.length > 0 ? baseline[baseline.length - 1]!.balance : startingBalanceSek;
                const diff = endBal - baseBal;

                return (
                  <div key={sc.id} className="rounded-lg border p-3 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: COLORS[scIdx % COLORS.length] }} />
                      <Input className="h-8 flex-1 text-sm font-medium"
                        placeholder={t("scenarios.namePlaceholder")}
                        value={sc.name}
                        onChange={(e) => patchScenario(sc.id, { name: e.target.value })} />
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Duplicate"
                        onClick={() => duplicateScenario(sc.id)}>
                        <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                        onClick={() => removeScenario(sc.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </div>

                    {/* Summary */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                      <span>
                        {t("scenarios.endBalance")}: <strong className="text-foreground">{fmt(endBal)}</strong> {t("common.currency")}
                      </span>
                      <span className={diff >= 0 ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                        {diff >= 0 ? "+" : ""}{fmt(diff)} vs {t("scenarios.baseline").toLowerCase()}
                      </span>
                    </div>

                    {/* Phases */}
                    <div className="space-y-2">
                      {sc.phases.map((phase, phIdx) => (
                        <PhaseCard
                          key={phase.id}
                          phase={phase}
                          index={phIdx}
                          personas={personas}
                          pSettings={personaSettings}
                          numberLocale={numberLocale}
                          onUpdate={(p) => {
                            const newPhases = [...sc.phases];
                            newPhases[phIdx] = p;
                            patchScenario(sc.id, { phases: newPhases });
                          }}
                          onRemove={() => {
                            if (sc.phases.length <= 1) return;
                            patchScenario(sc.id, { phases: sc.phases.filter((_, i) => i !== phIdx) });
                          }}
                        />
                      ))}
                      <Button size="sm" variant="outline" className="h-7 gap-1 text-xs w-full"
                        onClick={() => addPhase(sc.id)}>
                        <Plus className="h-3 w-3" /> {t("scenarios.addPhase")}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
