import type {
  Household, Entity, Account, Period, PeriodDayOverride,
  Cashflow, Loan, Benefit, Transaction, TaxProfile,
  ProjectionScenario, UserCardLayout,
} from "@/types/schema";

export interface BackendAdapter {
  /* ── Household ── */
  getHousehold(id: string): Promise<Household | null>;
  getHouseholdForUser(userId: string): Promise<Household | null>;
  upsertHousehold(h: Partial<Household> & { id: string }): Promise<Household>;

  /* ── Entities ── */
  listEntities(householdId: string): Promise<Entity[]>;
  upsertEntity(e: Partial<Entity> & { id: string; household_id: string }): Promise<Entity>;
  archiveEntity(id: string): Promise<void>;

  /* ── Accounts ── */
  listAccounts(householdId: string): Promise<Account[]>;
  upsertAccount(a: Partial<Account> & { id: string; entity_id: string }): Promise<Account>;
  archiveAccount(id: string): Promise<void>;

  /* ── Periods ── */
  listPeriods(householdId: string): Promise<Period[]>;
  upsertPeriod(p: Partial<Period> & { id: string; entity_id: string }): Promise<Period>;
  archivePeriod(id: string): Promise<void>;

  /* ── Day overrides ── */
  listDayOverrides(periodId: string): Promise<PeriodDayOverride[]>;
  upsertDayOverride(o: Partial<PeriodDayOverride> & { id: string }): Promise<PeriodDayOverride>;
  deleteDayOverride(id: string): Promise<void>;

  /* ── Cashflows ── */
  listCashflows(householdId: string): Promise<Cashflow[]>;
  upsertCashflow(c: Partial<Cashflow> & { id: string; entity_id: string }): Promise<Cashflow>;
  archiveCashflow(id: string): Promise<void>;

  /* ── Loans ── */
  listLoans(householdId: string): Promise<Loan[]>;
  upsertLoan(l: Partial<Loan> & { id: string; account_id: string }): Promise<Loan>;

  /* ── Benefits ── */
  listBenefits(householdId: string): Promise<Benefit[]>;
  upsertBenefit(b: Partial<Benefit> & { id: string; entity_id: string }): Promise<Benefit>;
  archiveBenefit(id: string): Promise<void>;

  /* ── Transactions ── */
  listTransactions(accountId: string, opts?: { limit?: number; offset?: number }): Promise<Transaction[]>;
  /** All transactions for accounts in this household (any page size — use sparingly in UI). */
  listTransactionsForHousehold(householdId: string): Promise<Transaction[]>;
  insertTransactions(txs: Omit<Transaction, "created_at">[]): Promise<number>;

  /* ── Tax profiles ── */
  getTaxProfile(entityId: string, year: number): Promise<TaxProfile | null>;
  upsertTaxProfile(t: Partial<TaxProfile> & { id: string; entity_id: string }): Promise<TaxProfile>;

  /* ── Scenarios ── */
  listScenarios(householdId: string): Promise<ProjectionScenario[]>;
  upsertScenario(s: Partial<ProjectionScenario> & { id: string; household_id: string }): Promise<ProjectionScenario>;
  deleteScenario(id: string): Promise<void>;

  /* ── Card layout ── */
  getCardLayout(userId: string, tab: string): Promise<UserCardLayout | null>;
  saveCardLayout(layout: UserCardLayout): Promise<void>;
}
