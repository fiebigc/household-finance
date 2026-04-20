import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import type { HouseholdConfig } from "@/config/householdConfig";
import type { BentoCardSurfaceTheme } from "@/config/bentoCardSurfaces";
import { PlanningCalendarDayButton } from "@/components/PlanningCalendarDayButton";
import { PlanningPortalFkCard } from "@/components/PlanningPortalFkCard";
import { PlanningPortalPensionCard } from "@/components/PlanningPortalPensionCard";
import {
  PLANNING_MARK_DOT,
  PLANNING_MARK_LABEL_WIDE,
  PLANNING_MARK_SOFT,
  PLANNING_MARK_TITLE,
  PLANNING_PERSON_CARD_TINT,
  PLANNING_PERSON_SOFT_BG,
  PLANNING_PERSON_TEXT,
} from "@/components/planningCalendarUi";
import { getPersonBookings } from "@/utils/finance/householdCalendarMarks";
import {
  planningPersonDisplayLabels,
  type PlanningCalendarDaysMap,
  type PlanningDayMark,
  type PlanningPersonBookings,
  type PlanningPersonCode,
  type WorkScheduleSegment,
} from "@/utils/finance/householdCalendarTypes";
import type { PlanningPortalReference } from "@/utils/finance/planningPortalSnapshot";
import type { EntityRecord } from "@/data/bankData";
import {
  childLeaveQuotaRemaining,
  estimateAkassaMonthlyFromMarkedDays,
  estimateForaldrapenningMonthlyFromCalendar,
  firstBirthdayIso,
  suggestCalendarChildAParentalLeaveHint,
  untoSgiWeekWarnings,
} from "@/utils/finance/householdCalendarFinance";
import { estimateOrangeKuvertMonthlyAccrual } from "@/utils/finance/orangeKuvertCalculator";
import { cn } from "@/lib/utils";

const PERSONS: PlanningPersonCode[] = ["H", "C", "A", "U"];

const ISO_WEEKDAY_ARIA = [
  "",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

function localDateToIso(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonthContaining(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonthIso(monthAnchor: Date): string {
  const y = monthAnchor.getFullYear();
  const m = monthAnchor.getMonth();
  const last = new Date(y, m + 1, 0);
  return localDateToIso(last);
}

/** Stencil uses the highlighted calendar range as inclusive bounds; if none, the full visible month. */
function stencilDateBounds(
  selectedRange: DateRange | undefined,
  displayMonth: Date,
): { fromIso: string; untilIso: string } {
  if (selectedRange?.from) {
    const rawA = localDateToIso(selectedRange.from);
    const rawB = localDateToIso(selectedRange.to ?? selectedRange.from);
    return rawA <= rawB ? { fromIso: rawA, untilIso: rawB } : { fromIso: rawB, untilIso: rawA };
  }
  const y = displayMonth.getFullYear();
  const mo = displayMonth.getMonth() + 1;
  const fromIso = `${y}-${String(mo).padStart(2, "0")}-01`;
  return { fromIso, untilIso: endOfMonthIso(displayMonth) };
}

const LEAVE_CALENDAR_CARD_TIP =
  "Use the calendar, then the strip below (same person and day type for range, stencil, or single-day). Saved to Supabase when configured.";

const PLAN_FROM_CALENDAR_TIP =
  "Same controls for range paint, weekday stencil, and single-day adds. Stencil uses your highlighted range on the calendar as start and end; with no range, it uses the full visible month. Optional work % at the bottom.";

const STENCIL_MONTH_TIP =
  "Paint the selected day type on checked weekdays between the first and last day of your highlighted calendar range. If nothing is highlighted, uses the full month on screen.";

type CalendarInteractionMode = "range" | "day";

type Props = {
  bentoSurface: BentoCardSurfaceTheme;
  portalFkBentoSurface: BentoCardSurfaceTheme;
  portalPensionBentoSurface: BentoCardSurfaceTheme;
  householdConfig: HouseholdConfig;
  calendarDays: PlanningCalendarDaysMap;
  appendBooking: (iso: string, person: PlanningPersonCode, mark: "PL" | "WK" | "AK") => void;
  removeBookingAt: (iso: string, person: PlanningPersonCode, index: number) => void;
  setPersonBookings: (iso: string, person: PlanningPersonCode, marks: PlanningPersonBookings) => void;
  applyMarkToRange: (
    fromIso: string,
    toIso: string,
    person: PlanningPersonCode,
    mark: "PL" | "WK" | "AK",
    mode: "replace" | "append",
  ) => void;
  applyWeekly: (args: {
    fromIso: string;
    untilIso: string;
    weekdays: number[];
    person: PlanningPersonCode;
    mark: PlanningDayMark;
  }) => void;
  workRules: WorkScheduleSegment[];
  setWorkRules: React.Dispatch<React.SetStateAction<WorkScheduleSegment[]>>;
  persistStatus: string;
  formatSek: (n: number) => string;
  portalSnapshot: PlanningPortalReference | null;
  entities: readonly EntityRecord[];
  setPortalSnapshot: Dispatch<SetStateAction<PlanningPortalReference | null>>;
};

export function HouseholdPlanningCalendarCard({
  bentoSurface,
  portalFkBentoSurface,
  portalPensionBentoSurface,
  householdConfig,
  calendarDays,
  appendBooking,
  removeBookingAt,
  setPersonBookings,
  applyMarkToRange,
  applyWeekly,
  workRules,
  setWorkRules,
  persistStatus,
  formatSek,
  portalSnapshot,
  entities,
  setPortalSnapshot,
}: Props) {
  const [displayMonth, setDisplayMonth] = useState(() => startOfMonthContaining(startOfToday()));
  const [interactionMode, setInteractionMode] = useState<CalendarInteractionMode>("range");
  const [selectedRange, setSelectedRange] = useState<DateRange | undefined>();
  const [selectedDay, setSelectedDay] = useState<Date | undefined>(() => startOfToday());
  const [planPerson, setPlanPerson] = useState<PlanningPersonCode>("C");
  const [planMark, setPlanMark] = useState<"PL" | "WK" | "AK">("PL");
  const [rangeFillMode, setRangeFillMode] = useState<"replace" | "append">("replace");

  const [patWeekdays, setPatWeekdays] = useState<number[]>([1, 2, 3, 4]);
  const [planningFootnotesOpen, setPlanningFootnotesOpen] = useState(false);

  const monthKey = `${displayMonth.getFullYear()}-${String(displayMonth.getMonth() + 1).padStart(2, "0")}`;

  const personLabels = useMemo(() => planningPersonDisplayLabels(householdConfig), [householdConfig]);

  const adult1Label = householdConfig.adults[0]?.label ?? "Adult 1";
  const adult2Label = householdConfig.adults[1]?.label ?? "Adult 2";
  const untoChild = householdConfig.children[1] ?? householdConfig.children[0];
  const untoBirth = untoChild?.birthDate ?? "2099-01-01";
  const untoFirstB = firstBirthdayIso(untoBirth);
  const warnings = useMemo(
    () =>
      untoSgiWeekWarnings({
        map: calendarDays,
        untoBirthIso: untoBirth,
        scanFromIso: `${displayMonth.getFullYear()}-01-01`,
        scanToIso: `${displayMonth.getFullYear()}-12-31`,
      }),
    [calendarDays, untoBirth, displayMonth],
  );

  const fpC = estimateForaldrapenningMonthlyFromCalendar({
    map: calendarDays,
    person: "C",
    monthKeyYYYYMM: monthKey,
    annualSgiSek: householdConfig.adults[0]?.annualSgiSek ?? 0,
  });
  const fpH = estimateForaldrapenningMonthlyFromCalendar({
    map: calendarDays,
    person: "H",
    monthKeyYYYYMM: monthKey,
    annualSgiSek: householdConfig.adults[1]?.annualSgiSek ?? 0,
  });
  const akC = estimateAkassaMonthlyFromMarkedDays({
    map: calendarDays,
    person: "C",
    monthKeyYYYYMM: monthKey,
    annualSgiSek: householdConfig.adults[0]?.annualSgiSek ?? 0,
  });
  const akH = estimateAkassaMonthlyFromMarkedDays({
    map: calendarDays,
    person: "H",
    monthKeyYYYYMM: monthKey,
    annualSgiSek: householdConfig.adults[1]?.annualSgiSek ?? 0,
  });
  const orangeH = estimateOrangeKuvertMonthlyAccrual({
    monthlyBruttoIncomeSek: householdConfig.adults[1]?.monthlyBruttoIncomeSek ?? 0,
  });
  const orangeC = estimateOrangeKuvertMonthlyAccrual({
    monthlyBruttoIncomeSek: householdConfig.adults[0]?.monthlyBruttoIncomeSek ?? 0,
  });

  const aaroHint = suggestCalendarChildAParentalLeaveHint({
    map: calendarDays,
    year: displayMonth.getFullYear(),
    personACalendarLabel: personLabels.A,
  });
  const uQuota = childLeaveQuotaRemaining(calendarDays, "U", displayMonth.getFullYear());

  const selectedDayIso = localDateToIso(selectedDay ?? startOfToday());

  const applyPattern = () => {
    const { fromIso, untilIso } = stencilDateBounds(selectedRange, displayMonth);
    applyWeekly({
      fromIso,
      untilIso,
      weekdays: patWeekdays,
      person: planPerson,
      mark: planMark,
    });
  };

  const applyRangeSelection = () => {
    if (!selectedRange?.from) return;
    const from = localDateToIso(selectedRange.from);
    const to = localDateToIso(selectedRange.to ?? selectedRange.from);
    applyMarkToRange(from, to, planPerson, planMark, rangeFillMode);
    setSelectedRange(undefined);
  };

  const clearRangeSelection = () => setSelectedRange(undefined);

  return (
    <Card bentoSurface={bentoSurface} className="bento-span-full">
      <CardHeader className="pb-2">
        <CardTitle title={LEAVE_CALENDAR_CARD_TIP}>
          Leave & work calendar
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 lg:space-y-5">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,30rem)] lg:items-start xl:grid-cols-[minmax(0,1fr)_minmax(22rem,34rem)]">
          <div className="min-w-0">
            <div className="space-y-4 rounded-2xl border border-border/60 bg-card/45 p-3 shadow-bento backdrop-blur-sm dark:border-border/50 dark:bg-card/35">
          <p className="text-sm font-semibold text-foreground">When are leave days?</p>
          <div
            className="mt-2 flex max-w-md rounded-full bg-muted/60 p-0.5"
            role="tablist"
            aria-label="Calendar mode"
          >
            <button
              type="button"
              role="tab"
              aria-selected={interactionMode === "range"}
              className={cn(
                "flex-1 rounded-full px-3 py-2 text-xs font-medium transition-shadow",
                interactionMode === "range"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => {
                setInteractionMode("range");
                setSelectedDay(undefined);
              }}
            >
              Date range
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={interactionMode === "day"}
              className={cn(
                "flex-1 rounded-full px-3 py-2 text-xs font-medium transition-shadow",
                interactionMode === "day"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => {
                setInteractionMode("day");
                setSelectedRange(undefined);
                setSelectedDay(startOfToday());
              }}
            >
              Single day
            </button>
          </div>

          <div className="relative mt-3">
            {interactionMode === "range" ? (
              <Calendar
                mode="range"
                month={displayMonth}
                onMonthChange={setDisplayMonth}
                selected={selectedRange}
                onSelect={setSelectedRange}
                calendarDays={calendarDays}
                components={{ DayButton: PlanningCalendarDayButton }}
                modifiers={{ past: (d) => d < startOfToday() }}
                modifiersClassNames={{
                  past: "opacity-80",
                }}
              />
            ) : (
              <Calendar
                mode="single"
                month={displayMonth}
                onMonthChange={setDisplayMonth}
                selected={selectedDay}
                onSelect={(d) => setSelectedDay(d ?? startOfToday())}
                calendarDays={calendarDays}
                components={{ DayButton: PlanningCalendarDayButton }}
                modifiers={{ past: (d) => d < startOfToday() }}
                modifiersClassNames={{
                  past: "opacity-80",
                }}
              />
            )}
          </div>

              <div className="space-y-3 border-t border-border/40 pt-4 text-xs text-muted-foreground">
          <p
            className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
            title={PLAN_FROM_CALENDAR_TIP}
          >
            Plan from calendar
          </p>

          <div
            className="rounded-xl border border-border/60 bg-card/45 p-2 shadow-sm ring-1 ring-black/[0.02] dark:border-border/55 dark:bg-card/35 dark:ring-white/[0.04]"
            role="group"
            aria-label="Calendar planning controls"
          >
            <div className="flex flex-col gap-2.5">
              <div className="min-w-0 flex flex-nowrap items-center gap-2 overflow-x-auto overflow-y-hidden pb-0.5 [-webkit-overflow-scrolling:touch]">
                <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Person
                </span>
                <div className="inline-flex shrink-0 flex-nowrap gap-0.5 rounded-lg border border-border/50 bg-background/80 p-0.5 dark:bg-background/50">
                  {PERSONS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPlanPerson(p)}
                      title={personLabels[p]}
                      className={cn(
                        "h-8 min-w-[2rem] rounded-md border border-transparent px-2 text-xs font-medium transition-colors duration-150 ease-out",
                        planPerson === p
                          ? cn(
                              "shadow-sm ring-1 ring-black/[0.06] dark:ring-white/10",
                              PLANNING_PERSON_SOFT_BG[p],
                              PLANNING_PERSON_TEXT[p],
                            )
                          : cn(
                              "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                              PLANNING_PERSON_TEXT[p],
                            ),
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Day type
                </span>
                <div className="inline-flex shrink-0 flex-nowrap gap-0.5 rounded-lg border border-border/50 bg-background/80 p-0.5 dark:bg-background/50">
                  {(["PL", "WK", "AK"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      title={PLANNING_MARK_TITLE[m]}
                      onClick={() => setPlanMark(m)}
                      className={cn(
                        "h-8 whitespace-nowrap rounded-md border border-transparent px-2 text-xs font-medium transition-colors duration-150 ease-out sm:px-2.5",
                        planMark === m
                          ? cn("shadow-sm ring-1 ring-black/[0.06] dark:ring-white/10", PLANNING_MARK_SOFT[m])
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                      )}
                    >
                      <span className="sm:hidden">{m}</span>
                      <span className="hidden sm:inline">{PLANNING_MARK_LABEL_WIDE[m]}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-2.5 border-t border-border/40 pt-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-3 sm:gap-y-2">
                <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-0.5 [-webkit-overflow-scrolling:touch] sm:pb-0">
                  <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Weekdays
                  </span>
                  <div className="inline-flex shrink-0 flex-nowrap gap-0.5 rounded-lg border border-border/50 bg-background/80 p-0.5 dark:bg-background/50">
                    {(
                      [
                        [1, "M"],
                        [2, "T"],
                        [3, "W"],
                        [4, "T"],
                        [5, "F"],
                        [6, "S"],
                        [7, "S"],
                      ] as const
                    ).map(([n, lab]) => (
                      <label
                        key={n}
                        aria-label={ISO_WEEKDAY_ARIA[n]}
                        className="inline-flex h-8 min-w-[1.75rem] cursor-pointer select-none items-center justify-center rounded-md border border-transparent bg-background/60 text-xs font-medium text-muted-foreground transition-colors duration-150 ease-out has-[:checked]:border-border/60 has-[:checked]:bg-background has-[:checked]:text-foreground has-[:checked]:shadow-sm dark:has-[:checked]:border-border/70"
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={patWeekdays.includes(Number(n))}
                          onChange={() => {
                            const v = Number(n);
                            setPatWeekdays((prev) =>
                              prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v].sort(),
                            );
                          }}
                        />
                        <span aria-hidden className="font-medium tabular-nums">
                          {lab}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
                  {interactionMode === "range" ? (
                    <div
                      className="inline-flex gap-0.5 rounded-lg border border-border/50 bg-background/70 p-0.5 dark:bg-background/45"
                      role="tablist"
                      aria-label="How range apply merges marks"
                    >
                      {(["replace", "append"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          role="tab"
                          aria-selected={rangeFillMode === m}
                          onClick={() => setRangeFillMode(m)}
                          className={cn(
                            "h-8 rounded-md px-3 text-xs font-medium transition-colors duration-150 ease-out",
                            rangeFillMode === m
                              ? "bg-muted/80 text-foreground shadow-sm dark:bg-muted/50"
                              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                          )}
                        >
                          {m === "replace" ? "Replace" : "Append"}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={applyPattern}
                    disabled={patWeekdays.length === 0}
                    title={STENCIL_MONTH_TIP}
                  >
                    Stencil month
                  </Button>
                  {interactionMode === "range" ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={clearRangeSelection}
                        aria-label="Clear selected date range"
                      >
                        Clear
                      </Button>
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        className="h-8 text-xs"
                        disabled={!selectedRange?.from}
                        onClick={applyRangeSelection}
                        aria-label="Apply marks to selected date range"
                      >
                        Apply
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          {interactionMode === "day" ? (
            <div className="space-y-2 rounded-2xl border border-border/40 bg-background/55 p-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:bg-background/25 dark:shadow-none">
              <p
                className="text-xs font-semibold tabular-nums text-foreground"
                title={`Single day ${selectedDayIso}: add ${planMark} per person using the strip above.`}
              >
                {selectedDayIso}
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {PERSONS.map((p) => {
                  const list = getPersonBookings(calendarDays, selectedDayIso, p);
                  return (
                    <div
                      key={p}
                      className={cn(
                        "rounded-[10px] border border-border/45 bg-card/80 p-2 shadow-sm ring-1 ring-inset ring-black/[0.03] dark:bg-card/40",
                        PLANNING_PERSON_CARD_TINT[p],
                      )}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className={cn("text-xs font-semibold", PLANNING_PERSON_TEXT[p])}>
                          {p} · {personLabels[p]}
                        </span>
                        <div className="flex flex-wrap gap-0.5">
                          <button
                            type="button"
                            className={cn(
                              "whitespace-nowrap rounded-full border px-1.5 py-0.5 text-xs font-medium hover:opacity-90",
                              PLANNING_MARK_SOFT[planMark],
                            )}
                            title={PLANNING_MARK_TITLE[planMark]}
                            onClick={() => appendBooking(selectedDayIso, p, planMark)}
                          >
                            <span className="sm:hidden">+{planMark}</span>
                            <span className="hidden sm:inline">+{PLANNING_MARK_LABEL_WIDE[planMark]}</span>
                          </button>
                          <button
                            type="button"
                            className="rounded-full px-1 py-0.5 text-[9px] text-muted-foreground hover:text-foreground"
                            onClick={() => setPersonBookings(selectedDayIso, p, [])}
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                      <ul className="mt-1 space-y-0.5">
                        {list.length === 0 ? (
                          <li className="text-xs text-muted-foreground">—</li>
                        ) : (
                          list.map((mark, idx) => (
                            <li key={`${p}-${idx}-${mark}`} className="flex items-center justify-between gap-1">
                              <span
                                className={cn(
                                  "inline-flex items-center gap-0.5 rounded px-1 font-mono text-xs",
                                  PLANNING_MARK_SOFT[mark],
                                )}
                              >
                                <span className={cn("h-1 w-1 rounded-full", PLANNING_MARK_DOT[mark])} />
                                {mark}
                              </span>
                              <button
                                type="button"
                                className="text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => removeBookingAt(selectedDayIso, p, idx)}
                              >
                                ×
                              </button>
                            </li>
                          ))
                        )}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <details className="group rounded-2xl border border-border/45 bg-muted/20 transition-[background-color,box-shadow] duration-150 ease-out open:bg-muted/30 open:shadow-sm dark:bg-muted/15 dark:open:bg-muted/25 [&_summary]:list-none [&_summary::-webkit-details-marker]:hidden">
            <summary
              className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-xs font-medium text-foreground transition-colors duration-150 ease-out hover:bg-muted/35 dark:hover:bg-muted/25"
              title="For this calendar view only; scenarios still use household form values."
            >
              <span>Work % (optional)</span>
              <span className="text-xs font-normal tabular-nums text-muted-foreground group-open:hidden">
                Show
              </span>
              <span className="hidden text-xs font-normal text-muted-foreground group-open:inline">
                Hide
              </span>
            </summary>
            <div className="space-y-2 border-t border-border/35 px-2.5 pb-2.5 pt-2">
              <ul className="space-y-0.5">
                {workRules.map((r, i) => (
                  <li key={`${r.adultId}-${i}`} className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
                    <span>
                      {r.adultId === "adult1" ? adult1Label : adult2Label} {r.validFrom}→{r.validTo}{" "}
                      {r.workingPercentage}% {r.daysPerWeek}d/w
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1 text-xs"
                      onClick={() => setWorkRules((prev) => prev.filter((_, j) => j !== i))}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
              <WorkRuleForm
                key={monthKey}
                onAdd={(seg) => setWorkRules((prev) => [...prev, seg])}
                defaultFrom={`${monthKey}-01`}
                defaultTo={householdConfig.transitionDate}
                showTopDivider={false}
                adult1Label={adult1Label}
                adult2Label={adult2Label}
              />
            </div>
          </details>
              </div>
            </div>
          </div>

          <aside className="min-w-0 space-y-4 lg:sticky lg:top-4 lg:self-start">
            <PlanningPortalFkCard
              bentoSurface={portalFkBentoSurface}
              snapshot={portalSnapshot}
              householdConfig={householdConfig}
            />
            <PlanningPortalPensionCard
              bentoSurface={portalPensionBentoSurface}
              snapshot={portalSnapshot}
              formatSek={formatSek}
              entities={entities}
              setPortalSnapshot={setPortalSnapshot}
            />
          </aside>
        </div>

        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-fit text-xs"
            aria-expanded={planningFootnotesOpen}
            onClick={() => setPlanningFootnotesOpen((o) => !o)}
          >
            {planningFootnotesOpen ? "Hide planning detail" : "More info"}
          </Button>
          {planningFootnotesOpen ? (
            <div
              className="rounded-xl border border-border/60 bg-muted/15 p-4 shadow-sm dark:bg-muted/10"
              role="region"
              aria-label="Planning estimates detail"
            >
              <div className="grid gap-4 text-xs leading-relaxed text-muted-foreground md:grid-cols-2 md:gap-x-10 lg:grid-cols-3 lg:gap-x-8">
                <div className="space-y-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/80">
                    Parental leave FP ({monthKey})
                  </p>
                  <p>
                    <span className="font-medium text-foreground">{adult1Label}: </span>
                    {fpC.paidDays}d → {formatSek(fpC.monthlyGrossSek)} / mo gross (planning)
                  </p>
                  <p>
                    <span className="font-medium text-foreground">{adult2Label}: </span>
                    {fpH.paidDays}d → {formatSek(fpH.monthlyGrossSek)} / mo gross (planning)
                  </p>
                </div>
                <div className="space-y-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/80">
                    A-kassa & orange kuvert
                  </p>
                  <p>
                    <span className="font-medium text-foreground">A-kassa scale: </span>
                    {adult1Label} {akC.akassaDays}d → {formatSek(akC.monthlyGrossSek)} · {adult2Label}{" "}
                    {akH.akassaDays}d → {formatSek(akH.monthlyGrossSek)}
                  </p>
                  <p>
                    <span className="font-medium text-foreground">Orange kuvert (planning): </span>
                    {adult1Label} {formatSek(orangeC.monthlyAccrualSek)}/mo · {adult2Label}{" "}
                    {formatSek(orangeH.monthlyAccrualSek)}/mo
                  </p>
                </div>
                <div className="space-y-3 md:col-span-2 lg:col-span-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/80">
                    Calendar checks
                  </p>
                  <p>{aaroHint}</p>
                  <p>
                    {personLabels.U} PL days {displayMonth.getFullYear()}: {uQuota.used} / {uQuota.quota}{" "}
                    (remaining {uQuota.remaining}). First birthday (planning): {untoFirstB}. Weeks with
                    fewer than 5 U PL days after that:{" "}
                    {warnings.length ? warnings.join(", ") : "none flagged"}.
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {persistStatus ? (
          <p className="text-xs text-finance-expense" role="status">
            {persistStatus}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function WorkRuleForm({
  onAdd,
  defaultFrom,
  defaultTo,
  showTopDivider = true,
  adult1Label,
  adult2Label,
}: {
  onAdd: (seg: WorkScheduleSegment) => void;
  defaultFrom: string;
  defaultTo: string;
  showTopDivider?: boolean;
  adult1Label: string;
  adult2Label: string;
}) {
  const [adultId, setAdultId] = useState<"adult1" | "adult2">("adult2");
  const [validFrom, setValidFrom] = useState(defaultFrom);
  const [validTo, setValidTo] = useState(defaultTo);
  const [pct, setPct] = useState(80);
  const [dow, setDow] = useState(5);

  return (
    <div
      className={cn(
        "mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5",
        showTopDivider ? "border-t border-border/40 pt-3" : "mt-2 pt-0",
      )}
    >
      <div className="space-y-1">
        <Label className="text-xs">Adult</Label>
        <select
          className="native-select mt-0 h-8 text-xs"
          value={adultId}
          onChange={(e) => setAdultId(e.target.value as "adult1" | "adult2")}
        >
          <option value="adult1">
            {adult1Label} (adult1)
          </option>
          <option value="adult2">
            {adult2Label} (adult2)
          </option>
        </select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">From</Label>
        <Input
          type="date"
          className="h-8 text-xs"
          value={validFrom}
          onChange={(e) => setValidFrom(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">To</Label>
        <Input
          type="date"
          className="h-8 text-xs"
          value={validTo}
          onChange={(e) => setValidTo(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Work %</Label>
        <Input
          type="number"
          className="h-8 text-xs"
          min={0}
          max={100}
          value={pct}
          onChange={(e) => setPct(Number(e.target.value || 0))}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Days / week</Label>
        <Input
          type="number"
          className="h-8 text-xs"
          min={1}
          max={7}
          value={dow}
          onChange={(e) => setDow(Number(e.target.value || 5))}
        />
      </div>
      <div className="flex items-end lg:col-span-5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            onAdd({
              adultId,
              validFrom,
              validTo,
              workingPercentage: pct,
              daysPerWeek: dow,
            })
          }
        >
          Add work segment
        </Button>
      </div>
    </div>
  );
}
