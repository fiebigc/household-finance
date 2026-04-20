import type { PlanningPersonCode } from "@/utils/finance/householdCalendarTypes";

export const PLANNING_PERSON_TEXT: Record<PlanningPersonCode, string> = {
  H: "text-sky-700 dark:text-sky-300",
  C: "text-blue-700 dark:text-blue-300",
  A: "text-emerald-700 dark:text-emerald-300",
  U: "text-violet-700 dark:text-violet-300",
};

export const PLANNING_PERSON_SOFT_BG: Record<PlanningPersonCode, string> = {
  H: "bg-sky-500/15 ring-sky-500/30",
  C: "bg-blue-500/15 ring-blue-500/30",
  A: "bg-emerald-500/15 ring-emerald-500/30",
  U: "bg-violet-500/15 ring-violet-500/30",
};

export const PLANNING_PERSON_CARD_TINT: Record<PlanningPersonCode, string> = {
  H: "bg-sky-500/8",
  C: "bg-blue-500/8",
  A: "bg-emerald-500/8",
  U: "bg-violet-500/8",
};

export const PLANNING_MARK_DOT: Record<"PL" | "WK" | "AK", string> = {
  PL: "bg-finance-income",
  WK: "bg-muted-foreground",
  AK: "bg-finance-runway",
};

export const PLANNING_MARK_SOFT: Record<"PL" | "WK" | "AK", string> = {
  PL: "border-finance-income/50 bg-finance-income/10 text-finance-income",
  WK: "border-border bg-muted/40 text-foreground",
  AK: "border-finance-runway/50 bg-finance-runway/10 text-finance-runway",
};

/** Accessible titles for PL / WK / AK chips (range, weekly fill, single-day). */
export const PLANNING_MARK_TITLE: Record<"PL" | "WK" | "AK", string> = {
  PL: "Parental leave planning day (föräldrapenning)",
  WK: "Paid work day",
  AK: "A-kassa benefit day",
};

/** Shown from `sm` when the planning strip has room; keep acronym on narrow viewports. */
export const PLANNING_MARK_LABEL_WIDE: Record<"PL" | "WK" | "AK", string> = {
  PL: "Parental leave",
  WK: "Work",
  AK: "A-kassa",
};
