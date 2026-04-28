export interface MonthlyProjection {
  month: string;
  entity_id: string;
  gross_income: number;
  tax: number;
  net_income: number;
  total_expenses: number;
  loan_repayments: number;
  benefits: number;
  surplus: number;
  cumulative_surplus: number;
  active_days: number;
  working_days: number;
  income_breakdown: IncomeBreakdownItem[];
  expense_breakdown: ExpenseBreakdownItem[];
}

export interface IncomeBreakdownItem {
  cashflow_id: string;
  name: string;
  category: string;
  gross: number;
  net: number;
}

export interface ExpenseBreakdownItem {
  cashflow_id: string;
  name: string;
  category: string;
  amount: number;
}

export interface HouseholdProjection {
  months: MonthlyProjection[];
  totals: {
    gross_income: number;
    net_income: number;
    total_expenses: number;
    surplus: number;
  };
}

export interface AmortizationRow {
  month: number;
  date: string;
  opening_balance: number;
  interest: number;
  principal_payment: number;
  total_payment: number;
  closing_balance: number;
}
