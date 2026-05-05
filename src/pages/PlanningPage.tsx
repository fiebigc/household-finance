import { useState, useMemo, useEffect } from "react";
import { BentoGrid, type BentoCardDefinition } from "@/components/BentoGrid";
import { Card } from "@/components/ui/BentoCard";
import { useAppStore } from "@/stores/appStore";
import { useBackend } from "@/hooks/useBackend";
import { useHouseholdCardValues } from "@/hooks/useHouseholdCardValues";
import type { ParentalLeaveCardRow } from "@/stores/cardValuesStore";
import { useProjection } from "@/hooks/useProjection";
import { CardNumericFieldsDialog, type CardNumericFieldDef } from "@/components/CardNumericFieldsDialog";
import type { Entity, Period, PeriodType, WeeklyPattern } from "@/types/schema";
import { GaugeCard } from "@/components/GaugeCard";
import { UnemploymentBenefitsCard } from "@/components/UnemploymentBenefitsCard";
import { mergeParentalLeavePlanningRow, type ParentalLeavePlanningDisplay } from "@/utils/parentalLeavePlanning";
import { resolveEntityAnnualSgiForBenefits, swedishSgiBenefitLevelFieldHint } from "@/utils/swedenSgi";
import { getParentalLeaveBenefitLevelLabel } from "@/utils/parentalLeaveBenefitLevel";
import { estimatedForaldrapenningDailySek } from "@/utils/swedenInsuranceBenefits";
import { compareOverlappingPeriodsForMonth } from "@/utils/periodResolution";
import { formatSEK } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  CalendarDays, Baby, Briefcase, Clock, Plus, X, TrendingUp,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
} from "lucide-react";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, getDay,
  addMonths, subMonths, addYears, subYears, isToday,
} from "date-fns";
import { useTranslation } from "react-i18next";

type BentoRender = Parameters<BentoCardDefinition["render"]>[0];

const PERIOD_TYPES: { value: PeriodType; label: string }[] = [
  { value: "employed", label: "Employed" },
  { value: "self_employed", label: "Self-employed" },
  { value: "parental_leave", label: "Parental leave" },
  { value: "unemployed", label: "Unemployed" },
  { value: "sick_leave", label: "Sick leave" },
  { value: "unpaid_leave", label: "Unpaid leave" },
  { value: "daycare", label: "Daycare" },
  { value: "home", label: "Home" },
  { value: "school", label: "School" },
  { value: "preschool", label: "Preschool" },
];

const periodTypeColors: Record<string, string> = {
  employed: "bg-blue-500/20 text-blue-700 border-blue-300",
  self_employed: "bg-indigo-500/20 text-indigo-700 border-indigo-300",
  parental_leave: "bg-pink-500/20 text-pink-700 border-pink-300",
  unemployed: "bg-orange-500/20 text-orange-700 border-orange-300",
  daycare: "bg-green-500/20 text-green-700 border-green-300",
  home: "bg-gray-500/20 text-gray-600 border-gray-300",
  sick_leave: "bg-red-500/20 text-red-700 border-red-300",
  unpaid_leave: "bg-yellow-500/20 text-yellow-700 border-yellow-300",
  school: "bg-teal-500/20 text-teal-700 border-teal-300",
  preschool: "bg-emerald-500/20 text-emerald-700 border-emerald-300",
};

const periodDotColors: Record<string, string> = {
  employed: "bg-blue-500",
  self_employed: "bg-indigo-500",
  parental_leave: "bg-pink-500",
  unemployed: "bg-orange-500",
  daycare: "bg-green-500",
  home: "bg-gray-400",
  sick_leave: "bg-red-500",
  unpaid_leave: "bg-yellow-500",
  school: "bg-teal-500",
  preschool: "bg-emerald-500",
};

const WEEKDAY_KEYS: (keyof WeeklyPattern)[] = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
];
const WEEKDAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const DEFAULT_WEEKLY_PATTERN: WeeklyPattern = {
  monday: true, tuesday: true, wednesday: true, thursday: true, friday: true,
  saturday: false, sunday: false,
};

/** No weekdays marked active — projection treats employment FTE as 0 for parental leave (full föräldrapenning days). */
const PARENTAL_LEAVE_NO_WORK_WEEK_PATTERN: WeeklyPattern = {
  monday: false,
  tuesday: false,
  wednesday: false,
  thursday: false,
  friday: false,
  saturday: false,
  sunday: false,
};

function formatWeeklyPatternShort(wp: WeeklyPattern): string {
  return WEEKDAY_KEYS
    .filter((k) => wp[k])
    .map((k) => WEEKDAY_LABELS[WEEKDAY_KEYS.indexOf(k)])
    .join(" ");
}

function WeeklyPatternToggle({
  pattern,
  onChange,
}: {
  pattern: WeeklyPattern;
  onChange: (wp: WeeklyPattern) => void;
}) {
  return (
    <div className="flex gap-1">
      {WEEKDAY_KEYS.map((key, i) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange({ ...pattern, [key]: !pattern[key] })}
          className={cn(
            "w-7 h-7 text-[10px] font-medium rounded-md border transition-colors",
            pattern[key]
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background text-muted-foreground border-border hover:bg-muted/50",
          )}
        >
          {WEEKDAY_LABELS[i]}
        </button>
      ))}
    </div>
  );
}

/** Map JS getDay() (0=Sun) to a WeeklyPattern key. */
const JS_DOW_TO_KEY: (keyof WeeklyPattern)[] = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
];

function periodEffectiveOnCalendarDay(p: Period, dow: number): boolean {
  if (!p.weekly_pattern) return true;
  return !!p.weekly_pattern[JS_DOW_TO_KEY[dow]];
}

function sortPeriodsForCalendarDayCell(a: Period, b: Period, entityList: Entity[]): number {
  const na = entityList.find(e => e.id === a.entity_id)?.name ?? "";
  const nb = entityList.find(e => e.id === b.entity_id)?.name ?? "";
  if (na !== nb) return na.localeCompare(nb, undefined, { sensitivity: "base" });
  if (a.date_from !== b.date_from) return a.date_from.localeCompare(b.date_from);
  return a.id.localeCompare(b.id);
}

// ─── Calendar Card ──────────────────────────────────────────────────────────────

function CalendarCardContent() {
  const { entities, periods, refresh } = useAppStore();
  const backend = useBackend();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedEntity, setSelectedEntity] = useState<string | "all">("all");
  const [addingPeriod, setAddingPeriod] = useState(false);
  const [newType, setNewType] = useState<PeriodType>("employed");
  const [newEntityId, setNewEntityId] = useState("");
  const [newFrom, setNewFrom] = useState("");
  const [newTo, setNewTo] = useState("");
  const [newFte, setNewFte] = useState("100");
  const [newWeekly, setNewWeekly] = useState<WeeklyPattern>({ ...DEFAULT_WEEKLY_PATTERN });
  const [useWeeklyPattern, setUseWeeklyPattern] = useState(false);
  const [busy, setBusy] = useState(false);
  const [periodFormError, setPeriodFormError] = useState<string | null>(null);

  useEffect(() => {
    if (newType === "parental_leave") {
      setNewFte("0");
      setNewWeekly({ ...PARENTAL_LEAVE_NO_WORK_WEEK_PATTERN });
    } else if (newType === "employed" || newType === "self_employed") {
      setNewFte("100");
      setNewWeekly({ ...DEFAULT_WEEKLY_PATTERN });
    }
  }, [newType]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDow = (getDay(monthStart) + 6) % 7;

  const adults = entities.filter(e => e.type === "adult");

  const activePeriods = periods.filter(p => {
    if (selectedEntity !== "all" && p.entity_id !== selectedEntity) return false;
    const from = new Date(p.date_from);
    const to = p.date_to ? new Date(p.date_to) : new Date("2099-12-31");
    return from <= monthEnd && to >= monthStart;
  });

  const handleAddPeriod = async () => {
    if (!newEntityId || !newFrom) return;
    if (newTo && newTo < newFrom) {
      setPeriodFormError("End date must be on or after start date.");
      return;
    }
    setPeriodFormError(null);
    setBusy(true);
    try {
      await backend.upsertPeriod({
        id: crypto.randomUUID(),
        entity_id: newEntityId,
        type: newType,
        date_from: newFrom,
        date_to: newTo || null,
        pct_fte: Number(newFte) || 100,
        weekly_pattern: useWeeklyPattern ? newWeekly : null,
        employer_entity_id: null,
        notes: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        archived_at: null,
      });
      await refresh();
      setAddingPeriod(false);
      setNewFrom("");
      setNewTo("");
      setNewFte("100");
      setUseWeeklyPattern(false);
      setNewWeekly({ ...DEFAULT_WEEKLY_PATTERN });
    } catch (e) {
      console.error("Failed to add period:", e);
    } finally {
      setBusy(false);
    }
  };

  const handleArchivePeriod = async (id: string) => {
    setBusy(true);
    try {
      await backend.archivePeriod(id);
      await refresh();
    } catch (e) {
      console.error("Failed to remove period:", e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Month navigation — any year (historic + future); month picker avoids paging back month-by-month */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center rounded-lg border border-border/60 shrink-0">
            <button
              type="button"
              aria-label="Previous year"
              onClick={() => setCurrentMonth(subYears(currentMonth, 1))}
              className="p-1.5 rounded-l-lg hover:bg-muted transition-colors"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="p-1.5 hover:bg-muted transition-colors border-l border-border/60"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
          <input
            type="month"
            value={format(currentMonth, "yyyy-MM")}
            onChange={e => {
              const v = e.target.value;
              if (!v) return;
              const [y, m] = v.split("-").map(Number);
              if (!Number.isFinite(y) || !Number.isFinite(m)) return;
              setCurrentMonth(startOfMonth(new Date(y, m - 1, 1)));
            }}
            title="Jump to month (past or future)"
            className="min-w-0 flex-1 sm:flex-none px-2 py-1.5 text-sm font-medium rounded-lg bg-background border border-border text-card-foreground"
          />
          <div className="flex items-center rounded-lg border border-border/60 shrink-0">
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="p-1.5 hover:bg-muted transition-colors border-r border-border/60"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label="Next year"
              onClick={() => setCurrentMonth(addYears(currentMonth, 1))}
              className="p-1.5 rounded-r-lg hover:bg-muted transition-colors"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCurrentMonth(startOfMonth(new Date()))}
          className="text-[11px] px-2.5 py-1.5 rounded-lg border border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/50 self-start sm:self-auto"
        >
          This month
        </button>
      </div>

      {/* Entity filter */}
      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={() => setSelectedEntity("all")}
          className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
            selectedEntity === "all" ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground hover:bg-muted"
          }`}
        >
          All
        </button>
        {entities.map(e => (
          <button
            key={e.id}
            onClick={() => setSelectedEntity(e.id)}
            className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
              selectedEntity === e.id ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground hover:bg-muted"
            }`}
          >
            {e.name}
          </button>
        ))}
      </div>

      {/* Calendar grid + detail panel (matching design: calendar left, detail right) */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
        {/* Month grid */}
        <div>
          <div className="grid grid-cols-7 gap-0.5 text-center">
            {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map(d => (
              <div key={d} className="text-[10px] text-muted-foreground font-medium py-1">{d}</div>
            ))}
            {Array.from({ length: startDow }).map((_, i) => (
              <div key={`pad-${i}`} />
            ))}
            {days.map(day => {
              const dayStr = format(day, "yyyy-MM-dd");
              const dow = getDay(day);
              const dayOverlap = activePeriods
                .filter(p => {
                  const to = p.date_to ?? "2099-12-31";
                  return dayStr >= p.date_from && dayStr <= to;
                })
                .sort((a, b) => sortPeriodsForCalendarDayCell(a, b, entities));

              const snaps = dayOverlap.map(p => ({
                period: p,
                activeWeekday: periodEffectiveOnCalendarDay(p, dow),
              }));
              const activeOnWeekday = snaps.filter(s => s.activeWeekday).map(s => s.period);
              const offWeekdayOnly = snaps.length > 0 && activeOnWeekday.length === 0;

              const titleLines =
                snaps.length > 0
                  ? snaps.map(s => {
                      const name = entities.find(e => e.id === s.period.entity_id)?.name ?? "?";
                      const pct = s.period.pct_fte != null ? ` (${s.period.pct_fte}%)` : "";
                      const wd = !s.activeWeekday && s.period.weekly_pattern ? " — off weekday" : "";
                      return `${name}: ${s.period.type.replace(/_/g, " ")}${pct}${wd}`;
                    })
                  : undefined;
              const title = titleLines?.join("\n");

              const single = activeOnWeekday.length === 1 ? activeOnWeekday[0] : null;
              const multi = activeOnWeekday.length > 1;

              const dotRow =
                activeOnWeekday.length > 0 ? (
                  <div className="pointer-events-none flex flex-wrap items-center justify-center gap-px pb-1">
                    {activeOnWeekday.map(p => (
                      <span key={p.id} className={cn("h-1.5 w-1.5 rounded-full", periodDotColors[p.type] ?? "bg-muted")} />
                    ))}
                  </div>
                ) : null;

              if (multi) {
                return (
                  <div
                    key={dayStr}
                    title={title}
                    className={cn(
                      "relative flex aspect-square flex-col overflow-hidden rounded-lg bg-muted/10 text-xs transition-colors",
                      isToday(day) && "ring-2 ring-primary",
                    )}
                  >
                    <div className="flex min-h-[46%] flex-1 shrink-0 divide-x divide-border/30">
                      {activeOnWeekday.map(p => (
                        <div
                          key={p.id}
                          className={cn("min-w-0 flex-1", periodTypeColors[p.type] ?? "bg-muted")}
                        />
                      ))}
                    </div>
                    <div
                      className={cn(
                        "flex flex-1 items-center justify-center",
                        isToday(day) && "font-bold",
                      )}
                    >
                      {day.getDate()}
                    </div>
                    {dotRow}
                  </div>
                );
              }

              if (single) {
                return (
                  <div
                    key={dayStr}
                    title={title ?? undefined}
                    className={cn(
                      "relative flex aspect-square items-center justify-center overflow-hidden rounded-lg text-xs transition-colors",
                      isToday(day) && "ring-2 ring-primary font-bold",
                      periodTypeColors[single.type] ?? "bg-muted",
                    )}
                  >
                    {day.getDate()}
                    <span
                      className={cn(
                        "absolute bottom-0.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full",
                        periodDotColors[single.type] ?? "bg-muted",
                      )}
                    />
                  </div>
                );
              }

              if (offWeekdayOnly) {
                return (
                  <div
                    key={dayStr}
                    title={title}
                    className={cn(
                      "relative flex aspect-square items-center justify-center rounded-lg bg-muted/20 text-xs text-muted-foreground/50 transition-colors",
                      isToday(day) && "ring-2 ring-primary font-bold",
                    )}
                  >
                    {day.getDate()}
                  </div>
                );
              }

              return (
                <div
                  key={dayStr}
                  className={cn(
                    "relative flex aspect-square items-center justify-center rounded-lg text-xs transition-colors hover:bg-muted/50",
                    isToday(day) && "ring-2 ring-primary font-bold",
                  )}
                >
                  {day.getDate()}
                </div>
              );
            })}
          </div>

          {/* Quick month jump */}
          <div className="flex flex-wrap gap-1.5 pt-3">
            {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((m, i) => (
              <button
                key={m}
                onClick={() => {
                  const d = new Date(currentMonth);
                  d.setMonth(i);
                  setCurrentMonth(d);
                }}
                className={`px-2 py-0.5 text-[10px] rounded-lg transition-colors ${
                  currentMonth.getMonth() === i ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted/50"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Detail panel — periods in this month + add form */}
        <div className="space-y-3 border-l border-border/50 pl-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Periods this month</h4>
            <button
              onClick={() => {
                setAddingPeriod(true);
                setPeriodFormError(null);
                if (!newEntityId && adults.length > 0) setNewEntityId(adults[0].id);
                setNewFrom(format(monthStart, "yyyy-MM-dd"));
                setNewTo(format(monthEnd, "yyyy-MM-dd"));
              }}
              className="p-1 rounded-lg hover:bg-muted text-primary"
              title="Add period"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {activePeriods.length === 0 && !addingPeriod && (
            <p className="text-[11px] text-muted-foreground">
              No periods overlapping {format(currentMonth, "MMMM yyyy")}.
            </p>
          )}

          {activePeriods.map(p => {
            const entity = entities.find(e => e.id === p.entity_id);
            return (
              <div key={p.id} className={cn("p-2.5 rounded-lg border text-xs", periodTypeColors[p.type] ?? "bg-muted border-border")}>
                <div className="flex items-start justify-between gap-1">
                  <div>
                    <span className="font-medium capitalize">{p.type.replace(/_/g, " ")}</span>
                    <span className="text-muted-foreground ml-1.5">{entity?.name}</span>
                    {p.pct_fte != null && p.pct_fte !== 100 && (
                      <span className="ml-1.5 font-medium">{p.pct_fte}%</span>
                    )}
                  </div>
                  <button
                    onClick={() => void handleArchivePeriod(p.id)}
                    disabled={busy}
                    className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive shrink-0"
                    title="Remove"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {p.date_from} → {p.date_to ?? "ongoing"}
                </p>
                {p.weekly_pattern && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Days: {formatWeeklyPatternShort(p.weekly_pattern)}
                  </p>
                )}
              </div>
            );
          })}

          {addingPeriod && (
            <div className="p-3 rounded-lg bg-muted/30 border border-border/60 space-y-2">
              <select
                value={newEntityId}
                onChange={e => setNewEntityId(e.target.value)}
                className="w-full px-2 py-1.5 text-xs rounded-lg bg-background border border-border"
              >
                <option value="">Select person…</option>
                {entities.map(e => (
                  <option key={e.id} value={e.id}>{e.name} ({e.type})</option>
                ))}
              </select>
              <select
                value={newType}
                onChange={e => setNewType(e.target.value as PeriodType)}
                className="w-full px-2 py-1.5 text-xs rounded-lg bg-background border border-border"
              >
                {PERIOD_TYPES.map(pt => (
                  <option key={pt.value} value={pt.value}>{pt.label}</option>
                ))}
              </select>
              <p className="text-[10px] text-muted-foreground leading-snug">
                Start and end may be in the <span className="text-card-foreground">past</span> (e.g. former jobs, earlier leave) or the future. Clear end date for open-ended current periods.
              </p>
              {periodFormError && (
                <p className="text-[10px] text-destructive">{periodFormError}</p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground">Start date</label>
                  <input
                    type="date"
                    value={newFrom}
                    onChange={e => {
                      setPeriodFormError(null);
                      setNewFrom(e.target.value);
                    }}
                    className="w-full px-2 py-1.5 text-xs rounded-lg bg-background border border-border"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">End date (optional)</label>
                  <input
                    type="date"
                    value={newTo}
                    min={newFrom || undefined}
                    onChange={e => {
                      setPeriodFormError(null);
                      setNewTo(e.target.value);
                    }}
                    className="w-full px-2 py-1.5 text-xs rounded-lg bg-background border border-border"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">
                  Employment FTE % (paid work time — 0 = full leave for föräldrapenning)
                </label>
                <input type="number" min="0" max="100" value={newFte} onChange={e => setNewFte(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs rounded-lg bg-background border border-border" />
              </div>
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-[10px] text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useWeeklyPattern}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setUseWeeklyPattern(checked);
                      if (checked && newType === "parental_leave") {
                        setNewWeekly({ ...PARENTAL_LEAVE_NO_WORK_WEEK_PATTERN });
                      }
                    }}
                    className="rounded border-border"
                  />
                  Set active weekdays
                </label>
                {useWeeklyPattern && (
                  <WeeklyPatternToggle pattern={newWeekly} onChange={setNewWeekly} />
                )}
              </div>
              <p className="text-[10px] text-muted-foreground leading-snug">
                Modeled föräldrapenning uses <span className="text-card-foreground">(1 − employment FTE) × weekdays</span> this month.
                Leaving FTE at 100% or marking Mon–Fri active makes leave days 0 — a manual FK income ignores that. Use{" "}
                <span className="text-card-foreground">0% FTE</span> (default for new parental leave) or weekdays off unless part-time work.
                Salary cashflows still scale by employment FTE while on leave.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => void handleAddPeriod()}
                  disabled={busy || !newEntityId || !newFrom}
                  className="px-3 py-1.5 text-[10px] rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? "Saving…" : "Add period"}
                </button>
                <button
                  onClick={() => setAddingPeriod(false)}
                  className="px-3 py-1.5 text-[10px] rounded-lg bg-muted text-muted-foreground hover:bg-muted/80"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Period legend */}
      <div className="flex flex-wrap gap-2 pt-1 border-t border-border/40">
        {activePeriods.length > 0 && [...new Set(activePeriods.map(p => p.type))].map(type => (
          <span key={type} className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className={cn("w-2 h-2 rounded-full", periodDotColors[type] ?? "bg-muted")} />
            <span className="capitalize">{type.replace(/_/g, " ")}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Projection Summary Card ────────────────────────────────────────────────────

function ProjectionSummaryCardContent() {
  const { entities } = useAppStore();
  const projection = useProjection(6);
  const adults = entities.filter(e => e.type === "adult");

  if (projection.months.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-8">Add adults and cashflows to see projections</p>;
  }

  const monthLabels = [...new Set(projection.months.map(m => m.month))];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
        <div>
          <p className="text-[10px] text-muted-foreground">Gross (6 mo)</p>
          <p className="text-sm font-bold tabular-nums text-income">{formatSEK(projection.totals.gross_income)}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">Net (6 mo)</p>
          <p className="text-sm font-bold tabular-nums text-income">{formatSEK(projection.totals.net_income)}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">Costs (6 mo)</p>
          <p className="text-sm font-bold tabular-nums text-expense">{formatSEK(projection.totals.total_expenses)}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">Surplus (6 mo)</p>
          <p className={cn("text-sm font-bold tabular-nums", projection.totals.surplus >= 0 ? "text-income" : "text-expense")}>{formatSEK(projection.totals.surplus)}</p>
        </div>
      </div>

      {/* Per-month per-adult breakdown */}
      <div className="overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="text-muted-foreground border-b border-border/40">
              <th className="text-left py-1 pr-2">Month</th>
              {adults.map(a => (
                <th key={a.id} className="text-right py-1 px-1" colSpan={2}>{a.name}</th>
              ))}
            </tr>
            <tr className="text-muted-foreground/70">
              <th />
              {adults.map(a => (
                <><th key={`${a.id}-g`} className="text-right py-0.5 px-1">Gross</th><th key={`${a.id}-n`} className="text-right py-0.5 px-1">Net</th></>
              ))}
            </tr>
          </thead>
          <tbody>
            {monthLabels.map(month => {
              const rows = projection.months.filter(m => m.month === month);
              return (
                <tr key={month} className="border-b border-border/20 hover:bg-muted/20">
                  <td className="py-1 pr-2 font-medium">{month}</td>
                  {adults.map(a => {
                    const row = rows.find(r => r.entity_id === a.id);
                    return (
                      <>
                        <td key={`${a.id}-g`} className="text-right tabular-nums py-1 px-1">{row ? formatSEK(row.gross_income) : "—"}</td>
                        <td key={`${a.id}-n`} className="text-right tabular-nums py-1 px-1 text-income">{row ? formatSEK(row.net_income) : "—"}</td>
                      </>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Planning Activity ──────────────────────────────────────────────────────────

const EMPTY_PARENTAL_MANUAL: ParentalLeaveCardRow = {
  available: 0,
  used: 0,
  adultUsed: {},
  benefitLevel: 0,
};

function maxBenefitLevelFromParentalCards(
  children: Entity[],
  parentalByChild: Record<string, ParentalLeaveCardRow>,
  adults: Entity[],
): number {
  let max = 0;
  for (const child of children) {
    const manual = parentalByChild[child.id] ?? EMPTY_PARENTAL_MANUAL;
    const row = mergeParentalLeavePlanningRow(child, manual, adults);
    if (typeof row.benefitLevel === "number" && row.benefitLevel > max) {
      max = row.benefitLevel;
    }
  }
  return max;
}

function PlanningActivityCardContent() {
  const { entities, periods, household, cashflows } = useAppStore();
  const { values } = useHouseholdCardValues();
  const adults = entities.filter(e => e.type === "adult");
  const children = entities.filter(e => e.type === "child");
  const projection = useProjection(1);
  const benefitBasisLabel = getParentalLeaveBenefitLevelLabel(household?.country);
  const isSE = household?.country?.trim().toUpperCase() === "SE";

  const planningBenefitMax = useMemo(
    () => maxBenefitLevelFromParentalCards(children, values.planning.parentalByChild, adults),
    [children, values.planning.parentalByChild, adults],
  );

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {adults.map(adult => {
          const currentPeriods = periods
            .filter(p => {
              if (p.entity_id !== adult.id) return false;
              const now = new Date().toISOString().slice(0, 10);
              return p.date_from <= now && (!p.date_to || p.date_to >= now);
            })
            .sort(compareOverlappingPeriodsForMonth);
          const mainPeriod = currentPeriods[0];
          const monthRow = projection.months.find(m => m.entity_id === adult.id);
          const fromSgiLogic = resolveEntityAnnualSgiForBenefits(adult, cashflows);
          const annualSgi =
            fromSgiLogic > 0 ? fromSgiLogic : planningBenefitMax > 0 ? planningBenefitMax : 0;
          const onParentalLeave = mainPeriod?.type === "parental_leave";
          const fp = isSE && annualSgi > 0 ? estimatedForaldrapenningDailySek(annualSgi) : null;
          const hasModeledForaldrapenning = monthRow?.income_breakdown.some(
            i =>
              i.cashflow_id.startsWith("benefit:parental_leave:") ||
              i.name === "Föräldrapenning",
          );

          return (
            <div key={adult.id} className="p-2.5 rounded-bento-inner bg-muted/30">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">{adult.name}</span>
                <span className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full capitalize",
                  mainPeriod ? (periodTypeColors[mainPeriod.type] ?? "bg-muted") : "bg-muted text-muted-foreground"
                )}>
                  {mainPeriod?.type.replace(/_/g, " ") ?? "No period"}
                </span>
              </div>
              {mainPeriod?.pct_fte != null && mainPeriod.pct_fte !== 100 && (
                <p className="text-[10px] text-muted-foreground mt-0.5">{mainPeriod.pct_fte}% FTE</p>
              )}
              {isSE && annualSgi > 0 && (
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[10px]">
                  <span>
                    <span className="text-muted-foreground">SGI: </span>
                    <span className="font-medium tabular-nums text-card-foreground">{formatSEK(annualSgi)}/yr</span>
                  </span>
                  {fp && (
                    <span>
                      <span className="text-muted-foreground">Föräldrapenning: </span>
                      <span className="font-medium tabular-nums text-card-foreground">~{formatSEK(fp.dailySek)}/day</span>
                      {fp.tier === "grundniva" && <span className="text-muted-foreground"> (grundnivå)</span>}
                    </span>
                  )}
                </div>
              )}
              {isSE && annualSgi === 0 && onParentalLeave && (
                <p className="text-[10px] mt-1 text-muted-foreground leading-snug">
                  SGI not set for this adult — income cashflows are per person; salary on a partner alone does not set föräldrapenning basis here.
                  Enter benefit level on a child&apos;s parental leave card, or set annual_sgi on this adult&apos;s entity metadata.
                  Without SGI, grundnivå (250 kr/day) is used in projections.
                </p>
              )}
              {isSE && onParentalLeave && monthRow && !hasModeledForaldrapenning && (
                <p className="text-[10px] mt-1 text-amber-800 dark:text-amber-200/90 bg-amber-500/10 border border-amber-500/25 rounded-md px-2 py-1 leading-snug">
                  Modeled föräldrapenning for <span className="font-medium">{adult.name}</span> this month is{" "}
                  <span className="font-medium">0 kr</span> — this adult&apos;s employment FTE reads as 100%, or weekdays are all marked active (full work week).
                  Another household member working does not affect this; adjust this adult&apos;s parental-leave period (e.g. 0% FTE when not doing paid work) or remove their overlapping employed row.
                </p>
              )}
              {!isSE && annualSgi > 0 && (
                <p className="text-[10px] mt-1">
                  <span className="text-muted-foreground">{benefitBasisLabel}: </span>
                  <span className="font-medium tabular-nums text-card-foreground">{formatSEK(annualSgi)}</span>
                </p>
              )}
              {monthRow && (
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-[10px] text-muted-foreground">
                  <span>Gross: <span className="text-card-foreground tabular-nums">{formatSEK(monthRow.gross_income)}</span></span>
                  <span>Net: <span className="text-income tabular-nums">{formatSEK(monthRow.net_income)}</span></span>
                  <span>Tax: <span className="text-expense tabular-nums">{formatSEK(monthRow.tax)}</span></span>
                  {monthRow.benefits > 0 && (
                    <span>Benefits: <span className="tabular-nums text-card-foreground">{formatSEK(monthRow.benefits)}</span></span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Parental Leave Planning (gauge) ────────────────────────────────────────────

const GAUGE_ARC_D = "M 10 60 A 50 50 0 0 1 110 60";
const ADULT_GAUGE_COLORS = [
  "hsl(217 85% 52%)",
  "hsl(328 72% 48%)",
  "hsl(142 65% 40%)",
  "hsl(38 92% 45%)",
];
const USED_POOL_GAUGE_COLOR = "hsl(220 10% 72%)";

function adultColorAt(index: number): string {
  return ADULT_GAUGE_COLORS[index % ADULT_GAUGE_COLORS.length] ?? ADULT_GAUGE_COLORS[0];
}

type GaugeSegment = { fraction: number; color: string };

function buildParentalGaugeSegments(row: ParentalLeavePlanningDisplay, adults: Entity[]): GaugeSegment[] {
  const avail = row.available;
  if (avail <= 0 || !Number.isFinite(avail)) return [];
  if (row.source === "snapshot" && row.adultRemaining) {
    const segs: GaugeSegment[] = [];
    const usedF = row.used / avail;
    if (usedF > 0) segs.push({ fraction: Math.min(1, usedF), color: USED_POOL_GAUGE_COLOR });
    adults.forEach((a, i) => {
      const rem = row.adultRemaining![a.id];
      if (typeof rem === "number" && rem > 0) segs.push({ fraction: Math.min(1, rem / avail), color: adultColorAt(i) });
    });
    return normalizeGaugeSegments(segs);
  }
  const segs: GaugeSegment[] = [];
  adults.forEach((a, i) => {
    const u = row.adultUsed[a.id] ?? 0;
    if (u > 0) segs.push({ fraction: Math.min(1, u / avail), color: adultColorAt(i) });
  });
  if (segs.length === 0 && row.used > 0) {
    const pct = Math.min(1, row.used / avail);
    const color = pct < 0.6 ? "hsl(142 71% 45%)" : pct < 0.85 ? "hsl(38 92% 50%)" : "hsl(0 84% 60%)";
    segs.push({ fraction: pct, color });
  }
  const sumFrac = segs.reduce((s, x) => s + x.fraction, 0);
  if (sumFrac < 1 - 1e-9) segs.push({ fraction: Math.min(1 - sumFrac, 1), color: "hsl(142 71% 45%)" });
  return normalizeGaugeSegments(segs);
}

function normalizeGaugeSegments(segs: GaugeSegment[]): GaugeSegment[] {
  const sum = segs.reduce((s, x) => s + x.fraction, 0);
  if (sum <= 1) return segs;
  const scale = 1 / sum;
  return segs.map(x => ({ ...x, fraction: x.fraction * scale }));
}

function StackedSemiCircleGauge({ segments }: { segments: GaugeSegment[] }) {
  let offset = 0;
  return (
    <div className="relative w-28 h-16">
      <svg viewBox="0 0 120 70" className="w-full h-full">
        <path d={GAUGE_ARC_D} fill="none" stroke="hsl(220 13% 92%)" strokeWidth="8" strokeLinecap="round" pathLength={100} />
        {segments.map((seg, i) => {
          if (seg.fraction <= 0) return null;
          const dash = seg.fraction * 100;
          const el = (
            <path key={i} d={GAUGE_ARC_D} fill="none" stroke={seg.color} strokeWidth="8" strokeLinecap="round" pathLength={100} strokeDasharray={`${dash} ${100}`} strokeDashoffset={-offset} />
          );
          offset += dash;
          return el;
        })}
      </svg>
    </div>
  );
}

type ParentalDetailColumn = { label: string; value: string; dotColor?: string };

function ParentalLeaveGaugeCard({ row, adults, detailColumns }: { row: ParentalLeavePlanningDisplay; adults: Entity[]; detailColumns: ParentalDetailColumn[] }) {
  const segments = buildParentalGaugeSegments(row, adults);
  return (
    <div className="space-y-3">
      <div className="flex flex-col items-center gap-2">
        <StackedSemiCircleGauge segments={segments} />
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{Math.max(0, row.available - row.used)} days left</span>
          <span>{row.used} used</span>
        </div>
      </div>
      {detailColumns.length > 0 && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 w-full">
          {detailColumns.map((col, i) => (
            <div key={`${col.label}-${i}`} className="flex flex-col items-center text-center gap-0.5 min-w-0">
              <span className="flex items-center justify-center gap-1.5 text-xs font-medium text-foreground leading-tight">
                {col.dotColor ? <span className="w-2 h-2 rounded-full shrink-0 ring-1 ring-black/5" style={{ backgroundColor: col.dotColor }} aria-hidden /> : <span className="w-2 h-2 shrink-0" aria-hidden />}
                <span className="truncate">{col.label}</span>
              </span>
              <span className="text-[11px] tabular-nums text-muted-foreground leading-tight">{col.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ParentalLeavePlanningCard({ child, p }: { child: Entity; p: BentoRender }) {
  const { entities, household } = useAppStore();
  const { values, update } = useHouseholdCardValues();
  const [open, setOpen] = useState(false);
  const adults = entities.filter(e => e.type === "adult");
  const benefitLevelLabel = getParentalLeaveBenefitLevelLabel(household?.country);
  const manualRow = values.planning.parentalByChild[child.id] ?? { available: 0, used: 0, adultUsed: {}, benefitLevel: 0 };
  const row = mergeParentalLeavePlanningRow(child, manualRow, adults);

  const fields: CardNumericFieldDef[] = [
    { key: "available", label: "Available days" },
    { key: "used", label: "Used days (total)" },
    { key: "benefitLevel", label: `${benefitLevelLabel} / benefit level`, hint: household?.country?.toUpperCase() === "SE" ? swedishSgiBenefitLevelFieldHint() : "Country-specific parental leave benefit-level basis." },
    ...adults.map(a => ({ key: `adult_${a.id}`, label: `${a.name} — days used` })),
  ];
  const initial: Record<string, number | null> = {
    available: row.available, used: row.used, benefitLevel: row.benefitLevel,
    ...Object.fromEntries(adults.map(a => [`adult_${a.id}`, row.adultUsed[a.id] ?? 0])),
  };
  const subtitle = row.source === "snapshot" ? "Parental leave (imported)" : "Parental leave days";
  const detailColumns: ParentalDetailColumn[] = adults.map((a, i) => {
    const dotColor = adultColorAt(i);
    if (row.source === "snapshot" && row.adultRemaining && a.id in row.adultRemaining) return { label: a.name, value: `${row.adultRemaining[a.id]} days remaining`, dotColor };
    return { label: a.name, value: `${row.adultUsed[a.id] ?? 0} days used`, dotColor };
  });
  const isSE = household?.country?.trim().toUpperCase() === "SE";
  if (isSE) {
    const fp = estimatedForaldrapenningDailySek(row.benefitLevel);
    if (row.benefitLevel > 0) detailColumns.push({ label: "SGI (annual)", value: formatSEK(row.benefitLevel) });
    detailColumns.push({ label: "Föräldrapenning (~\/day)", value: fp.tier === "grundniva" ? `${formatSEK(fp.dailySek)} (grundnivå)` : `${formatSEK(fp.dailySek)} (based on ${benefitLevelLabel})` });
  } else if (row.benefitLevel > 0) {
    detailColumns.push({ label: benefitLevelLabel, value: formatSEK(row.benefitLevel) });
  }

  return (
    <>
      <Card title={child.name} subtitle={subtitle} icon={<Baby className="w-4 h-4" />} onEdit={() => setOpen(true)} {...p}>
        <ParentalLeaveGaugeCard row={row} adults={adults} detailColumns={detailColumns} />
      </Card>
      <CardNumericFieldsDialog
        open={open} onClose={() => setOpen(false)} title={`${child.name} — parental leave days`}
        description={row.source === "snapshot" ? "Totals and per-parent remaining come from the latest Försäkringskassan CSV import on this child. Edit below to override with manual planning numbers (stored in this browser only)." : isSE ? "Track quota and usage for planning. Swedish föräldrapenning estimates use the 2026 parameter set in app data (illustrative; not an official benefit decision)." : "Track quota and usage for planning; this does not change payroll or benefits in the data model."}
        fields={fields} initial={initial}
        onSave={(next) => {
          const adultUsed: Record<string, number> = {};
          for (const a of adults) adultUsed[a.id] = (next[`adult_${a.id}`] as number) ?? 0;
          update((v) => ({ ...v, planning: { ...v.planning, parentalByChild: { ...v.planning.parentalByChild, [child.id]: { available: (next.available as number) ?? 0, used: (next.used as number) ?? 0, benefitLevel: (next.benefitLevel as number) ?? 0, adultUsed } } } }));
        }}
      />
    </>
  );
}

// ─── Holiday Planning ───────────────────────────────────────────────────────────

function HolidayPlanningCard({ adult, p }: { adult: Entity; p: BentoRender }) {
  const { values, update } = useHouseholdCardValues();
  const [open, setOpen] = useState(false);
  const row = values.planning.holidayByAdult[adult.id] ?? { available: 0, used: 0 };
  return (
    <>
      <Card title={adult.name} subtitle="Holiday days" icon={<Clock className="w-4 h-4" />} onEdit={() => setOpen(true)} {...p}>
        <GaugeCard available={row.available} used={row.used} unit="days" />
      </Card>
      <CardNumericFieldsDialog
        open={open} onClose={() => setOpen(false)} title={`${adult.name} — holiday days`}
        fields={[{ key: "available", label: "Available days" }, { key: "used", label: "Used days" }]}
        initial={{ available: row.available, used: row.used }}
        onSave={(next) => update((v) => ({ ...v, planning: { ...v.planning, holidayByAdult: { ...v.planning.holidayByAdult, [adult.id]: { available: (next.available as number) ?? 0, used: (next.used as number) ?? 0 } } } }))}
      />
    </>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────────

export function usePlanningBentoCards(): BentoCardDefinition[] {
  const { t } = useTranslation();
  const entities = useAppStore((s) => s.entities);
  return useMemo(() => {
    const children = entities.filter((e) => e.type === "child");
    const adults = entities.filter((e) => e.type === "adult");
    return [
      {
        id: "calendar",
        title: t("cards.planning.calendar"),
        defaultSize: "large",
        render: (p) => (
          <Card
            title={t("cards.planning.calendar")}
            titleTooltip={t("cards.planning.calendar_tooltip")}
            icon={<CalendarDays className="w-4 h-4" />}
            {...p}
          >
            <CalendarCardContent />
          </Card>
        ),
      },
      {
        id: "planning-activity",
        title: t("cards.planning.current_activity"),
        defaultSize: "small",
        render: (p) => (
          <Card title={t("cards.planning.current_activity")} subtitle={t("cards.planning.this_month")} icon={<Briefcase className="w-4 h-4" />} {...p}>
            <PlanningActivityCardContent />
          </Card>
        ),
      },
      {
        id: "projection-summary",
        title: t("cards.planning.income_projection"),
        defaultSize: "large",
        render: (p) => (
          <Card
            title={t("cards.planning.income_projection")}
            titleTooltip={t("cards.planning.income_projection_tooltip")}
            subtitle={t("cards.planning.income_projection_sub")}
            icon={<TrendingUp className="w-4 h-4" />}
            {...p}
          >
            <ProjectionSummaryCardContent />
          </Card>
        ),
      },
      ...children.map((child) => ({
        id: `child-leave-${child.id}`,
        title: t("cards.planning.parental_leave_suffix", { name: child.name }),
        defaultSize: "small" as const,
        render: (p: BentoRender) => <ParentalLeavePlanningCard key={child.id} child={child} p={p} />,
      })),
      ...adults.map((adult) => ({
        id: `adult-unemployment-${adult.id}`,
        title: t("cards.planning.unemployment_suffix", { name: adult.name }),
        defaultSize: "small" as const,
        render: (p: BentoRender) => <UnemploymentBenefitsCard key={adult.id} adult={adult} p={p} />,
      })),
      ...adults.map((adult) => ({
        id: `adult-holiday-${adult.id}`,
        title: t("cards.planning.holidays_suffix", { name: adult.name }),
        defaultSize: "small" as const,
        render: (p: BentoRender) => <HolidayPlanningCard key={adult.id} adult={adult} p={p} />,
      })),
    ];
  }, [entities, t]);
}

export function PlanningPage() {
  const cards = usePlanningBentoCards();
  return <BentoGrid tab="planning" cards={cards} />;
}
