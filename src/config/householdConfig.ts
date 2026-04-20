export type EmploymentMode =
  | "employed"
  | "parental_leave"
  | "unemployed"
  | "studying"
  | "self_employed";

export interface AdultProfile {
  id: "adult1" | "adult2";
  label: string;
  monthlyBruttoIncomeSek: number;
  annualSgiSek: number;
  isAkassaMember: boolean;
  employmentMode: EmploymentMode;
  workingPercentage: number;
}

export interface ChildInvestmentAllocation {
  indexFundPct: number;
  amfShortRatePct: number;
  amfLongRatePct: number;
}

export interface ChildProfile {
  id: "child1" | "child2";
  /** Display name; persisted in `app_household_config.config` JSON (Supabase). */
  label: string;
  birthDate: string;
  monthlyBarnbidragSek: number;
  investmentAllocation: ChildInvestmentAllocation;
}

export type LoanRateType = "fixed" | "floating";

export interface LoanConfig {
  id: "loan1" | "loan2" | "loan3";
  label: string;
  principalSek: number;
  annualInterestRatePct: number;
  rateType: LoanRateType;
  fixedRateExpiryDate: string | null;
}

export interface MonthlyFixedCosts {
  brfAvgiftSek: number;
  heatingSek: number;
  electricitySek: number;
  fundContributionJune80Sek: number;
  fundContributionJune40Sek: number;
}

export interface MonthlyVariableCosts {
  adult1HouseholdEnvelopeSek: number;
  adult2HouseholdEnvelopeSek: number;
}

export interface HouseConfig {
  purchasePriceSek: number;
  currentEstimatedValueSek: number;
}

export interface HouseholdConfig {
  householdId: string;
  transitionDate: string;
  adults: [AdultProfile, AdultProfile];
  children: [ChildProfile, ChildProfile];
  loans: [LoanConfig, LoanConfig, LoanConfig];
  monthlyFixedCosts: MonthlyFixedCosts;
  monthlyVariableCosts: MonthlyVariableCosts;
  house: HouseConfig;
  /** Optional company / sole trader monthly cash estimate in SEK; 0 if unused. */
  companyTypologyMonthlyEstimateSek: number;
}

export interface HouseMetrics {
  totalLoanPrincipalSek: number;
  ltvRatio: number;
}

export const defaultHouseholdConfig: HouseholdConfig = {
  householdId: "demo-household-se-001",
  transitionDate: "2026-01-01",
  adults: [
    {
      id: "adult1",
      label: "Adult 1",
      monthlyBruttoIncomeSek: 0,
      annualSgiSek: 480000,
      isAkassaMember: true,
      employmentMode: "parental_leave",
      workingPercentage: 50,
    },
    {
      id: "adult2",
      label: "Adult 2",
      monthlyBruttoIncomeSek: 63250,
      annualSgiSek: 607200,
      isAkassaMember: true,
      employmentMode: "employed",
      workingPercentage: 80,
    },
  ],
  children: [
    {
      id: "child1",
      label: "Child 1",
      birthDate: "2024-02-11",
      monthlyBarnbidragSek: 1250,
      investmentAllocation: {
        indexFundPct: 80,
        amfShortRatePct: 10,
        amfLongRatePct: 10,
      },
    },
    {
      id: "child2",
      label: "Child 2",
      birthDate: "2025-10-03",
      monthlyBarnbidragSek: 1250,
      investmentAllocation: {
        indexFundPct: 80,
        amfShortRatePct: 10,
        amfLongRatePct: 10,
      },
    },
  ],
  loans: [
    {
      id: "loan1",
      label: "Bolån Fast Hypotek",
      principalSek: 1016500,
      annualInterestRatePct: 3.74,
      rateType: "fixed",
      fixedRateExpiryDate: "2027-11-30",
    },
    {
      id: "loan2",
      label: "Bolån Fast Hypotek",
      principalSek: 750000,
      annualInterestRatePct: 4.08,
      rateType: "fixed",
      fixedRateExpiryDate: "2028-03-31",
    },
    {
      id: "loan3",
      label: "Bolån Prem Hypotek",
      principalSek: 266500,
      annualInterestRatePct: 4.89,
      rateType: "floating",
      fixedRateExpiryDate: null,
    },
  ],
  monthlyFixedCosts: {
    brfAvgiftSek: 6250,
    heatingSek: 1150,
    electricitySek: 980,
    fundContributionJune80Sek: 2500,
    fundContributionJune40Sek: 1500,
  },
  monthlyVariableCosts: {
    adult1HouseholdEnvelopeSek: 5200,
    adult2HouseholdEnvelopeSek: 5200,
  },
  house: {
    purchasePriceSek: 3950000,
    currentEstimatedValueSek: 4750000,
  },
  companyTypologyMonthlyEstimateSek: 0,
};

function envTrimmed(key: string): string | undefined {
  const raw = (import.meta.env as Record<string, string | undefined> | undefined)?.[key];
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

/**
 * Source of household values. In production this should be hydrated from .env
 * defaults and then overridden by a Supabase profile row.
 */
export function getHouseholdConfig(): HouseholdConfig {
  const d = defaultHouseholdConfig;
  const transitionDateFromEnv = envTrimmed("VITE_TRANSITION_DATE") ?? d.transitionDate;

  return {
    ...d,
    transitionDate: transitionDateFromEnv,
    adults: [
      { ...d.adults[0], label: envTrimmed("VITE_ADULT_1_LABEL") ?? d.adults[0].label },
      { ...d.adults[1], label: envTrimmed("VITE_ADULT_2_LABEL") ?? d.adults[1].label },
    ],
    children: [
      { ...d.children[0], label: envTrimmed("VITE_CHILD_1_LABEL") ?? d.children[0].label },
      { ...d.children[1], label: envTrimmed("VITE_CHILD_2_LABEL") ?? d.children[1].label },
    ],
  };
}

/** Merge persisted household JSON onto defaults (stable tuples, new fields). */
export function normalizeHouseholdFromRemote(
  remote: Partial<HouseholdConfig> | HouseholdConfig,
): HouseholdConfig {
  const d = defaultHouseholdConfig;
  const loansOk =
    Array.isArray(remote.loans) && remote.loans.length === 3
      ? (remote.loans as HouseholdConfig["loans"])
      : d.loans;
  return {
    ...d,
    ...remote,
    householdId: remote.householdId ?? d.householdId,
    transitionDate: remote.transitionDate ?? d.transitionDate,
    adults: [
      { ...d.adults[0], ...remote.adults?.[0], id: "adult1" },
      { ...d.adults[1], ...remote.adults?.[1], id: "adult2" },
    ],
    children: [
      {
        ...d.children[0],
        ...remote.children?.[0],
        id: "child1",
        label: (() => {
          const raw = remote.children?.[0]?.label;
          if (typeof raw === "string" && raw.trim()) return raw.trim();
          return d.children[0].label;
        })(),
      },
      {
        ...d.children[1],
        ...remote.children?.[1],
        id: "child2",
        label: (() => {
          const raw = remote.children?.[1]?.label;
          if (typeof raw === "string" && raw.trim()) return raw.trim();
          return d.children[1].label;
        })(),
      },
    ],
    loans: loansOk,
    monthlyFixedCosts: { ...d.monthlyFixedCosts, ...remote.monthlyFixedCosts },
    monthlyVariableCosts: { ...d.monthlyVariableCosts, ...remote.monthlyVariableCosts },
    house: { ...d.house, ...remote.house },
    companyTypologyMonthlyEstimateSek:
      remote.companyTypologyMonthlyEstimateSek ?? d.companyTypologyMonthlyEstimateSek,
  };
}

export function getHouseMetrics(config: HouseholdConfig): HouseMetrics {
  const totalLoanPrincipalSek = config.loans.reduce(
    (sum, loan) => sum + loan.principalSek,
    0,
  );

  const ltvRatio =
    config.house.currentEstimatedValueSek > 0
      ? totalLoanPrincipalSek / config.house.currentEstimatedValueSek
      : 0;

  return {
    totalLoanPrincipalSek,
    ltvRatio,
  };
}
