import * as React from "react";
import type { Locale } from "date-fns/locale";
import { enUS } from "date-fns/locale/en-US";
import {
  DayFlag,
  DayPicker,
  SelectionState,
  UI,
  useDayPicker,
  type CalendarMonth,
  type DayPickerProps,
} from "react-day-picker";

import type { PlanningCalendarPickerProps } from "@/components/PlanningCalendarDayButton";
import { cn } from "@/lib/utils";

const DROPDOWN_NAV_START = new Date(2000, 0, 1);
const DROPDOWN_NAV_END = new Date(2050, 11, 31);

const NATIVE_SELECT_CLASS =
  "native-select h-9 max-w-[11rem] rounded-[10px] border border-border/60 bg-background px-2 text-sm font-medium text-foreground shadow-sm";

function monthIndexBounds(start: Date, end: Date) {
  return {
    min: start.getFullYear() * 12 + start.getMonth(),
    max: end.getFullYear() * 12 + end.getMonth(),
  };
}

function clampMonthToNav(y: number, m: number, min: number, max: number) {
  const stamp = y * 12 + m;
  if (stamp < min) {
    const ys = Math.floor(min / 12);
    return new Date(ys, min - ys * 12, 1);
  }
  if (stamp > max) {
    const ye = Math.floor(max / 12);
    return new Date(ye, max - ye * 12, 1);
  }
  return new Date(y, m, 1);
}

/**
 * Written month caption from DayPicker (`children`); month/year `<select>`s on hover or focus-within.
 */
function HoverRevealMonthYearCaption({
  calendarMonth,
  className,
  style,
  children,
  ...rest
}: {
  calendarMonth: CalendarMonth;
  displayIndex: number;
} & React.HTMLAttributes<HTMLDivElement>) {
  const { goToMonth, dayPickerProps, formatters, labels } = useDayPicker();
  const start = dayPickerProps.startMonth ?? DROPDOWN_NAV_START;
  const end = dayPickerProps.endMonth ?? DROPDOWN_NAV_END;
  const { min: minStamp, max: maxStamp } = monthIndexBounds(start, end);
  const current = calendarMonth.date;
  const locale = (dayPickerProps.locale ?? enUS) as Locale;

  const years = React.useMemo(() => {
    const ys: number[] = [];
    for (let y = start.getFullYear(); y <= end.getFullYear(); y += 1) ys.push(y);
    return ys;
  }, [start, end]);

  const monthOptions = React.useMemo(() => {
    const y = current.getFullYear();
    const opts: { value: number; label: string }[] = [];
    for (let m = 0; m < 12; m += 1) {
      const stamp = y * 12 + m;
      if (stamp < minStamp || stamp > maxStamp) continue;
      opts.push({
        value: m,
        label: formatters.formatMonthDropdown(m, locale),
      });
    }
    return opts;
  }, [current, formatters, locale, minStamp, maxStamp]);

  const monthValue = monthOptions.some((o) => o.value === current.getMonth())
    ? current.getMonth()
    : (monthOptions[0]?.value ?? current.getMonth());

  const onMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const m = Number(e.target.value);
    goToMonth(clampMonthToNav(current.getFullYear(), m, minStamp, maxStamp));
  };

  const onYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const y = Number(e.target.value);
    goToMonth(clampMonthToNav(y, current.getMonth(), minStamp, maxStamp));
  };

  return (
    <div className={cn(className)} style={style} {...rest}>
      <div className="group/cap relative flex flex-col items-center justify-center">
        <div className="flex min-h-9 items-center justify-center text-center">{children}</div>
        <div
          className={cn(
            "absolute left-1/2 top-full z-40 mt-1 hidden min-w-[min(280px,92vw)] -translate-x-1/2 flex-row flex-wrap items-center justify-center gap-2 rounded-xl border border-border/60 bg-card/95 p-2 shadow-lg backdrop-blur-sm",
            "group-hover/cap:flex group-focus-within/cap:flex dark:border-border/50 dark:bg-card/90",
          )}
        >
          <select
            className={NATIVE_SELECT_CLASS}
            aria-label={labels.labelMonthDropdown()}
            value={monthValue}
            onChange={onMonthChange}
          >
            {monthOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            className={cn(NATIVE_SELECT_CLASS, "w-[5.5rem] max-w-none")}
            aria-label={labels.labelYearDropdown({ locale })}
            value={current.getFullYear()}
            onChange={onYearChange}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

/**
 * Range: soft connected band on the cell (`td`), pill accent on the inner `button` at ends.
 * Single-day selection: same endpoint styling for readability (no black-on-black on markers).
 */
export const airbnbLikeCalendarClassNames: Partial<DayPickerProps["classNames"]> = {
  [UI.Root]: "w-full rounded-[10px] border border-border/60 bg-card p-3",
  /** Reserve top space so absolute `Nav` does not cover the month caption. */
  [UI.Months]: "relative flex w-full flex-col gap-4 pt-10",
  [UI.Month]: "relative w-full space-y-2",
  /** Prev/next month; sits in the padded strip at the top of `UI.Months`. */
  [UI.Nav]: "pointer-events-auto absolute left-2 right-2 top-2 z-30 flex items-center justify-between gap-1",
  [UI.MonthCaption]:
    "relative z-10 flex min-h-11 flex-col items-center justify-center gap-1 px-2 py-1 sm:px-3",
  [UI.Dropdowns]: "flex flex-wrap items-center justify-center gap-2",
  [UI.Dropdown]: "native-select h-9 max-w-[11rem] rounded-[10px] border border-border/60 bg-background px-2 text-sm font-medium text-foreground shadow-sm",
  [UI.MonthsDropdown]: "native-select h-9 max-w-[10rem] rounded-[10px] border border-border/60 bg-background px-2 text-sm font-medium text-foreground shadow-sm",
  [UI.YearsDropdown]: "native-select h-9 w-[5.5rem] rounded-[10px] border border-border/60 bg-background px-2 text-sm font-medium text-foreground shadow-sm",
  [UI.CaptionLabel]: "text-sm font-semibold tracking-tight text-foreground",
  [UI.PreviousMonthButton]:
    "pointer-events-auto relative z-30 inline-flex h-8 w-8 items-center justify-center rounded-full border-0 bg-background/80 text-foreground shadow-sm backdrop-blur-sm hover:bg-muted",
  [UI.NextMonthButton]:
    "pointer-events-auto relative z-30 inline-flex h-8 w-8 items-center justify-center rounded-full border-0 bg-background/80 text-foreground shadow-sm backdrop-blur-sm hover:bg-muted",
  [UI.MonthGrid]: "mt-1 w-full border-collapse",
  /** Match day column width (`w-[14.28%]`) so labels align and stay centered per column. */
  [UI.Weekdays]: "mt-1 flex w-full",
  [UI.Weekday]:
    "flex w-[14.28%] flex-none items-center justify-center text-center text-[0.68rem] font-medium text-muted-foreground",
  [UI.Weeks]: "",
  [UI.Week]: "mt-1 flex w-full",
  [UI.Day]: "relative h-12 w-[14.28%] p-0 text-center align-middle",
  [UI.DayButton]:
    "mx-auto flex min-h-[2.75rem] min-w-[2.5rem] w-10 max-w-full flex-col items-center justify-center gap-0.5 rounded-full p-0 text-sm font-medium text-foreground hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  [DayFlag.outside]: "opacity-45",
  [DayFlag.today]: "font-semibold",
  /** Single-day mode: light cell, dark pill on the button only. */
  [SelectionState.selected]:
    "rounded-full bg-primary/12 text-foreground [&>button]:bg-foreground [&>button]:text-background [&>button]:shadow-sm [&>button]:hover:bg-foreground/90 [&>button]:hover:text-background",
  /** Range ends: connect horizontally; marker text stays on a readable track. */
  [SelectionState.range_start]:
    "rounded-l-full rounded-r-none bg-primary/15 text-foreground [&>button]:z-[1] [&>button]:rounded-full [&>button]:bg-foreground [&>button]:text-background [&>button]:shadow-md [&>button]:hover:bg-foreground/90 [&>button]:hover:text-background",
  [SelectionState.range_end]:
    "rounded-r-full rounded-l-none bg-primary/15 text-foreground [&>button]:z-[1] [&>button]:rounded-full [&>button]:bg-foreground [&>button]:text-background [&>button]:shadow-md [&>button]:hover:bg-foreground/90 [&>button]:hover:text-background",
  [SelectionState.range_middle]:
    "rounded-none bg-primary/15 text-foreground [&>button]:bg-transparent [&>button]:shadow-none [&>button]:hover:bg-muted/60",
  [DayFlag.disabled]: "opacity-35",
};

export type CalendarProps = DayPickerProps & PlanningCalendarPickerProps;

function Calendar({
  className,
  classNames,
  weekStartsOn = 1,
  showOutsideDays = true,
  captionLayout = "label",
  hideNavigation = false,
  startMonth,
  endMonth,
  components: componentsProp,
  ...props
}: CalendarProps) {
  const useDropdownCaption =
    typeof captionLayout === "string" && captionLayout.startsWith("dropdown");

  const components = useDropdownCaption
    ? componentsProp
    : { MonthCaption: HoverRevealMonthYearCaption, ...componentsProp };

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      weekStartsOn={weekStartsOn}
      captionLayout={captionLayout}
      hideNavigation={hideNavigation}
      startMonth={startMonth ?? DROPDOWN_NAV_START}
      endMonth={endMonth ?? DROPDOWN_NAV_END}
      className={cn(className)}
      classNames={{ ...airbnbLikeCalendarClassNames, ...classNames }}
      components={components}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar, DayPicker, UI };
