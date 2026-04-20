/**
 * Per–dashboard-card surface styling (mixed light/dark/tinted bento tiles).
 * Defaults favour a “wallet app” style mix: mostly light cards, one–two dark heroes.
 */

export const BENTO_CARD_SURFACE_THEMES = [
  "light",
  "dark",
  "slate",
  "ocean",
  "rose",
] as const;

export type BentoCardSurfaceTheme = (typeof BENTO_CARD_SURFACE_THEMES)[number];

export type BentoCardSurfaceId =
  | "sticky_header"
  | "trend_chart"
  | "health_barometer"
  | "health_pain_points"
  | "health_snapshot"
  | "health_modeled"
  | "household_snapshot"
  | "adult_company_editor"
  | "household_planning_calendar"
  | "household_planning_fk_reference"
  | "household_planning_pension_reference"
  | "bank_accounts"
  | "recurring_flows"
  | "property_leverage"
  | "loans_table"
  | "scenario_trend_chart"
  | "scenario_selector"
  | "scenario_kpi_current_net"
  | "scenario_kpi_cumulative"
  | "scenario_kpi_worst"
  | "scenario_kpi_runway"
  | "scenario_simulate_expense"
  | "scenario_monthly_projection";

export const BENTO_CARD_SURFACE_IDS: BentoCardSurfaceId[] = [
  "sticky_header",
  "trend_chart",
  "health_barometer",
  "health_pain_points",
  "health_snapshot",
  "health_modeled",
  "household_snapshot",
  "adult_company_editor",
  "household_planning_calendar",
  "household_planning_fk_reference",
  "household_planning_pension_reference",
  "bank_accounts",
  "recurring_flows",
  "property_leverage",
  "loans_table",
  "scenario_trend_chart",
  "scenario_selector",
  "scenario_kpi_current_net",
  "scenario_kpi_cumulative",
  "scenario_kpi_worst",
  "scenario_kpi_runway",
  "scenario_simulate_expense",
  "scenario_monthly_projection",
];

export const BENTO_CARD_SURFACE_LABELS: Record<BentoCardSurfaceId, string> = {
  sticky_header: "Sticky header (Financial Dashboard)",
  trend_chart: "Current finances — trend chart",
  health_barometer: "Health — household barometer",
  health_pain_points: "Health — pain points",
  health_snapshot: "Health — monthly snapshot",
  health_modeled: "Health — modeled cash flow",
  household_snapshot: "Current household snapshot",
  adult_company_editor: "Adult + company editor",
  household_planning_calendar: "Leave & work calendar",
  household_planning_fk_reference: "Planning — Försäkringskassan reference",
  household_planning_pension_reference: "Planning — pension reference",
  bank_accounts: "All bank accounts",
  recurring_flows: "Recurring cash flows",
  property_leverage: "Property & leverage",
  loans_table: "Loans table",
  scenario_trend_chart: "Scenarios — trend chart",
  scenario_selector: "Scenarios — scenario picker",
  scenario_kpi_current_net: "Scenarios — KPI current net",
  scenario_kpi_cumulative: "Scenarios — KPI cumulative",
  scenario_kpi_worst: "Scenarios — KPI worst month",
  scenario_kpi_runway: "Scenarios — KPI liquidity runway",
  scenario_simulate_expense: "Scenarios — simulate expense",
  scenario_monthly_projection: "Scenarios — monthly projection table",
};

export type BentoSurfacePresetId = "default_mix" | "all_light" | "soft_muted" | "vivid_accents";

export const BENTO_SURFACE_PRESET_LABELS: Record<BentoSurfacePresetId, string> = {
  default_mix: "Default mix (dark hero tiles + ocean current chart + dark scenario chart)",
  all_light: "All light (uniform)",
  soft_muted: "Soft muted (slate / ocean accents)",
  vivid_accents: "Vivid accents (rose / ocean highlights)",
};

function allLight(): Record<BentoCardSurfaceId, BentoCardSurfaceTheme> {
  return Object.fromEntries(
    BENTO_CARD_SURFACE_IDS.map((id) => [id, "light" satisfies BentoCardSurfaceTheme]),
  ) as Record<BentoCardSurfaceId, BentoCardSurfaceTheme>;
}

/** Baseline map: every card light; presets overlay selective tiles. */
export const DEFAULT_BENTO_SURFACE_MAP: Record<BentoCardSurfaceId, BentoCardSurfaceTheme> =
  allLight();

/** Shipped default selection (mixed bento). */
export const DEFAULT_MIX_SURFACE_OVERRIDES: Partial<
  Record<BentoCardSurfaceId, BentoCardSurfaceTheme>
> = {
  health_barometer: "dark",
  household_snapshot: "dark",
  trend_chart: "ocean",
  scenario_trend_chart: "dark",
};

export function buildDefaultMixMap(): Record<BentoCardSurfaceId, BentoCardSurfaceTheme> {
  return { ...DEFAULT_BENTO_SURFACE_MAP, ...DEFAULT_MIX_SURFACE_OVERRIDES };
}

export const BENTO_SURFACE_PRESETS: Record<
  BentoSurfacePresetId,
  Partial<Record<BentoCardSurfaceId, BentoCardSurfaceTheme>>
> = {
  default_mix: DEFAULT_MIX_SURFACE_OVERRIDES,
  all_light: {},
  soft_muted: {
    trend_chart: "slate",
    health_barometer: "slate",
    household_snapshot: "ocean",
    bank_accounts: "slate",
    scenario_selector: "slate",
  },
  vivid_accents: {
    health_barometer: "rose",
    household_snapshot: "ocean",
    recurring_flows: "slate",
    scenario_kpi_worst: "rose",
  },
};

export function applyBentoSurfacePreset(
  presetId: BentoSurfacePresetId,
): Record<BentoCardSurfaceId, BentoCardSurfaceTheme> {
  const base = allLight();
  const patch = BENTO_SURFACE_PRESETS[presetId];
  return { ...base, ...patch };
}
