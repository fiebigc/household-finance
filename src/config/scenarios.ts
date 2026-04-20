import type { EmploymentMode, HouseholdConfig } from "./householdConfig";

/** Stable id for the first local scenario before any Supabase row exists. */
export const INITIAL_BASELINE_SCENARIO_ID = "scenario-baseline-001";

export type ScenarioId = string;

export type ScenarioEventType =
  | "employment_change"
  | "benefit_change"
  | "loan_change"
  | "cashflow_adjustment";

export interface ScenarioEvent {
  id: string;
  scenarioId: ScenarioId;
  effectiveDate: string;
  type: ScenarioEventType;
  description: string;
  payload: Record<string, unknown>;
}

export type ScenarioTileCategory = "cost" | "income" | "loan" | "children" | "custom";

export type ScenarioTileSourceKind =
  | "none"
  | "loan_interest_monthly"
  | "recurring_net"
  | "recurring_row"
  /** Fixed SEK / month entered on the tile; stored in scenario JSON (Supabase). Sign follows category (cost vs income). */
  | "custom_monthly";

export interface ScenarioTile {
  id: string;
  name: string;
  category: ScenarioTileCategory;
  validFrom: string;
  validTo: string | null;
  sourceKind: ScenarioTileSourceKind;
  sourceRef?: string | null;
  /** Used when `sourceKind === "custom_monthly"`; non-negative SEK per month. */
  customMonthlyAmountSek: number | null;
}

export interface ScenarioDefinition {
  id: ScenarioId;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  transitionDateOverride?: string;
  assumptions: string[];
  events: ScenarioEvent[];
  tiles: ScenarioTile[];
}

export interface EmploymentChangePayload {
  adultId: "adult1" | "adult2";
  employmentMode: EmploymentMode;
  workingPercentage: number;
}

export function newScenarioEntityId(prefix: string): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now()}`;
}

function addMonthsToMonthKey(monthKey: string, deltaMonths: number): string {
  const parts = monthKey.split("-").map(Number);
  let y = parts[0] ?? 0;
  let m = parts[1] ?? 1;
  m += deltaMonths;
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}

function lastDayOfMonthKey(monthKey: string): string {
  const parts = monthKey.split("-").map(Number);
  const y = parts[0] ?? 0;
  const mo = parts[1] ?? 1;
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return `${monthKey}-${String(last).padStart(2, "0")}`;
}

function isTileCategory(v: unknown): v is ScenarioTileCategory {
  return (
    v === "cost" ||
    v === "income" ||
    v === "loan" ||
    v === "children" ||
    v === "custom"
  );
}

function isTileSourceKind(v: unknown): v is ScenarioTileSourceKind {
  return (
    v === "none" ||
    v === "loan_interest_monthly" ||
    v === "recurring_net" ||
    v === "recurring_row" ||
    v === "custom_monthly"
  );
}

function normalizeCustomMonthlyAmount(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.max(0, raw);
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(0, n) : null;
  }
  return null;
}

function normalizeTile(raw: unknown): ScenarioTile {
  const o = raw && typeof raw === "object" ? (raw as Partial<ScenarioTile>) : {};
  const sourceKind: ScenarioTileSourceKind = isTileSourceKind(o.sourceKind)
    ? o.sourceKind
    : "none";
  let customMonthlyAmountSek = normalizeCustomMonthlyAmount(
    (o as Partial<ScenarioTile>).customMonthlyAmountSek,
  );
  if (sourceKind === "custom_monthly" && customMonthlyAmountSek === null) {
    customMonthlyAmountSek = 0;
  }
  if (sourceKind !== "custom_monthly") {
    customMonthlyAmountSek = null;
  }
  return {
    id: typeof o.id === "string" && o.id ? o.id : newScenarioEntityId("tile"),
    name: typeof o.name === "string" && o.name.trim() ? o.name.trim() : "Tile",
    category: isTileCategory(o.category) ? o.category : "custom",
    validFrom:
      typeof o.validFrom === "string" && /^\d{4}-\d{2}-\d{2}/.test(o.validFrom)
        ? o.validFrom.slice(0, 10)
        : "2026-01-01",
    validTo:
      o.validTo === null || o.validTo === ""
        ? null
        : typeof o.validTo === "string" && /^\d{4}-\d{2}-\d{2}/.test(o.validTo)
          ? o.validTo.slice(0, 10)
          : null,
    sourceKind,
    sourceRef:
      typeof o.sourceRef === "string" && o.sourceRef.trim() ? o.sourceRef.trim() : null,
    customMonthlyAmountSek,
  };
}

export function scenarioFromDbRow(row: {
  id: string;
  name: string;
  definition: unknown;
}): ScenarioDefinition {
  const d =
    row.definition && typeof row.definition === "object"
      ? (row.definition as Partial<ScenarioDefinition>)
      : {};
  const events = Array.isArray(d.events)
    ? (d.events as ScenarioEvent[]).map((e) => ({
        ...e,
        scenarioId: row.id,
      }))
    : [];
  const tiles = Array.isArray(d.tiles)
    ? (d.tiles as unknown[]).map((t) => normalizeTile(t))
    : [];
  const assumptions = Array.isArray(d.assumptions)
    ? (d.assumptions as string[]).filter((a) => typeof a === "string" && a.trim())
    : [];
  return {
    id: row.id,
    name: row.name?.trim() || "Scenario",
    description:
      typeof d.description === "string"
        ? d.description
        : "Plan notes and exploration for this scenario.",
    startDate:
      typeof d.startDate === "string" && d.startDate.length >= 10
        ? d.startDate.slice(0, 10)
        : "2026-01-01",
    endDate:
      typeof d.endDate === "string" && d.endDate.length >= 10
        ? d.endDate.slice(0, 10)
        : "2027-12-31",
    transitionDateOverride:
      typeof d.transitionDateOverride === "string"
        ? d.transitionDateOverride.slice(0, 10)
        : undefined,
    assumptions:
      assumptions.length > 0
        ? assumptions
        : ["Restored from database; refine assumptions as needed."],
    events,
    tiles,
  };
}

export function createBlankScenario(opts: {
  id?: string;
  name: string;
  household: HouseholdConfig;
}): ScenarioDefinition {
  const id =
    opts.id ??
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? `scenario-${crypto.randomUUID()}`
      : `scenario-${Date.now()}`);
  const transition = opts.household.transitionDate.slice(0, 10);
  const startMonth = transition.slice(0, 7);
  const endMonthKey = addMonthsToMonthKey(startMonth, 23);
  const endDate = lastDayOfMonthKey(endMonthKey);
  const mkTile = (
    name: string,
    category: ScenarioTileCategory,
    sourceKind: ScenarioTileSourceKind,
  ): ScenarioTile => ({
    id: newScenarioEntityId("tile"),
    name,
    category,
    validFrom: transition,
    validTo: null,
    sourceKind,
    sourceRef: null,
    customMonthlyAmountSek: null,
  });
  return {
    id,
    name: opts.name,
    description:
      "Use tiles to document income, costs, loans, and children-related assumptions. Add scenario events when you need month-by-month engine changes.",
    startDate: `${startMonth}-01`,
    endDate,
    transitionDateOverride: undefined,
    assumptions: [
      "Projection window starts at the first day of the transition month and runs 24 months.",
    ],
    events: [],
    tiles: [
      mkTile("Income", "income", "none"),
      mkTile("Costs", "cost", "recurring_net"),
      mkTile("Loans", "loan", "loan_interest_monthly"),
      mkTile("Children", "children", "none"),
    ],
  };
}

export function getScenarioById(
  scenarioId: string,
  scenarioList: readonly ScenarioDefinition[],
): ScenarioDefinition | undefined {
  return scenarioList.find((scenario) => scenario.id === scenarioId);
}

export function buildScenarioInput(
  config: HouseholdConfig,
  scenarioId: string,
  scenarioList: readonly ScenarioDefinition[],
): { config: HouseholdConfig; scenario: ScenarioDefinition } {
  const scenario = getScenarioById(scenarioId, scenarioList);
  if (!scenario) {
    throw new Error(`Unknown scenario id: ${scenarioId}`);
  }
  return { config, scenario };
}

export interface ScenarioValidationIssue {
  scenarioId: ScenarioId;
  eventId?: string;
  message: string;
}

function isoDateToMonthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

/**
 * Inclusive month span between two ISO dates represented as YYYY-MM.
 */
export function getProjectionMonthSpan(
  startDateIso: string,
  endDateIso: string,
): number {
  const startParts = startDateIso.slice(0, 7).split("-").map(Number);
  const endParts = endDateIso.slice(0, 7).split("-").map(Number);
  const sy = startParts[0] ?? 0;
  const sm = startParts[1] ?? 1;
  const ey = endParts[0] ?? 0;
  const em = endParts[1] ?? 1;
  return (ey - sy) * 12 + (em - sm) + 1;
}

/**
 * Validates scenario event consistency and basic date bounds.
 */
export function validateScenarioDefinitions(
  scenarioList: ScenarioDefinition[],
): ScenarioValidationIssue[] {
  const issues: ScenarioValidationIssue[] = [];

  for (const scenario of scenarioList) {
    if (scenario.endDate < scenario.startDate) {
      issues.push({
        scenarioId: scenario.id,
        message: "endDate must be on or after startDate.",
      });
    }

    if (!scenario.assumptions.length) {
      issues.push({
        scenarioId: scenario.id,
        message: "At least one assumption is required.",
      });
    }

    for (const event of scenario.events) {
      if (event.scenarioId !== scenario.id) {
        issues.push({
          scenarioId: scenario.id,
          eventId: event.id,
          message: "Event scenarioId must match parent scenario id.",
        });
      }
      if (event.effectiveDate < scenario.startDate || event.effectiveDate > scenario.endDate) {
        issues.push({
          scenarioId: scenario.id,
          eventId: event.id,
          message: "Event effectiveDate must be within scenario start/end date bounds.",
        });
      }
      if (!event.description.trim()) {
        issues.push({
          scenarioId: scenario.id,
          eventId: event.id,
          message: "Event description must not be empty.",
        });
      }
    }

    for (const tile of scenario.tiles) {
      if (tile.validFrom < scenario.startDate || tile.validFrom > scenario.endDate) {
        issues.push({
          scenarioId: scenario.id,
          message: `Tile "${tile.name}" validFrom must be within scenario dates.`,
        });
      }
      if (
        tile.validTo !== null &&
        (tile.validTo < scenario.startDate || tile.validTo > scenario.endDate)
      ) {
        issues.push({
          scenarioId: scenario.id,
          message: `Tile "${tile.name}" validTo must be within scenario dates or null.`,
        });
      }
      if (tile.validTo !== null && tile.validTo < tile.validFrom) {
        issues.push({
          scenarioId: scenario.id,
          message: `Tile "${tile.name}" validTo must be on or after validFrom.`,
        });
      }
      if (tile.sourceKind === "recurring_row" && !(tile.sourceRef && String(tile.sourceRef).trim())) {
        issues.push({
          scenarioId: scenario.id,
          message: `Tile "${tile.name}" must pick a recurring row when linked value is “Single recurring row”.`,
        });
      }
      if (tile.sourceKind === "custom_monthly") {
        const n = tile.customMonthlyAmountSek;
        if (n == null || !Number.isFinite(n) || n < 0) {
          issues.push({
            scenarioId: scenario.id,
            message: `Tile "${tile.name}" needs a non-negative custom amount (SEK / month) when linked value is “Custom monthly amount”.`,
          });
        }
      }
    }
  }

  return issues;
}

export interface ScenarioRunInput {
  config: HouseholdConfig;
  scenarioId: ScenarioId;
  scenarios: readonly ScenarioDefinition[];
}

export interface ScenarioRunPlan {
  scenario: ScenarioDefinition;
  projectionStartMonth: string;
  projectionMonths: number;
  events: ScenarioEvent[];
}

/**
 * Builds a normalized run plan that can be passed directly to the scenario engine.
 */
export function buildScenarioRunPlan(input: ScenarioRunInput): ScenarioRunPlan {
  const scenario = getScenarioById(input.scenarioId, input.scenarios);
  if (!scenario) {
    throw new Error(`Unknown scenario id: ${input.scenarioId}`);
  }

  return {
    scenario,
    projectionStartMonth: isoDateToMonthKey(scenario.startDate),
    projectionMonths: getProjectionMonthSpan(scenario.startDate, scenario.endDate),
    events: scenario.events,
  };
}

/** Deep copy with new scenario, event, and tile ids (for Duplicate scenario). */
export function cloneScenarioDefinition(source: ScenarioDefinition): ScenarioDefinition {
  const newId = newScenarioEntityId("scenario");
  return {
    ...source,
    id: newId,
    name: `${source.name} (copy)`,
    events: source.events.map((e) => ({
      ...e,
      id: newScenarioEntityId("evt"),
      scenarioId: newId,
    })),
    tiles: source.tiles.map((t) => ({
      ...t,
      id: newScenarioEntityId("tile"),
    })),
  };
}
