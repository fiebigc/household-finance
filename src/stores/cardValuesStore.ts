import { create } from "zustand";

const LS_KEY = "fin:card-values-v1";

export interface ParentalLeaveCardRow {
  available: number;
  used: number;
  adultUsed: Record<string, number>;
  benefitLevel: number;
}

export interface GaugePair {
  available: number;
  used: number;
}

export interface CardValuesForHousehold {
  overview: {
    /** Fraction per month applied to snapshot for chart (0 = flat). */
    accountBalanceMonthlyDrift: number;
    /** 0 = same income/expense each month on cashflow bar. */
    cashflowBarSpreadPct: number;
  };
  planning: {
    parentalByChild: Record<string, ParentalLeaveCardRow>;
    unemploymentByAdult: Record<string, GaugePair>;
    holidayByAdult: Record<string, GaugePair>;
  };
  expenses: {
    /** 0 = flat monthly total on trend chart. */
    trendSpreadPct: number;
    /** Empty = default label "Renovation projects" on the Expenses import card. */
    renovationImportCardTitleOverride: string;
    /** Fallback date for CSV rows without a parsed date; null = use calendar today until user picks one. */
    renovationImportDefaultDateYmd: string | null;
  };
  retirement: {
    pensionAnnualGrowthRate: number;
    pensionStartingMonthlyByAdult: Record<string, number>;
    fireSavingsOverride: number | null;
    leavePensionGapPerMonth: number;
    netWorthAnnualAssetGrowth: number;
    /** Applied as debt *= factor each year (1 = unchanged). */
    netWorthAnnualDebtFactor: number;
  };
}

export function defaultCardValues(): CardValuesForHousehold {
  return {
    overview: { accountBalanceMonthlyDrift: 0, cashflowBarSpreadPct: 0 },
    planning: { parentalByChild: {}, unemploymentByAdult: {}, holidayByAdult: {} },
    expenses: {
      trendSpreadPct: 0,
      renovationImportCardTitleOverride: "",
      renovationImportDefaultDateYmd: null,
    },
    retirement: {
      pensionAnnualGrowthRate: 0,
      pensionStartingMonthlyByAdult: {},
      fireSavingsOverride: null,
      leavePensionGapPerMonth: 0,
      netWorthAnnualAssetGrowth: 0,
      netWorthAnnualDebtFactor: 1,
    },
  };
}

function load(): Record<string, CardValuesForHousehold> {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, CardValuesForHousehold>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function persist(byHousehold: Record<string, CardValuesForHousehold>) {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(LS_KEY, JSON.stringify(byHousehold));
  } catch {
    /* ignore */
  }
}

function mergeParentalRow(r: Partial<ParentalLeaveCardRow> | undefined): ParentalLeaveCardRow {
  return {
    available: typeof r?.available === "number" && Number.isFinite(r.available) ? r.available : 0,
    used: typeof r?.used === "number" && Number.isFinite(r.used) ? r.used : 0,
    adultUsed: r?.adultUsed && typeof r.adultUsed === "object" ? { ...r.adultUsed } : {},
    benefitLevel: typeof r?.benefitLevel === "number" && Number.isFinite(r.benefitLevel) ? r.benefitLevel : 0,
  };
}

function mergeGaugePair(p: Partial<GaugePair> | undefined): GaugePair {
  return {
    available: typeof p?.available === "number" && Number.isFinite(p.available) ? p.available : 0,
    used: typeof p?.used === "number" && Number.isFinite(p.used) ? p.used : 0,
  };
}

function mergeDefaults(stored: Partial<CardValuesForHousehold> | undefined): CardValuesForHousehold {
  const d = defaultCardValues();
  if (!stored) return d;

  const parental: Record<string, ParentalLeaveCardRow> = {};
  const rawP = stored.planning?.parentalByChild;
  if (rawP && typeof rawP === "object") {
    for (const [k, v] of Object.entries(rawP)) {
      parental[k] = mergeParentalRow(v as Partial<ParentalLeaveCardRow>);
    }
  }

  const unemp: Record<string, GaugePair> = {};
  const rawU = stored.planning?.unemploymentByAdult;
  if (rawU && typeof rawU === "object") {
    for (const [k, v] of Object.entries(rawU)) {
      unemp[k] = mergeGaugePair(v as Partial<GaugePair>);
    }
  }

  const hol: Record<string, GaugePair> = {};
  const rawH = stored.planning?.holidayByAdult;
  if (rawH && typeof rawH === "object") {
    for (const [k, v] of Object.entries(rawH)) {
      hol[k] = mergeGaugePair(v as Partial<GaugePair>);
    }
  }

  const pensionAdult: Record<string, number> = {
    ...d.retirement.pensionStartingMonthlyByAdult,
    ...(stored.retirement?.pensionStartingMonthlyByAdult &&
    typeof stored.retirement.pensionStartingMonthlyByAdult === "object"
      ? stored.retirement.pensionStartingMonthlyByAdult
      : {}),
  };

  return {
    overview: { ...d.overview, ...stored.overview },
    planning: { parentalByChild: parental, unemploymentByAdult: unemp, holidayByAdult: hol },
    expenses: { ...d.expenses, ...stored.expenses },
    retirement: {
      ...d.retirement,
      ...stored.retirement,
      pensionStartingMonthlyByAdult: pensionAdult,
      fireSavingsOverride:
        stored.retirement && "fireSavingsOverride" in stored.retirement
          ? stored.retirement.fireSavingsOverride
          : d.retirement.fireSavingsOverride,
    },
  };
}

interface CardValuesState {
  byHousehold: Record<string, CardValuesForHousehold>;
  ensureHousehold: (householdId: string) => void;
  updateHousehold: (householdId: string, fn: (prev: CardValuesForHousehold) => CardValuesForHousehold) => void;
}

export const useCardValuesStore = create<CardValuesState>((set, get) => ({
  byHousehold: load(),

  ensureHousehold: (householdId) => {
    const cur = get().byHousehold[householdId];
    if (cur) return;
    const byHousehold = { ...get().byHousehold, [householdId]: defaultCardValues() };
    persist(byHousehold);
    set({ byHousehold });
  },

  updateHousehold: (householdId, fn) => {
    const prev = mergeDefaults(get().byHousehold[householdId]);
    const next = fn(prev);
    const byHousehold = { ...get().byHousehold, [householdId]: next };
    persist(byHousehold);
    set({ byHousehold });
  },
}));

export function getMergedCardValues(householdId: string | null | undefined): CardValuesForHousehold {
  if (!householdId) return defaultCardValues();
  const raw = useCardValuesStore.getState().byHousehold[householdId];
  return mergeDefaults(raw);
}

/**
 * Deep-merge a partial patch into stored values for one household (used by demo hydrate).
 */
export function patchHouseholdCardValues(householdId: string, patch: Partial<CardValuesForHousehold>): void {
  useCardValuesStore.getState().updateHousehold(householdId, (prev) => {
    const base = mergeDefaults(prev);
    const pPlan = patch.planning;
    return mergeDefaults({
      ...base,
      ...patch,
      overview: patch.overview ? { ...base.overview, ...patch.overview } : base.overview,
      planning: pPlan
        ? {
            ...base.planning,
            ...pPlan,
            parentalByChild: { ...base.planning.parentalByChild, ...pPlan.parentalByChild },
            unemploymentByAdult: { ...base.planning.unemploymentByAdult, ...pPlan.unemploymentByAdult },
            holidayByAdult: { ...base.planning.holidayByAdult, ...pPlan.holidayByAdult },
          }
        : base.planning,
      expenses: patch.expenses ? { ...base.expenses, ...patch.expenses } : base.expenses,
      retirement: patch.retirement
        ? {
            ...base.retirement,
            ...patch.retirement,
            pensionStartingMonthlyByAdult: {
              ...base.retirement.pensionStartingMonthlyByAdult,
              ...patch.retirement.pensionStartingMonthlyByAdult,
            },
          }
        : base.retirement,
    });
  });
}
