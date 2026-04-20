import { describe, expect, it } from "vitest";
import { applyWeeklyPattern } from "./householdCalendarMarks";
import {
  childLeaveQuotaRemaining,
  countParentalLeaveDaysInMonth,
  firstBirthdayIso,
  untoSgiWeekWarnings,
} from "./householdCalendarFinance";
import type { PlanningCalendarDaysMap } from "./householdCalendarTypes";

describe("householdCalendarFinance", () => {
  it("counts parental leave days in month", () => {
    const map = applyWeeklyPattern({
      fromIso: "2026-08-01",
      untilIso: "2026-08-31",
      weekdays: [1, 2, 3, 4],
      person: "C",
      mark: "PL",
      base: {},
    });
    expect(countParentalLeaveDaysInMonth(map, "C", "2026-08")).toBeGreaterThan(0);
  });

  it("sums multiple PL bookings on the same day for planning totals", () => {
    const map: PlanningCalendarDaysMap = { "2026-05-10": { C: ["PL", "PL"] } };
    expect(countParentalLeaveDaysInMonth(map, "C", "2026-05")).toBe(2);
  });

  it("firstBirthdayIso adds one calendar year", () => {
    expect(firstBirthdayIso("2025-10-03")).toBe("2026-10-03");
  });

  it("childLeaveQuotaRemaining uses planning quota", () => {
    const map = applyWeeklyPattern({
      fromIso: "2026-01-01",
      untilIso: "2026-01-31",
      weekdays: [1, 2, 3, 4, 5],
      person: "A",
      mark: "PL",
      base: {},
    });
    const r = childLeaveQuotaRemaining(map, "A", 2026);
    expect(r.used).toBeGreaterThan(10);
    expect(r.quota).toBe(240);
    expect(r.remaining).toBe(240 - r.used);
  });

  it("returns week start strings for low U PL weeks after first birthday", () => {
    const map = {};
    const warnings = untoSgiWeekWarnings({
      map,
      untoBirthIso: "2025-10-03",
      scanFromIso: "2026-10-04",
      scanToIso: "2026-11-30",
    });
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
