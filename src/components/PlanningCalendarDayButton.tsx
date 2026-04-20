import { DayButton, useDayPicker } from "react-day-picker";
import type { DayButtonProps } from "react-day-picker";

import { PLANNING_MARK_DOT, PLANNING_PERSON_TEXT } from "@/components/planningCalendarUi";
import type { PlanningCalendarDaysMap, PlanningPersonCode } from "@/utils/finance/householdCalendarTypes";
import { getPersonBookings } from "@/utils/finance/householdCalendarMarks";
import { cn } from "@/lib/utils";

const PERSONS: PlanningPersonCode[] = ["H", "C", "A", "U"];

function localDateToIso(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export type PlanningCalendarPickerProps = {
  calendarDays?: PlanningCalendarDaysMap;
};

export function PlanningCalendarDayButton(props: DayButtonProps) {
  const { modifiers, className, children, ...rest } = props;
  const ctx = useDayPicker();
  const calendarDays = (ctx.dayPickerProps as PlanningCalendarPickerProps).calendarDays;
  const iso = localDateToIso(props.day.date);

  return (
    <DayButton
      {...rest}
      day={props.day}
      modifiers={modifiers}
      className={cn(
        className,
        modifiers.past && "[&>span:first-child]:text-muted-foreground [&>span:first-child]:line-through",
      )}
    >
      <span className="tabular-nums leading-none">{children}</span>
      {calendarDays ? (
        <span className="mt-0.5 flex w-full max-w-[2.6rem] justify-center gap-0.5 leading-none">
          {PERSONS.map((p) => {
            const bookings = getPersonBookings(calendarDays, iso, p);
            const n = bookings.length;
            return (
              <div key={p} className="flex flex-col items-center gap-px">
                <span
                  className={cn(
                    "min-w-[0.35rem] text-[6.5px] font-bold uppercase leading-none",
                    n === 0 ? "text-muted-foreground/35" : PLANNING_PERSON_TEXT[p],
                  )}
                  title={`${p}: ${n} booking(s)`}
                >
                  {p}
                  {n > 1 ? n : ""}
                </span>
                {n > 0 ? (
                  <span className="flex max-w-[0.65rem] flex-wrap justify-center gap-px">
                    {bookings.slice(0, 3).map((m, i) => (
                      <span
                        key={`${p}-${i}-${m}`}
                        className={cn("h-1 w-1 shrink-0 rounded-full", PLANNING_MARK_DOT[m])}
                      />
                    ))}
                    {bookings.length > 3 ? (
                      <span className="text-[5px] font-bold leading-none text-muted-foreground">+</span>
                    ) : null}
                  </span>
                ) : null}
              </div>
            );
          })}
        </span>
      ) : null}
    </DayButton>
  );
}
