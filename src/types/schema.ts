export type EntityType = "adult" | "child" | "company";
export type AccountType = "bank" | "savings" | "investment" | "loan" | "pension" | "credit";
export type PeriodType =
  | "employed" | "self_employed" | "parental_leave" | "unemployed"
  | "unpaid_leave" | "sick_leave" | "daycare" | "home" | "school" | "preschool";
export type CashflowDirection = "income" | "expense";
export type CashflowCategory =
  | "salary" | "dividend" | "freelance" | "rent" | "mortgage" | "childcare"
  | "groceries" | "transport" | "insurance" | "subscription" | "utility"
  | "loan_repayment" | "savings_transfer" | "other";
export type Frequency = "daily" | "weekly" | "biweekly" | "monthly" | "quarterly" | "annually" | "one_off";
export type BenefitType =
  | "parental_leave_pay" | "unemployment_benefit" | "child_benefit"
  | "housing_allowance" | "sickness_benefit" | "pension_supplement" | "other";
export type BenefitSource = "computed" | "csv_import" | "manual";
export type LoanType = "mortgage" | "car" | "student" | "personal" | "other";
export type RateType = "fixed" | "floating";
export type AmortizationType = "annuity" | "straight_line" | "interest_only" | "custom";
export type TaxMethod = "flat_rate" | "brackets";
export type OverrideType = "active" | "inactive";
export type OverrideReason = "public_holiday" | "sick" | "vacation" | "ad_hoc" | "other";

export interface WeeklyPattern {
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
}

export interface Household {
  id: string;
  name: string;
  currency: string;
  country: string;
  created_at: string;
  updated_at: string;
}

export interface Entity {
  id: string;
  household_id: string;
  type: EntityType;
  name: string;
  birth_date: string | null;
  tax_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface Account {
  id: string;
  entity_id: string;
  type: AccountType;
  name: string;
  iban: string | null;
  currency: string;
  balance_snapshot: number;
  balance_snapshot_date: string | null;
  bank_name: string | null;
  csv_parser_config_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface Period {
  id: string;
  entity_id: string;
  type: PeriodType;
  date_from: string;
  date_to: string | null;
  pct_fte: number | null;
  weekly_pattern: WeeklyPattern | null;
  employer_entity_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface PeriodDayOverride {
  id: string;
  period_id: string;
  entity_id: string;
  date: string;
  override_type: OverrideType;
  reason: OverrideReason | null;
  notes: string | null;
  created_at: string;
}

export interface Cashflow {
  id: string;
  entity_id: string;
  account_id: string | null;
  direction: CashflowDirection;
  category: CashflowCategory;
  name: string;
  amount: number;
  currency: string;
  frequency: Frequency;
  date_from: string;
  date_to: string | null;
  is_gross: boolean;
  tax_rate_override: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface Loan {
  id: string;
  account_id: string;
  name: string;
  type: LoanType;
  rate_type: RateType;
  principal: number;
  outstanding: number;
  interest_rate: number;
  rate_index: string | null;
  rate_margin: number | null;
  rate_fixed_until: string | null;
  amortization_type: AmortizationType;
  monthly_payment: number | null;
  start_date: string;
  end_date: string | null;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface Benefit {
  id: string;
  entity_id: string;
  period_id: string | null;
  type: BenefitType;
  source: BenefitSource;
  amount: number;
  currency: string;
  frequency: "daily" | "weekly" | "monthly" | "one_off";
  date_from: string;
  date_to: string | null;
  is_taxable: boolean;
  notes: string | null;
  import_batch_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface Transaction {
  id: string;
  account_id: string;
  import_batch_id: string | null;
  date: string;
  amount: number;
  currency: string;
  description: string;
  category: string | null;
  cashflow_id: string | null;
  is_reviewed: boolean;
  notes: string | null;
  created_at: string;
}

export interface TaxProfile {
  id: string;
  entity_id: string;
  year: number;
  method: TaxMethod;
  flat_rate: number | null;
  brackets: { from: number; to: number | null; rate: number }[] | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectionScenario {
  id: string;
  household_id: string;
  name: string;
  description: string | null;
  is_baseline: boolean;
  period_overrides: {
    entity_id: string;
    type: string;
    date_from: string;
    date_to: string | null;
    pct_fte: number | null;
  }[];
  assumption_overrides: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type CardSize = "mini" | "small" | "medium" | "large" | "full";

export interface CardLayoutEntry {
  card_id: string;
  size: CardSize;
  order: number;
  visible: boolean;
}

export interface UserCardLayout {
  id: string;
  user_id: string;
  tab: string;
  cards: CardLayoutEntry[];
  updated_at: string;
}
