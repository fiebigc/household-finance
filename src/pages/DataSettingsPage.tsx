import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  type DragEvent,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { BentoGrid, type BentoCardDefinition } from "@/components/BentoGrid";
import { Card } from "@/components/ui/BentoCard";
import { useAppStore } from "@/stores/appStore";
import { useBackend } from "@/hooks/useBackend";
import { useProjection } from "@/hooks/useProjection";
import type { IncomeBreakdownItem } from "@/types/engine";
import { formatSEK, cn } from "@/lib/utils";
import {
  Users, Wallet, ArrowDownUp, Building2, Plus, Archive,
  Upload, ChevronDown, ChevronUp, Pencil, Check, X, GripVertical,
} from "lucide-react";
import type {
  Entity, EntityType, Account, AccountType, Cashflow, CashflowDirection, CashflowCategory, Frequency,
  Household,
  LoanType, RateType, AmortizationType, Loan, CardSize,
} from "@/types/schema";
import {
  accountVisibleForEntity,
  accountsVisibleForHouseholdCashflowRouting,
  isSharedAccount,
  isPersonalAccountForEntity,
  labelAccountForCashflowLeg,
  readSharedMeta,
} from "@/utils/accountShared";
import {
  formatCashflowAccountRoute,
  formatAccountLegPair,
  hasCashflowBothHouseholdLegs,
  primaryCashflowAccountId,
  resolveCashflowAccountLegs,
  cashflowContributesToPnLTotals,
} from "@/utils/cashflowAccounts";
import {
  employmentIncomeInactiveForUi,
  employmentIncomeShownInCashflowsManager,
} from "@/utils/cashflowEmployment";
import {
  buildCashflowIncomeMetadata,
  cashflowIncomeInternalHideFromFlow,
  cashflowExcludedFromHouseholdTotals,
} from "@/utils/cashflowIncomeVisibility";
import { FinanceFlowSankeyDiagram, FinanceFlowSankeyLegendButton } from "@/components/FinanceFlowSankey";
import {
  detectRecurringFromTransactions,
  normalizeRecurringImportLabel,
  type RecurringTxPattern,
} from "@/utils/recurringFromTransactions";
import { startOfMonth, endOfMonth } from "date-fns";
import { displayedNetMonthlyIncomeForCashflow } from "@/utils/incomeCashflowDisplayed";
import { cashflowMonthlyAmount } from "@/utils/incomeCashflowMonth";
import type { ModeledParentalBenefitRouting } from "@/utils/modeledParentalBenefitRouting";
import {
  MODELED_PARENTAL_BENEFIT_ROUTING_META,
  mergeModeledParentalBenefitRouting,
  readModeledParentalBenefitRouting,
} from "@/utils/modeledParentalBenefitRouting";
import { CsvImportModal } from "@/components/CsvImportModal";
import { isCsvImportEligibleAccount } from "@/utils/csvImportEligible";
import { parseLoanSetupCsv, type ParsedLoanSetupRow } from "@/utils/loanSetupCsv";
import { OpenCsvImportContext, useOpenCsvImport } from "@/context/OpenCsvImportContext";

const IMPORT_PATTERN_MIME = "application/x-household-finance-import-pattern";

/** Prefer linked bank account for inferred recurring patterns after import (in/out leg). */
function presetAccountForCashflowCsvImport(c: Cashflow | null, accts: Account[]): string | null {
  if (!c) return null;
  const eligibleIds = new Set(accts.filter((a) => isCsvImportEligibleAccount(a)).map((a) => a.id));
  const legs = resolveCashflowAccountLegs(c);
  const prefer = c.direction === "income" ? legs.toId : legs.fromId;
  for (const id of [prefer, legs.fromId, legs.toId]) {
    if (id && eligibleIds.has(id)) return id;
  }
  return null;
}

/** Persists on entity.metadata — drives Finance Flow routing for projection-only FK income. */
function ModeledParentalBenefitRoutingFields({
  entity,
  entities,
  accounts,
  routingAccounts,
  household,
  disabled,
  onPersist,
}: {
  entity: Entity;
  entities: Entity[];
  accounts: Account[];
  routingAccounts: Account[];
  household: Household | null;
  disabled?: boolean;
  onPersist: (entity: Entity, routing: ModeledParentalBenefitRouting) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const r = readModeledParentalBenefitRouting(entity.metadata);

  return (
    <div className="relative mt-2 rounded-md px-1 py-1 -mx-0.5 min-w-0 group/fk-route focus-within:ring-1 focus-within:ring-ring">
      <div
        className={cn(
          "flex shrink-0 items-center gap-0.5 absolute top-0 right-0 z-[1] rounded-md bg-card/95 px-0.5 py-0.5 border border-border/50 shadow-sm transition-opacity",
          editing
            ? "opacity-100"
            : "opacity-100 sm:opacity-0 sm:pointer-events-none sm:group-hover/fk-route:opacity-100 sm:group-hover/fk-route:pointer-events-auto sm:group-focus-within/fk-route:opacity-100 sm:group-focus-within/fk-route:pointer-events-auto",
        )}
      >
        {!editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={disabled}
            title="Edit deposit route"
            aria-label="Edit modeled föräldrapenning deposit route"
            className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-card-foreground transition-colors disabled:opacity-50"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={disabled}
            title="Done"
            aria-label="Done editing deposit route"
            className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-card-foreground transition-colors disabled:opacity-50"
          >
            <Check className="w-3.5 h-3.5 text-income" />
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-1.5 pt-0.5 pr-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="space-y-0.5 min-w-0">
              <span className="text-[10px] text-muted-foreground">From</span>
              <select
                className="w-full min-w-0 px-2 py-1 rounded-md bg-background border border-border text-[10px]"
                disabled={disabled || !household || routingAccounts.length === 0}
                value={r.from_account_id ?? ""}
                onChange={(ev) =>
                  void onPersist(entity, { ...r, from_account_id: ev.target.value || null })
                }
              >
                <option value="">Outside household</option>
                {routingAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {labelAccountForCashflowLeg(a, entities)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-0.5 min-w-0">
              <span className="text-[10px] text-muted-foreground">To</span>
              <select
                className="w-full min-w-0 px-2 py-1 rounded-md bg-background border border-border text-[10px]"
                disabled={disabled || !household || routingAccounts.length === 0}
                value={r.to_account_id ?? ""}
                onChange={(ev) =>
                  void onPersist(entity, { ...r, to_account_id: ev.target.value || null })
                }
              >
                <option value="">Outside household</option>
                {routingAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {labelAccountForCashflowLeg(a, entities)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p
            className="text-[10px] text-muted-foreground/90 truncate tabular-nums"
            title={formatAccountLegPair(r.from_account_id, r.to_account_id, accounts)}
          >
            {formatAccountLegPair(r.from_account_id, r.to_account_id, accounts)}
          </p>
        </div>
      ) : (
        <p
          className="text-[10px] text-muted-foreground/90 truncate tabular-nums pr-8 pt-0.5"
          title={formatAccountLegPair(r.from_account_id, r.to_account_id, accounts)}
        >
          {formatAccountLegPair(r.from_account_id, r.to_account_id, accounts)}
        </p>
      )}
    </div>
  );
}

/** Parental-benefit line emitted by `computeProjection` when period is parental leave (Sweden). */
function parentalLeaveBenefitFromProjection(row: {
  income_breakdown: IncomeBreakdownItem[];
} | undefined): IncomeBreakdownItem | null {
  if (!row) return null;
  return (
    row.income_breakdown.find(
      (i) =>
        i.cashflow_id.startsWith("benefit:parental_leave:") ||
        i.name === "Föräldrapenning",
    ) ?? null
  );
}

/** Labels for editing income streams; value must stay a CashflowCategory. */
const INCOME_CASHFLOW_CATEGORY_OPTIONS: { value: CashflowCategory; label: string }[] = [
  { value: "salary", label: "Salary" },
  { value: "dividend", label: "Dividend" },
  { value: "freelance", label: "Freelance" },
  { value: "other", label: "Other (e.g. barnbidrag)" },
  { value: "rent", label: "Rent" },
  { value: "mortgage", label: "Mortgage" },
  { value: "childcare", label: "Childcare" },
  { value: "groceries", label: "Groceries" },
  { value: "transport", label: "Transport" },
  { value: "insurance", label: "Insurance" },
  { value: "subscription", label: "Subscription" },
  { value: "utility", label: "Utility" },
  { value: "loan_repayment", label: "Loan repayment" },
  { value: "savings_transfer", label: "Savings transfer" },
];

/** Salary/freelance only; other categories clear employment window columns on save. */
function employmentWindowForCategory(
  category: CashflowCategory,
  direction: CashflowDirection,
  fromStr: string,
  untilStr: string,
): { employment_active_from: string | null; employment_active_until: string | null } {
  if (direction !== "income" || (category !== "salary" && category !== "freelance")) {
    return { employment_active_from: null, employment_active_until: null };
  }
  const from = fromStr.trim();
  const until = untilStr.trim();
  return {
    employment_active_from: from ? from : null,
    employment_active_until: until ? until : null,
  };
}

function ImportPatternDragRow({
  pattern,
  amountClassName,
}: {
  pattern: RecurringTxPattern;
  amountClassName: string;
}) {
  const onDragStart = (e: DragEvent) => {
    const payload = JSON.stringify(pattern);
    e.dataTransfer.setData(IMPORT_PATTERN_MIME, payload);
    e.dataTransfer.setData("text/plain", payload);
    e.dataTransfer.effectAllowed = "copy";
  };
  return (
    <li
      draggable
      onDragStart={onDragStart}
      className="flex justify-between gap-2 tabular-nums text-[11px] rounded-md px-1.5 py-1 cursor-grab active:cursor-grabbing hover:bg-muted/50 border border-transparent hover:border-border/60 select-none min-w-0"
    >
      <span className="flex items-center gap-1 min-w-0 text-muted-foreground truncate" title={pattern.label}>
        <GripVertical className="w-3 h-3 shrink-0 opacity-35" aria-hidden />
        {pattern.label}
      </span>
      <span className={cn("shrink-0", amountClassName)}>
        {formatSEK(pattern.typicalAmount)}
        <span className="text-muted-foreground font-normal"> ({pattern.count}×)</span>
      </span>
    </li>
  );
}

function SavedCashflowRow({
  c,
  entities,
  accounts,
  busy,
  onEdit,
  onArchive,
  referenceMonth,
  displayedNetMonthly,
}: {
  c: Cashflow;
  entities: Entity[];
  accounts: Account[];
  busy: boolean;
  onEdit: (cashflow: Cashflow) => void;
  onArchive: (id: string) => void;
  /** When set (Finance Flow–aligned net), list shows this instead of stored `amount`. */
  referenceMonth?: Date;
  displayedNetMonthly?: number;
}) {
  const entity = entities.find((e) => e.id === c.entity_id);
  const monthlyGrossBasis = useMemo(() => {
    if (displayedNetMonthly === undefined || !referenceMonth || c.direction !== "income" || !c.is_gross)
      return null;
    const ms = startOfMonth(referenceMonth);
    const me = endOfMonth(ms);
    const eq = cashflowMonthlyAmount(c, ms, me);
    return eq > 0 && Number.isFinite(eq) ? eq : null;
  }, [c, referenceMonth, displayedNetMonthly]);
  const primaryAmount = displayedNetMonthly !== undefined ? displayedNetMonthly : c.amount;
  return (
    <div
      className="group flex items-start justify-between gap-2 p-2 rounded-bento-inner bg-muted/30 text-xs focus-within:ring-1 focus-within:ring-ring min-w-0"
    >
      <div className="min-w-0 flex-1 overflow-hidden">
        <p
          className="truncate text-xs"
          title={[c.name, entity?.name, c.frequency].filter(Boolean).join(" · ")}
        >
          <span className="font-medium">{c.name}</span>
          {cashflowIncomeInternalHideFromFlow(c) && (
            <span className="ml-1 text-[9px] px-1 rounded bg-muted text-muted-foreground uppercase tracking-wide">
              Internal
            </span>
          )}
          {entity?.name ? <span className="ml-1.5 text-muted-foreground">{entity.name}</span> : null}
          <span className="ml-1.5 text-muted-foreground/60 capitalize">{c.frequency}</span>
        </p>
        {(() => {
          const legs = resolveCashflowAccountLegs(c);
          if (!(legs.fromId ?? legs.toId)) return null;
          return (
            <p className="text-[10px] text-muted-foreground/90 truncate mt-0.5 tabular-nums" title={formatCashflowAccountRoute(c, accounts)}>
              {formatCashflowAccountRoute(c, accounts)}
            </p>
          );
        })()}
        {monthlyGrossBasis != null && (
          <p className="text-[10px] text-muted-foreground/85 mt-0.5 tabular-nums">
            Saved brutto (monthly equiv.) {formatSEK(monthlyGrossBasis)}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`tabular-nums ${c.direction === "income" ? "text-income" : "text-expense"}`}>
          {c.direction === "expense" ? "−" : "+"}
          {formatSEK(primaryAmount)}
        </span>
        <div className="flex shrink-0 items-center gap-0.5 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          <button
            type="button"
            onClick={() => onEdit(c)}
            disabled={busy}
            title="Edit"
            aria-label={`Edit cashflow ${c.name}`}
            className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-card-foreground transition-colors disabled:opacity-50"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onArchive(c.id)}
            disabled={busy}
            title="Remove"
            aria-label={`Remove cashflow ${c.name}`}
            className="p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
          >
            <Archive className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function CashflowSavedDropSection({
  title,
  targetDirection,
  flows,
  entities,
  accounts,
  busy,
  onArchive,
  onEdit,
  onDropPattern,
  topSupplement,
  incomeDisplayedNetById,
  referenceMonth,
}: {
  title: string;
  targetDirection: CashflowDirection;
  flows: Cashflow[];
  entities: Entity[];
  accounts: Account[];
  busy: boolean;
  onArchive: (id: string) => void;
  onEdit: (cashflow: Cashflow) => void;
  onDropPattern: (direction: CashflowDirection, pattern: RecurringTxPattern) => void | Promise<void>;
  /** Shown inside this zone below the title (e.g. modeled föräldrapenning). */
  topSupplement?: ReactNode;
  /** Net monthly SEK for employment-style rows (calendar FTE × tax); omit for expense column. */
  incomeDisplayedNetById?: Map<string, number>;
  referenceMonth?: Date;
}) {
  const [isOver, setIsOver] = useState(false);

  const { outward, betweenAccounts } = useMemo(() => {
    const outwardL: Cashflow[] = [];
    const betweenL: Cashflow[] = [];
    for (const c of flows) {
      if (hasCashflowBothHouseholdLegs(c)) betweenL.push(c);
      else outwardL.push(c);
    }
    const byCashflowName = (a: Cashflow, b: Cashflow) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    outwardL.sort(byCashflowName);
    betweenL.sort(byCashflowName);
    return { outward: outwardL, betweenAccounts: betweenL };
  }, [flows]);

  const allowDrop = (e: DragEvent) =>
    e.dataTransfer.types.includes(IMPORT_PATTERN_MIME) || e.dataTransfer.types.includes("text/plain");

  return (
    <div
      className={cn(
        "rounded-xl transition-colors min-w-0",
        isOver && "ring-2 ring-primary ring-offset-2 ring-offset-background bg-primary/5",
      )}
      onDragOver={(e: DragEvent) => {
        if (!allowDrop(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setIsOver(true);
      }}
      onDragLeave={(e: DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsOver(false);
      }}
      onDrop={(e: DragEvent) => {
        e.preventDefault();
        setIsOver(false);
        const raw =
          e.dataTransfer.getData(IMPORT_PATTERN_MIME) || e.dataTransfer.getData("text/plain");
        if (!raw) return;
        try {
          const pattern = JSON.parse(raw) as RecurringTxPattern;
          if (!pattern?.label) return;
          void onDropPattern(targetDirection, pattern);
        } catch {
          /* ignore */
        }
      }}
    >
      <h4 className="text-xs font-medium text-muted-foreground mb-2 leading-snug break-words">
        <span>{title}</span>{" "}
        <span className="font-normal text-[10px] text-muted-foreground/80">— drop import rows here</span>
      </h4>
      <div className="space-y-3 min-h-[2.5rem]">
        {topSupplement}
        {flows.length === 0 ? (
          !topSupplement ? (
          <p className="text-xs text-muted-foreground py-2 px-1 border border-dashed border-border/60 rounded-lg">
            None yet — drag a pattern from above into this zone
          </p>
          ) : null
        ) : (
          <>
            {outward.length > 0 && (
              <div className="space-y-1">
                {betweenAccounts.length > 0 && (
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                    Touches outside household
                  </p>
                )}
                {outward.map((c) => (
                  <SavedCashflowRow
                    key={c.id}
                    c={c}
                    entities={entities}
                    accounts={accounts}
                    busy={busy}
                    onEdit={onEdit}
                    onArchive={onArchive}
                    referenceMonth={targetDirection === "income" ? referenceMonth : undefined}
                    displayedNetMonthly={
                      targetDirection === "income" ? incomeDisplayedNetById?.get(c.id) : undefined
                    }
                  />
                ))}
              </div>
            )}
            {betweenAccounts.length > 0 && (
              <div
                className={cn(
                  "space-y-1",
                  outward.length > 0 && "pt-2 mt-0.5 border-t border-border/50 rounded-b-lg",
                )}
              >
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                  Between household accounts
                </p>
                <div
                  className={cn(
                    "space-y-1 rounded-lg p-1 min-w-0",
                    outward.length > 0 ? "bg-muted/25 border border-border/40" : "bg-muted/20",
                  )}
                >
                  {betweenAccounts.map((c) => (
                    <SavedCashflowRow
                      key={c.id}
                      c={c}
                      entities={entities}
                      accounts={accounts}
                      busy={busy}
                      onEdit={onEdit}
                      onArchive={onArchive}
                      referenceMonth={targetDirection === "income" ? referenceMonth : undefined}
                      displayedNetMonthly={
                        targetDirection === "income" ? incomeDisplayedNetById?.get(c.id) : undefined
                      }
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function FlowDiagramCardContent() {
  const { cashflows, accounts, entities, periods, household } = useAppStore();
  const projection = useProjection(1);
  const referenceMonth = useMemo(() => startOfMonth(new Date()), []);

  const fkRoutingMetaDeps = useMemo(
    () =>
      entities
        .filter((e) => !e.archived_at)
        .map((e) => {
          const raw = e.metadata?.[MODELED_PARENTAL_BENEFIT_ROUTING_META];
          return `${e.id}:${raw && typeof raw === "object" ? JSON.stringify(raw) : ""}`;
        })
        .sort()
        .join("|"),
    [entities],
  );

  const syntheticSankeyIncomes = useMemo(() => {
    const out: { entityId: string; monthlyNet: number; from_account_id?: string | null; to_account_id?: string | null }[] =
      [];
    for (const e of entities) {
      if (e.archived_at) continue;
      const row = projection.months.find((m) => m.entity_id === e.id);
      const b = parentalLeaveBenefitFromProjection(row);
      if (b && b.net > 0) {
        const routing = readModeledParentalBenefitRouting(e.metadata);
        out.push({
          entityId: e.id,
          monthlyNet: b.net,
          from_account_id: routing.from_account_id,
          to_account_id: routing.to_account_id,
        });
      }
    }
    return out;
  }, [entities, projection.months, fkRoutingMetaDeps]);

  const modeledParentalNetTotal = useMemo(
    () => syntheticSankeyIncomes.reduce((s, x) => s + x.monthlyNet, 0),
    [syntheticSankeyIncomes],
  );

  const incomes = cashflows.filter(
    (c) =>
      c.direction === "income" &&
      cashflowContributesToPnLTotals(c, accounts) &&
      employmentIncomeShownInCashflowsManager(c) &&
      !cashflowIncomeInternalHideFromFlow(c) &&
      !cashflowExcludedFromHouseholdTotals(c),
  );
  const expenses = cashflows.filter(
    (c) =>
      c.direction === "expense" &&
      cashflowContributesToPnLTotals(c, accounts) &&
      !cashflowIncomeInternalHideFromFlow(c) &&
      !cashflowExcludedFromHouseholdTotals(c),
  );

  const incomeFlowAmount = useMemo(
    () => (cf: Cashflow) =>
      displayedNetMonthlyIncomeForCashflow(cf, accounts, periods, [], household, undefined, referenceMonth),
    [accounts, periods, household, referenceMonth],
  );

  const expenseMonthlyAmount = useMemo(() => {
    const ms = referenceMonth;
    const me = endOfMonth(ms);
    return (c: Cashflow) => cashflowMonthlyAmount(c, ms, me);
  }, [referenceMonth]);

  const savedIncomeNetTotal = useMemo(
    () => incomes.reduce((s, c) => s + incomeFlowAmount(c), 0),
    [incomes, incomeFlowAmount],
  );

  const totalIn = savedIncomeNetTotal + modeledParentalNetTotal;
  const totalOut = useMemo(
    () => expenses.reduce((s, c) => s + expenseMonthlyAmount(c), 0),
    [expenses, expenseMonthlyAmount],
  );
  const net = totalIn - totalOut;

  const incomeByCat = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const c of incomes) {
      const net = incomeFlowAmount(c);
      acc[c.category] = (acc[c.category] ?? 0) + net;
    }
    if (modeledParentalNetTotal > 0) {
      acc.foraldrapenning_modeled = modeledParentalNetTotal;
    }
    return acc;
  }, [incomes, incomeFlowAmount, modeledParentalNetTotal]);

  const expenseByCat = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const c of expenses) {
      acc[c.category] = (acc[c.category] ?? 0) + expenseMonthlyAmount(c);
    }
    return acc;
  }, [expenses, expenseMonthlyAmount]);

  return (
    <div className="space-y-4">
      <FinanceFlowSankeyDiagram
        cashflows={cashflows}
        accounts={accounts}
        syntheticIncomes={syntheticSankeyIncomes}
        getIncomeFlowAmount={incomeFlowAmount}
        referenceMonth={referenceMonth}
        className="-mx-1"
      />

      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Total Income</p>
          <p className="text-lg font-bold tabular-nums text-income">{formatSEK(totalIn)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
            Calendar FTE × illustrative tax (SE / Stockholm when set)
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Total Cost</p>
          <p className="text-lg font-bold tabular-nums text-expense">{formatSEK(totalOut)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
            Monthly equivalents (weekly × 4.33, biweekly × 2.17, …)
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Net Income</p>
          <p className={`text-lg font-bold tabular-nums ${net >= 0 ? "text-income" : "text-expense"}`}>{formatSEK(net)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2">Income Sources</h4>
          {Object.entries(incomeByCat)
            .sort(([, a], [, b]) => b - a)
            .map(([cat, amt]) => (
              <div key={cat} className="flex justify-between text-xs py-0.5">
                <span className="text-muted-foreground">
                  {cat === "foraldrapenning_modeled"
                    ? "Föräldrapenning (modeled)"
                    : cat.replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase())}
                </span>
                <span className="tabular-nums text-income">{formatSEK(amt)}</span>
              </div>
            ))}
          {Object.keys(incomeByCat).length === 0 && <p className="text-xs text-muted-foreground">No income</p>}
        </div>
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2">Expense Buckets</h4>
          {Object.entries(expenseByCat).sort(([, a], [, b]) => b - a).map(([cat, amt]) => (
            <div key={cat} className="flex justify-between text-xs py-0.5">
              <span className="text-muted-foreground capitalize">{cat.replace(/_/g, " ")}</span>
              <span className="tabular-nums text-expense">{formatSEK(amt)}</span>
            </div>
          ))}
          {Object.keys(expenseByCat).length === 0 && <p className="text-xs text-muted-foreground">No expenses</p>}
        </div>
      </div>
    </div>
  );
}

function EntityManagerCardContent() {
  const { entities, cashflows, household, refresh, accounts } = useAppStore();
  const projection = useProjection(1);
  const backend = useBackend();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<EntityType>("adult");
  const [busy, setBusy] = useState(false);
  const [addingIncomeFor, setAddingIncomeFor] = useState<string | null>(null);
  const [incomeName, setIncomeName] = useState("");
  const [incomeAmount, setIncomeAmount] = useState("");
  const [incomeCategory, setIncomeCategory] = useState<CashflowCategory>("salary");
  const [incomeFrequency, setIncomeFrequency] = useState<Frequency>("monthly");
  const [incomeEmploymentFrom, setIncomeEmploymentFrom] = useState("");
  const [incomeEmploymentUntil, setIncomeEmploymentUntil] = useState("");
  const [incomeInternalHide, setIncomeInternalHide] = useState(false);

  const [editingEntity, setEditingEntity] = useState<Entity | null>(null);
  const [editEntityName, setEditEntityName] = useState("");
  const [editEntityBirthDate, setEditEntityBirthDate] = useState("");

  const [editingIncome, setEditingIncome] = useState<Cashflow | null>(null);
  const [editIncName, setEditIncName] = useState("");
  const [editIncAmount, setEditIncAmount] = useState("");
  const [editIncCategory, setEditIncCategory] = useState<CashflowCategory>("other");
  const [editIncFrequency, setEditIncFrequency] = useState<Frequency>("monthly");
  const [editIncEntityId, setEditIncEntityId] = useState("");
  const [editIncEmploymentFrom, setEditIncEmploymentFrom] = useState("");
  const [editIncEmploymentUntil, setEditIncEmploymentUntil] = useState("");
  const [editIncInternalHide, setEditIncInternalHide] = useState(false);

  useEffect(() => {
    if (!editingEntity) return;
    setEditEntityName(editingEntity.name);
    setEditEntityBirthDate(editingEntity.birth_date ?? "");
  }, [editingEntity]);

  useEffect(() => {
    if (!editingIncome) return;
    setEditIncName(editingIncome.name);
    setEditIncAmount(String(editingIncome.amount));
    const known = INCOME_CASHFLOW_CATEGORY_OPTIONS.some((o) => o.value === editingIncome.category);
    setEditIncCategory(known ? editingIncome.category : "other");
    setEditIncFrequency(editingIncome.frequency);
    setEditIncEntityId(editingIncome.entity_id);
    setEditIncEmploymentFrom(editingIncome.employment_active_from?.slice(0, 10) ?? "");
    setEditIncEmploymentUntil(editingIncome.employment_active_until?.slice(0, 10) ?? "");
    setEditIncInternalHide(cashflowIncomeInternalHideFromFlow(editingIncome));
  }, [editingIncome]);

  const handleSaveEntityEdit = async () => {
    if (!editingEntity || !editEntityName.trim()) return;
    setBusy(true);
    try {
      await backend.upsertEntity({
        ...editingEntity,
        name: editEntityName.trim(),
        birth_date: editEntityBirthDate.trim() ? editEntityBirthDate.trim() : null,
        updated_at: new Date().toISOString(),
      });
      setEditingEntity(null);
      await refresh();
    } catch (err) {
      console.error("Failed to update entity:", err);
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = async () => {
    if (!name.trim() || !household) return;
    setBusy(true);
    try {
      await backend.upsertEntity({
        id: crypto.randomUUID(),
        household_id: household.id,
        type,
        name: name.trim(),
        birth_date: null,
        tax_id: null,
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        archived_at: null,
      });
      setName("");
      setAdding(false);
      await refresh();
    } catch (err) {
      console.error("Failed to add entity:", err);
    } finally {
      setBusy(false);
    }
  };

  const handleArchive = async (id: string) => {
    setBusy(true);
    try {
      await backend.archiveEntity(id);
      await refresh();
    } catch (err) {
      console.error("Failed to archive entity:", err);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveIncomeEdit = async () => {
    if (!editingIncome || !household) return;
    if (!editIncName.trim() || !editIncAmount.trim()) return;
    const amount = Number(editIncAmount.replace(",", "."));
    if (!Number.isFinite(amount)) return;
    if (!entities.some((ent) => ent.id === editIncEntityId)) return;
    setBusy(true);
    try {
      const ew = employmentWindowForCategory(editIncCategory, "income", editIncEmploymentFrom, editIncEmploymentUntil);
      await backend.upsertCashflow({
        ...editingIncome,
        entity_id: editIncEntityId,
        name: editIncName.trim(),
        amount: Math.abs(amount),
        category: editIncCategory,
        frequency: editIncFrequency,
        currency: household.currency,
        employment_active_from: ew.employment_active_from,
        employment_active_until: ew.employment_active_until,
        metadata: buildCashflowIncomeMetadata(editingIncome.metadata, editIncInternalHide),
        updated_at: new Date().toISOString(),
      });
      setEditingIncome(null);
      await refresh();
    } catch (err) {
      console.error("Failed to update income:", err);
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveIncome = async (cf: Cashflow) => {
    setBusy(true);
    try {
      if (editingIncome?.id === cf.id) setEditingIncome(null);
      await backend.archiveCashflow(cf.id);
      await refresh();
    } catch (err) {
      console.error("Failed to remove income:", err);
    } finally {
      setBusy(false);
    }
  };

  const resetIncomeForm = () => {
    setAddingIncomeFor(null);
    setIncomeName("");
    setIncomeAmount("");
    setIncomeCategory("salary");
    setIncomeFrequency("monthly");
    setIncomeEmploymentFrom("");
    setIncomeEmploymentUntil("");
    setIncomeInternalHide(false);
  };

  const handleAddIncome = async (entityId: string) => {
    if (!incomeName.trim() || !incomeAmount.trim() || !household) return;
    const amount = Number(incomeAmount.replace(",", "."));
    if (!Number.isFinite(amount)) return;
    setBusy(true);
    try {
      const ew = employmentWindowForCategory(incomeCategory, "income", incomeEmploymentFrom, incomeEmploymentUntil);
      await backend.upsertCashflow({
        id: crypto.randomUUID(),
        entity_id: entityId,
        account_id: null,
        from_account_id: null,
        to_account_id: null,
        direction: "income",
        category: incomeCategory,
        name: incomeName.trim(),
        amount: Math.abs(amount),
        currency: household.currency,
        frequency: incomeFrequency,
        date_from: new Date().toISOString().slice(0, 10),
        date_to: null,
        is_gross: true,
        tax_rate_override: null,
        notes: null,
        employment_active_from: ew.employment_active_from,
        employment_active_until: ew.employment_active_until,
        metadata: buildCashflowIncomeMetadata(null, incomeInternalHide),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        archived_at: null,
      });
      resetIncomeForm();
      await refresh();
    } catch (err) {
      console.error("Failed to add income:", err);
    } finally {
      setBusy(false);
    }
  };

  const householdEntityIds = useMemo(() => {
    if (!household) return new Set<string>();
    return new Set(
      entities.filter((x) => !x.archived_at && x.household_id === household.id).map((x) => x.id),
    );
  }, [entities, household]);

  const routingAccounts = useMemo(
    () =>
      accountsVisibleForHouseholdCashflowRouting(accounts, householdEntityIds)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [accounts, householdEntityIds],
  );

  const persistParentalBenefitRouting = async (entity: Entity, routing: ModeledParentalBenefitRouting) => {
    if (!household) return;
    setBusy(true);
    try {
      await backend.upsertEntity({
        ...entity,
        metadata: mergeModeledParentalBenefitRouting(entity.metadata ?? {}, routing),
        updated_at: new Date().toISOString(),
      });
      await refresh();
    } catch (err) {
      console.error("Failed to save modeled föräldrapenning routing:", err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {editingEntity && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close"
            onClick={() => !busy && setEditingEntity(null)}
          />
          <div
            className="relative w-full max-w-md rounded-bento bg-card border border-border shadow-bento flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-labelledby="entity-edit-title"
          >
            <div className="flex items-start justify-between gap-2 p-4 pb-2 border-b border-border/50">
              <h2 id="entity-edit-title" className="text-sm font-semibold">
                Edit entity
              </h2>
              <button
                type="button"
                onClick={() => !busy && setEditingEntity(null)}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3 text-xs">
              <p className="text-muted-foreground">
                Type: <span className="capitalize text-card-foreground">{editingEntity.type}</span>
              </p>
              <input
                type="text"
                value={editEntityName}
                onChange={(e) => setEditEntityName(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-background border border-border"
                placeholder="Name"
              />
              <div>
                <label className="block text-[10px] text-muted-foreground mb-1">
                  {editingEntity.type === "company" ? "Founded (date)" : "Birth date"}
                </label>
                <input
                  type="date"
                  value={editEntityBirthDate}
                  onChange={(e) => setEditEntityBirthDate(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-background border border-border"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 pt-0">
              <button
                type="button"
                onClick={() => setEditingEntity(null)}
                disabled={busy}
                className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted/80 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSaveEntityEdit()}
                disabled={busy || !editEntityName.trim()}
                className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingIncome && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close"
            onClick={() => !busy && setEditingIncome(null)}
          />
          <div
            className="relative w-full max-w-md rounded-bento bg-card border border-border shadow-bento flex flex-col max-h-[min(90vh,520px)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="income-edit-title"
          >
            <div className="flex items-start justify-between gap-2 p-4 pb-2 border-b border-border/50 shrink-0">
              <h2 id="income-edit-title" className="text-sm font-semibold">
                Edit income
              </h2>
              <button
                type="button"
                onClick={() => !busy && setEditingIncome(null)}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-2 text-xs overflow-y-auto min-h-0 flex-1">
              <p className="text-muted-foreground text-[11px] leading-relaxed mb-1">
                Change who this income belongs to (e.g. move barnbidrag to a child) or update the amount. The amount is the stored budget figure (pre-tax gross for salary-style lines). Use{" "}
                <span className="text-card-foreground">Household-internal</span> below to keep a line for records but drop it from Finance Flow, overview totals, and projections. Removing sends it to the archive — it will no longer appear in projections.
              </p>
              <label className="block space-y-1">
                <span className="text-[10px] text-muted-foreground">Pay to (entity)</span>
                <select
                  value={editIncEntityId}
                  onChange={(ev) => setEditIncEntityId(ev.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-background border border-border"
                >
                  {entities.map((ent) => (
                    <option key={ent.id} value={ent.id}>
                      {ent.name} ({ent.type})
                    </option>
                  ))}
                </select>
              </label>
              <input
                type="text"
                value={editIncName}
                onChange={(ev) => setEditIncName(ev.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-background border border-border"
                placeholder="Name (e.g. Barnbidrag)"
              />
              <input
                type="text"
                inputMode="decimal"
                value={editIncAmount}
                onChange={(ev) => setEditIncAmount(ev.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-background border border-border"
                placeholder="Amount"
              />
              <select
                value={editIncCategory}
                onChange={(ev) => setEditIncCategory(ev.target.value as CashflowCategory)}
                className="w-full px-3 py-1.5 rounded-lg bg-background border border-border"
              >
                {INCOME_CASHFLOW_CATEGORY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <select
                value={editIncFrequency}
                onChange={(ev) => setEditIncFrequency(ev.target.value as Frequency)}
                className="w-full px-3 py-1.5 rounded-lg bg-background border border-border"
              >
                <option value="daily">Daily</option>
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annually">Annually</option>
                <option value="one_off">One-off</option>
              </select>
              {(editIncCategory === "salary" || editIncCategory === "freelance") && (
                <div className="grid grid-cols-2 gap-2 pt-0.5">
                  <label className="space-y-0.5">
                    <span className="text-[10px] text-muted-foreground">Employment from</span>
                    <input
                      type="date"
                      value={editIncEmploymentFrom}
                      onChange={(ev) => setEditIncEmploymentFrom(ev.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg bg-background border border-border"
                    />
                  </label>
                  <label className="space-y-0.5">
                    <span className="text-[10px] text-muted-foreground">Until</span>
                    <input
                      type="date"
                      value={editIncEmploymentUntil}
                      onChange={(ev) => setEditIncEmploymentUntil(ev.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg bg-background border border-border"
                    />
                  </label>
                  <p className="col-span-2 text-[10px] text-muted-foreground leading-snug">
                    Outside these dates (when set), the line stays here for records and benefit estimates but looks inactive and does not count in current-month income projections or Income streams here.
                  </p>
                </div>
              )}
              <label className="flex items-start gap-2 px-0.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editIncInternalHide}
                  onChange={(ev) => setEditIncInternalHide(ev.target.checked)}
                  className="mt-0.5 rounded border-border"
                  disabled={busy}
                />
                <span className="text-[10px] text-muted-foreground leading-snug">
                  Household-internal — omit from Finance Flow totals, overview cash bar, and forward projections for this income or expense side.
                </span>
              </label>
            </div>
            <div className="flex justify-end gap-2 p-4 pt-2 border-t border-border/50 shrink-0 flex-wrap">
              <button
                type="button"
                onClick={() => handleRemoveIncome(editingIncome)}
                disabled={busy}
                className="px-3 py-1.5 text-xs rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 disabled:opacity-50 mr-auto"
              >
                Remove income
              </button>
              <button
                type="button"
                onClick={() => setEditingIncome(null)}
                disabled={busy}
                className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted/80 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSaveIncomeEdit()}
                disabled={
                  busy ||
                  !editIncName.trim() ||
                  !editIncAmount.trim() ||
                  !entities.some((ent) => ent.id === editIncEntityId)
                }
                className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {entities.map((e) => {
          const incomes = cashflows.filter((c) => c.entity_id === e.id && c.direction === "income");
          const monthProj = projection.months.find((m) => m.entity_id === e.id);
          const parentalBenefit = parentalLeaveBenefitFromProjection(monthProj);
          return (
            <div
              key={e.id}
              className="group/entity relative rounded-bento-inner bg-muted/30 p-2.5 overflow-x-hidden min-w-0"
            >
              <div className="absolute top-2 right-2 z-[1] flex items-center gap-0.5 rounded-md bg-card/95 px-0.5 py-0.5 border border-border/60 shadow-sm opacity-0 pointer-events-none transition-opacity duration-150 group-hover/entity:opacity-100 group-hover/entity:pointer-events-auto group-focus-within/entity:opacity-100 group-focus-within/entity:pointer-events-auto">
                <button
                  type="button"
                  onClick={() => setEditingEntity(e)}
                  className="p-1 rounded-md text-muted-foreground hover:text-card-foreground hover:bg-muted"
                  title="Edit entity"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleArchive(e.id)}
                  disabled={busy}
                  title="Archive entity"
                  className="p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                >
                  <Archive className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-start min-w-0 pr-[4.5rem]">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-sm font-medium break-words">{e.name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary capitalize shrink-0">
                      {e.type}
                    </span>
                  </div>
                  {e.birth_date && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 break-words">
                      {e.type === "company" ? "Founded" : "Born"} {e.birth_date}
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {incomes.length} income stream{incomes.length !== 1 ? "s" : ""}
                    {parentalBenefit && parentalBenefit.gross > 0
                      ? " · föräldrapenning from calendar"
                      : ""}
                  </p>
                </div>
              </div>

              {parentalBenefit != null && parentalBenefit.gross > 0 && (
                <div className="mt-2 rounded-md bg-muted/50 px-2 py-1.5">
                  <p className="text-[10px] font-medium text-card-foreground">
                    <span
                      className="cursor-help underline decoration-dotted decoration-border underline-offset-2"
                      title="From Planning calendar (parental leave, FTE) and SGI-based daily benefit — same numbers as this month's projection, not a separate saved income row."
                    >
                      Parental Leave compensation
                    </span>
                  </p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0 mt-1 text-[10px] tabular-nums">
                    <span>
                      <span className="text-muted-foreground">Gross </span>
                      {formatSEK(parentalBenefit.gross)}
                      <span className="text-muted-foreground font-normal">/month</span>
                    </span>
                    <span>
                      <span className="text-muted-foreground">Net </span>
                      <span className="text-income">{formatSEK(parentalBenefit.net)}</span>
                      <span className="text-muted-foreground font-normal">/month</span>
                    </span>
                  </div>
                  <ModeledParentalBenefitRoutingFields
                    entity={e}
                    entities={entities}
                    accounts={accounts}
                    routingAccounts={routingAccounts}
                    household={household}
                    disabled={busy}
                    onPersist={persistParentalBenefitRouting}
                  />
                </div>
              )}

              {incomes.length > 0 && (
                <div className="mt-2 space-y-1 max-h-48 overflow-x-hidden overflow-y-auto min-w-0">
                  {incomes.map((income) => (
                    <div
                      key={income.id}
                      className={cn(
                        "group/row relative rounded-md px-1 py-1 -mx-1 min-w-0 hover:bg-muted/40",
                        employmentIncomeInactiveForUi(income) && "opacity-55",
                      )}
                    >
                      <div className="absolute top-1 right-1 z-[1] flex items-center gap-0.5 rounded bg-card/95 px-0.5 py-0.5 border border-border/50 shadow-sm opacity-0 pointer-events-none transition-opacity duration-150 group-hover/row:opacity-100 group-hover/row:pointer-events-auto group-focus-within/row:opacity-100 group-focus-within/row:pointer-events-auto">
                        <button
                          type="button"
                          title="Edit income"
                          onClick={() => setEditingIncome(income)}
                          disabled={busy}
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-card-foreground disabled:opacity-50"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          title="Remove income"
                          onClick={() => void handleRemoveIncome(income)}
                          disabled={busy}
                          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive disabled:opacity-50"
                        >
                          <Archive className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="min-w-0 pr-16">
                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0 min-w-0">
                          <p className="text-[10px] text-muted-foreground break-words">{income.name}</p>
                          {cashflowIncomeInternalHideFromFlow(income) && (
                            <span className="text-[9px] px-1 rounded bg-muted text-muted-foreground uppercase tracking-wide shrink-0">
                              Internal
                            </span>
                          )}
                        </div>
                        <p
                          className={cn(
                            "text-[10px] tabular-nums break-words leading-snug",
                            employmentIncomeInactiveForUi(income) ? "text-muted-foreground" : "text-income",
                          )}
                        >
                          {formatSEK(income.amount)}
                          <span className="text-muted-foreground font-normal">/{income.frequency}</span>
                        </p>
                        <p className="text-[9px] text-muted-foreground capitalize truncate" title={income.category.replace(/_/g, " ")}>
                          {income.category.replace(/_/g, " ")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {addingIncomeFor === e.id ? (
                <div className="mt-2 p-2 rounded-bento-inner bg-card/70 border border-border/60 space-y-2">
                  <input
                    type="text"
                    placeholder="Income name (e.g. Salary)"
                    value={incomeName}
                    onChange={(ev) => setIncomeName(ev.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="Amount"
                      value={incomeAmount}
                      onChange={(ev) => setIncomeAmount(ev.target.value)}
                      className="px-3 py-1.5 text-xs rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <select
                      value={incomeFrequency}
                      onChange={(ev) => setIncomeFrequency(ev.target.value as Frequency)}
                      className="px-3 py-1.5 text-xs rounded-lg bg-background border border-border"
                    >
                      <option value="daily">Daily</option>
                      <option value="monthly">Monthly</option>
                      <option value="weekly">Weekly</option>
                      <option value="biweekly">Biweekly</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="annually">Annually</option>
                      <option value="one_off">One-off</option>
                    </select>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-snug px-0.5">
                    Enter gross before tax ({household?.currency}); net in projections follows location and entity tax rules.
                  </p>
                  <select
                    value={incomeCategory}
                    onChange={(ev) => setIncomeCategory(ev.target.value as CashflowCategory)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg bg-background border border-border"
                  >
                    {INCOME_CASHFLOW_CATEGORY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  {(incomeCategory === "salary" || incomeCategory === "freelance") && (
                    <div className="grid grid-cols-2 gap-2">
                      <label className="space-y-0.5">
                        <span className="text-[9px] text-muted-foreground">Employment from</span>
                        <input
                          type="date"
                          value={incomeEmploymentFrom}
                          onChange={(ev) => setIncomeEmploymentFrom(ev.target.value)}
                          className="w-full px-2 py-1 text-[10px] rounded-lg bg-background border border-border"
                        />
                      </label>
                      <label className="space-y-0.5">
                        <span className="text-[9px] text-muted-foreground">Until</span>
                        <input
                          type="date"
                          value={incomeEmploymentUntil}
                          onChange={(ev) => setIncomeEmploymentUntil(ev.target.value)}
                          className="w-full px-2 py-1 text-[10px] rounded-lg bg-background border border-border"
                        />
                      </label>
                    </div>
                  )}
                  <label className="flex items-start gap-2 px-0.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={incomeInternalHide}
                      onChange={(ev) => setIncomeInternalHide(ev.target.checked)}
                      className="mt-0.5 rounded border-border"
                      disabled={busy}
                    />
                    <span className="text-[10px] text-muted-foreground leading-snug">
                      Household-internal — omit from Finance Flow totals, overview cash bar, and forward projections for this income or expense side.
                    </span>
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleAddIncome(e.id)}
                      disabled={busy || !incomeName.trim() || !incomeAmount.trim()}
                      className="px-3 py-1.5 text-[10px] rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      {busy ? "Saving..." : "Add income"}
                    </button>
                    <button
                      type="button"
                      onClick={resetIncomeForm}
                      className="px-3 py-1.5 text-[10px] rounded-lg bg-muted text-muted-foreground hover:bg-muted/80"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setAddingIncomeFor(e.id);
                    setIncomeName("");
                    setIncomeAmount("");
                    setIncomeCategory(e.type === "company" ? "freelance" : "salary");
                    setIncomeFrequency("monthly");
                    setIncomeEmploymentFrom("");
                    setIncomeEmploymentUntil("");
                    setIncomeInternalHide(false);
                  }}
                  className="mt-2 flex items-center gap-1 text-[10px] text-primary hover:text-primary/80"
                >
                  <Plus className="w-3 h-3" /> Add income
                </button>
              )}
            </div>
          );
        })}
        {entities.length === 0 && <p className="text-xs text-muted-foreground">No entities yet</p>}
      </div>

      {adding ? (
        <div className="p-3 rounded-bento-inner bg-muted/20 space-y-2">
          <input
            type="text"
            placeholder="Name"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-3 py-1.5 text-sm rounded-lg bg-card border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <select value={type} onChange={e => setType(e.target.value as EntityType)} className="w-full px-3 py-1.5 text-sm rounded-lg bg-card border border-border">
            <option value="adult">Adult</option>
            <option value="child">Child</option>
            <option value="company">Company</option>
          </select>
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={busy} className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {busy ? "Saving..." : "Add"}
            </button>
            <button onClick={() => setAdding(false)} className="px-3 py-1.5 text-xs rounded-lg bg-muted text-muted-foreground hover:bg-muted/80">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors">
          <Plus className="w-3.5 h-3.5" /> Add person/company
        </button>
      )}
    </div>
  );
}

function AccountManagerCardContent() {
  const { t } = useTranslation();
  const { accounts, entities, household, refresh } = useAppStore();
  const backend = useBackend();
  const openCsvImport = useOpenCsvImport();
  /** Section id in this set = collapsed. Empty set = every section expanded. */
  const [collapsedAccountSections, setCollapsedAccountSections] = useState<Set<string>>(() => new Set());
  const accountSectionExpanded = (sectionId: string) => !collapsedAccountSections.has(sectionId);
  const toggleAccountSection = (sectionId: string) => {
    setCollapsedAccountSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };
  const allAccountSectionIds = useMemo(() => ["__shared__", ...entities.map((e) => e.id)], [entities]);
  const expandAllAccountSections = () => setCollapsedAccountSections(new Set());
  const collapseAllAccountSections = () => setCollapsedAccountSections(new Set(allAccountSectionIds));
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [addingShared, setAddingShared] = useState(false);
  const [accName, setAccName] = useState("");
  const [accType, setAccType] = useState<AccountType>("bank");
  const [accBalance, setAccBalance] = useState("");
  const [sharedCoIds, setSharedCoIds] = useState<string[]>([]);
  const [addAsJoint, setAddAsJoint] = useState(false);
  const [addJointExtraIds, setAddJointExtraIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editAccName, setEditAccName] = useState("");
  const [editAccType, setEditAccType] = useState<AccountType>("bank");
  const [editAccBalance, setEditAccBalance] = useState("");
  const [editAccBalanceDate, setEditAccBalanceDate] = useState("");
  const [editSharedCoIds, setEditSharedCoIds] = useState<string[]>([]);
  const [editAccOwnerId, setEditAccOwnerId] = useState("");
  const [editAccJoint, setEditAccJoint] = useState(false);

  useEffect(() => {
    if (!editingAccount) return;
    setEditAccName(editingAccount.name);
    setEditAccType(editingAccount.type);
    setEditAccBalance(String(editingAccount.balance_snapshot));
    setEditAccBalanceDate(editingAccount.balance_snapshot_date ?? "");
    setEditAccOwnerId(editingAccount.entity_id);
    const sh = isSharedAccount(editingAccount);
    setEditAccJoint(sh);
    const m = readSharedMeta(editingAccount);
    setEditSharedCoIds(sh && Array.isArray(m.co_entity_ids) ? [...m.co_entity_ids].sort() : []);
  }, [editingAccount]);

  useEffect(() => {
    if (!editingAccount || !editAccJoint) return;
    if (editSharedCoIds.length > 0 && !editSharedCoIds.includes(editAccOwnerId)) {
      setEditAccOwnerId([...editSharedCoIds].sort((a, b) => a.localeCompare(b))[0]);
    }
  }, [editingAccount, editAccJoint, editSharedCoIds, editAccOwnerId]);

  const toggleEditSharedCo = (id: string) => {
    setEditSharedCoIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSaveAccountEdit = async () => {
    if (!editingAccount || !editAccName.trim()) return;
    const bal = Number(editAccBalance.replace(",", "."));
    if (!Number.isFinite(bal)) return;
    const wantsShared = editAccJoint && editSharedCoIds.length >= 2;
    if (editAccJoint && editSharedCoIds.length < 2) return;
    if (!wantsShared && !entities.some((e) => e.id === editAccOwnerId)) return;
    setBusy(true);
    try {
      const baseMeta =
        editingAccount.metadata && typeof editingAccount.metadata === "object"
          ? { ...editingAccount.metadata }
          : {};
      let entityId = editingAccount.entity_id;
      let metadata: Account["metadata"];

      if (wantsShared) {
        const ids = [...editSharedCoIds];
        let primary = editAccOwnerId;
        if (!ids.includes(primary)) primary = [...ids].sort((a, b) => a.localeCompare(b))[0] ?? "";
        if (!primary) {
          setBusy(false);
          return;
        }
        const orderedCo = [primary, ...ids.filter((i) => i !== primary).sort((a, b) => a.localeCompare(b))];
        entityId = primary;
        metadata = { ...baseMeta, shared: true, co_entity_ids: orderedCo };
      } else {
        entityId = editAccOwnerId;
        const cleaned = { ...baseMeta } as Record<string, unknown>;
        delete cleaned.shared;
        delete cleaned.co_entity_ids;
        metadata = cleaned;
      }

      await backend.upsertAccount({
        ...editingAccount,
        entity_id: entityId,
        name: editAccName.trim(),
        type: editAccType,
        balance_snapshot: bal,
        balance_snapshot_date: editAccBalanceDate.trim() ? editAccBalanceDate.trim() : null,
        metadata,
        updated_at: new Date().toISOString(),
      });
      setEditingAccount(null);
      await refresh();
    } catch (err) {
      console.error("Failed to update account:", err);
    } finally {
      setBusy(false);
    }
  };

  const sharedAccounts = accounts.filter(isSharedAccount);
  const byEntity = entities.map(e => ({
    entity: e,
    accounts: accounts.filter(a => isPersonalAccountForEntity(a, e.id)),
  }));

  const toggleSharedCo = (id: string) => {
    setSharedCoIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleAddJointExtra = (id: string) => {
    setAddJointExtraIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleAddAccount = async (entityId: string) => {
    if (!accName.trim() || !household) return;
    if (addAsJoint && addJointExtraIds.length < 1) return;
    setBusy(true);
    try {
      const bal = accBalance.trim() === "" ? 0 : Number(accBalance.replace(",", "."));
      const coIds = [...new Set([entityId, ...addJointExtraIds])];
      const primary = entityId;
      const orderedCo = addAsJoint
        ? [primary, ...coIds.filter((i) => i !== primary).sort((a, b) => a.localeCompare(b))]
        : null;
      if (addAsJoint && orderedCo && orderedCo.length < 2) {
        setBusy(false);
        return;
      }
      await backend.upsertAccount({
        id: crypto.randomUUID(),
        entity_id: addAsJoint && orderedCo ? orderedCo[0] : entityId,
        type: accType,
        name: accName.trim(),
        iban: null,
        currency: household.currency,
        balance_snapshot: Number.isFinite(bal) ? bal : 0,
        balance_snapshot_date: new Date().toISOString().slice(0, 10),
        bank_name: null,
        csv_parser_config_id: null,
        is_active: true,
        metadata: addAsJoint && orderedCo ? { shared: true, co_entity_ids: orderedCo } : {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        archived_at: null,
      });
      setAccName("");
      setAccBalance("");
      setAddAsJoint(false);
      setAddJointExtraIds([]);
      setAddingFor(null);
      await refresh();
    } catch (err) {
      console.error("Failed to add account:", err);
    } finally {
      setBusy(false);
    }
  };

  const handleAddSharedAccount = async () => {
    if (!accName.trim() || !household || sharedCoIds.length < 2) return;
    setBusy(true);
    try {
      const sorted = [...sharedCoIds].sort();
      const bal = accBalance.trim() === "" ? 0 : Number(accBalance.replace(",", "."));
      await backend.upsertAccount({
        id: crypto.randomUUID(),
        entity_id: sorted[0],
        type: accType,
        name: accName.trim(),
        iban: null,
        currency: household.currency,
        balance_snapshot: Number.isFinite(bal) ? bal : 0,
        balance_snapshot_date: new Date().toISOString().slice(0, 10),
        bank_name: null,
        csv_parser_config_id: null,
        is_active: true,
        metadata: { shared: true, co_entity_ids: sorted },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        archived_at: null,
      });
      setAccName("");
      setAccBalance("");
      setSharedCoIds([]);
      setAddingShared(false);
      await refresh();
    } catch (err) {
      console.error("Failed to add shared account:", err);
    } finally {
      setBusy(false);
    }
  };

  const handleArchiveAccount = async (id: string) => {
    setBusy(true);
    try {
      await backend.archiveAccount(id);
      await refresh();
    } catch (err) {
      console.error("Failed to archive account:", err);
    } finally {
      setBusy(false);
    }
  };

  const sharedLabel = (a: (typeof accounts)[0]) => {
    const m = readSharedMeta(a);
    const names = (m.co_entity_ids ?? [])
      .map((id) => entities.find((e) => e.id === id)?.name)
      .filter(Boolean);
    return names.length ? names.join(", ") : "Shared";
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2 pb-0.5 border-b border-border/40">
        <button
          type="button"
          className="text-[10px] px-2.5 py-1 rounded-md border border-border bg-muted/30 hover:bg-muted/60 text-muted-foreground hover:text-card-foreground transition-colors"
          onClick={() => expandAllAccountSections()}
        >
          Expand all
        </button>
        <button
          type="button"
          className="text-[10px] px-2.5 py-1 rounded-md border border-border bg-muted/30 hover:bg-muted/60 text-muted-foreground hover:text-card-foreground transition-colors"
          onClick={() => collapseAllAccountSections()}
        >
          Collapse all
        </button>
      </div>
      {editingAccount && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close"
            onClick={() => !busy && setEditingAccount(null)}
          />
          <div
            className="relative w-full max-w-md max-h-[min(90vh,520px)] rounded-bento bg-card border border-border shadow-bento flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-edit-title"
          >
            <div className="flex items-start justify-between gap-2 p-4 pb-2 shrink-0 border-b border-border/50">
              <h2 id="account-edit-title" className="text-sm font-semibold">
                Edit account
              </h2>
              <button
                type="button"
                onClick={() => !busy && setEditingAccount(null)}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-2 overflow-y-auto text-xs flex-1 min-h-0">
              <input
                type="text"
                value={editAccName}
                onChange={(e) => setEditAccName(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-background border border-border"
                placeholder="Account name"
              />
              <select
                value={editAccType}
                onChange={(e) => setEditAccType(e.target.value as AccountType)}
                className="w-full px-3 py-1.5 rounded-lg bg-background border border-border"
              >
                <option value="bank">Bank</option>
                <option value="savings">Savings</option>
                <option value="investment">Investment</option>
                <option value="loan">Loan</option>
                <option value="pension">Pension</option>
                <option value="credit">Credit</option>
              </select>
              <label className="flex items-center gap-2 text-[10px] cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded border-border"
                  checked={editAccJoint}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setEditAccJoint(on);
                    if (on) {
                      setEditSharedCoIds((prev) => {
                        const next = prev.length >= 2 ? prev : [...new Set([editAccOwnerId, ...prev])];
                        return [...next].sort((a, b) => a.localeCompare(b));
                      });
                    } else {
                      setEditSharedCoIds([]);
                    }
                  }}
                />
                Joint / shared account (multiple owners)
              </label>
              {!editAccJoint && (
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">Owner</label>
                  <select
                    value={editAccOwnerId}
                    onChange={(e) => setEditAccOwnerId(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-background border border-border"
                  >
                    {entities.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name} ({e.type})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  value={editAccBalance}
                  onChange={(e) => setEditAccBalance(e.target.value)}
                  className="px-3 py-1.5 rounded-lg bg-background border border-border"
                  placeholder="Balance"
                />
                <input
                  type="date"
                  value={editAccBalanceDate}
                  onChange={(e) => setEditAccBalanceDate(e.target.value)}
                  className="px-3 py-1.5 rounded-lg bg-background border border-border"
                />
              </div>
              {editAccJoint && (
                <>
                  <p className="text-[10px] text-muted-foreground">Co-owners (at least two)</p>
                  <div className="flex flex-wrap gap-2">
                    {entities.map((e) => (
                      <label key={e.id} className="flex items-center gap-1.5 text-[10px] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editSharedCoIds.includes(e.id)}
                          onChange={() => toggleEditSharedCo(e.id)}
                          className="rounded border-border"
                        />
                        {e.name}
                      </label>
                    ))}
                  </div>
                  {editSharedCoIds.length > 0 ? (
                    <div>
                      <label className="block text-[10px] text-muted-foreground mb-1">Primary holder</label>
                      <select
                        value={
                          editSharedCoIds.includes(editAccOwnerId)
                            ? editAccOwnerId
                            : [...editSharedCoIds].sort((a, b) => a.localeCompare(b))[0]
                        }
                        onChange={(e) => setEditAccOwnerId(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg bg-background border border-border"
                      >
                        {[...editSharedCoIds]
                          .sort((a, b) => a.localeCompare(b))
                          .map((id) => {
                            const ent = entities.find((x) => x.id === id);
                            return ent ? (
                              <option key={id} value={id}>
                                {ent.name} ({ent.type})
                              </option>
                            ) : null;
                          })}
                      </select>
                    </div>
                  ) : null}
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 p-4 pt-2 shrink-0 border-t border-border/50">
              <button
                type="button"
                onClick={() => {
                  openCsvImport(editingAccount.id);
                }}
                disabled={busy || !editingAccount}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border bg-muted/30 text-muted-foreground hover:bg-muted hover:text-card-foreground disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5" />
                CSV Import
              </button>
              <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditingAccount(null)}
                disabled={busy}
                className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted/80 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSaveAccountEdit()}
                disabled={busy || !editAccName.trim() || (editAccJoint && editSharedCoIds.length < 2)}
                className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save"}
              </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={() => toggleAccountSection("__shared__")}
          className="flex items-center justify-between w-full text-left p-2 rounded-lg hover:bg-muted/50 transition-colors"
        >
          <span className="text-sm font-medium">Shared accounts</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {sharedAccounts.length} account{sharedAccounts.length !== 1 ? "s" : ""}
            </span>
            {accountSectionExpanded("__shared__") ? (
              <ChevronUp className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 shrink-0" />
            )}
          </div>
        </button>
        {accountSectionExpanded("__shared__") && (
          <div className="ml-2 space-y-1.5 mt-1">
            {sharedAccounts.map((a) => (
              <div
                key={a.id}
                className="group flex items-center justify-between p-2 rounded-bento-inner bg-muted/30 text-xs"
              >
                <div className="min-w-0 pr-2">
                  <span className="font-medium">{a.name}</span>
                  <span className="ml-2 text-muted-foreground capitalize">{a.type}</span>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Co-owners: {sharedLabel(a)}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="tabular-nums">{formatSEK(a.balance_snapshot || 0)}</span>
                  <button
                    type="button"
                    onClick={() => setEditingAccount(a)}
                    className="p-0.5 rounded hover:bg-muted text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                    title="Edit account"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => handleArchiveAccount(a.id)}
                    disabled={busy}
                    className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                  >
                    <Archive className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
            {sharedAccounts.length === 0 && !addingShared && (
              <p className="text-xs text-muted-foreground pl-2">No shared accounts yet</p>
            )}

            {addingShared ? (
              <div className="p-2 rounded-bento-inner bg-muted/20 space-y-2 mt-2">
                <input
                  type="text"
                  placeholder="Account name"
                  value={accName}
                  onChange={(e) => setAccName(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg bg-card border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Balance (optional)"
                  value={accBalance}
                  onChange={(e) => setAccBalance(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg bg-card border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <select
                  value={accType}
                  onChange={(e) => setAccType(e.target.value as AccountType)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg bg-card border border-border"
                >
                  <option value="bank">Bank</option>
                  <option value="savings">Savings</option>
                  <option value="investment">Investment</option>
                  <option value="loan">Loan</option>
                  <option value="pension">Pension</option>
                  <option value="credit">Credit</option>
                </select>
                <p className="text-[10px] text-muted-foreground">Co-owners (select at least two)</p>
                <div className="flex flex-wrap gap-2">
                  {entities.map((e) => (
                    <label key={e.id} className="flex items-center gap-1.5 text-[10px] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sharedCoIds.includes(e.id)}
                        onChange={() => toggleSharedCo(e.id)}
                        className="rounded border-border"
                      />
                      {e.name}
                    </label>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => void handleAddSharedAccount()}
                    disabled={busy || sharedCoIds.length < 2}
                    className="px-3 py-1.5 text-[10px] rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {busy ? "Saving..." : "Add shared account"}
                  </button>
                  <button
                    onClick={() => {
                      setAddingShared(false);
                      setSharedCoIds([]);
                      setAccName("");
                      setAccBalance("");
                    }}
                    className="px-3 py-1.5 text-[10px] rounded-lg bg-muted text-muted-foreground hover:bg-muted/80"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => {
                  setAddingShared(true);
                  setAccName("");
                  setAccBalance("");
                  setSharedCoIds([]);
                }}
                className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 mt-1 ml-2"
              >
                <Plus className="w-3 h-3" /> Add shared account
              </button>
            )}
          </div>
        )}
      </div>

      {byEntity.map(({ entity, accounts: accts }) => (
        <div key={entity.id}>
          <button
            type="button"
            onClick={() => toggleAccountSection(entity.id)}
            className="flex items-center justify-between w-full text-left p-2 rounded-lg hover:bg-muted/50 transition-colors"
          >
            <span className="text-sm font-medium">{entity.name}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {accts.length} personal account{accts.length !== 1 ? "s" : ""}
              </span>
              {accountSectionExpanded(entity.id) ? (
                <ChevronUp className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 shrink-0" />
              )}
            </div>
          </button>
          {accountSectionExpanded(entity.id) && (
            <div className="ml-2 space-y-1.5 mt-1">
              {accts.map((a) => (
                <div
                  key={a.id}
                  className="group flex items-center justify-between p-2 rounded-bento-inner bg-muted/30 text-xs"
                >
                  <div className="min-w-0 pr-2">
                    <span className="font-medium">{a.name}</span>
                    <span className="ml-2 text-muted-foreground capitalize">{a.type}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="tabular-nums">{formatSEK(a.balance_snapshot || 0)}</span>
                    <button
                      type="button"
                      onClick={() => setEditingAccount(a)}
                      className="p-0.5 rounded hover:bg-muted text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                      title="Edit account"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => handleArchiveAccount(a.id)}
                      disabled={busy}
                      className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                    >
                      <Archive className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
              {accts.length === 0 && <p className="text-xs text-muted-foreground pl-2">No personal accounts</p>}

              {addingFor === entity.id ? (
                <div className="p-2 rounded-bento-inner bg-muted/20 space-y-2 mt-2">
                  <input
                    type="text"
                    placeholder="Account name"
                    value={accName}
                    onChange={(e) => setAccName(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg bg-card border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="Balance (optional)"
                    value={accBalance}
                    onChange={(e) => setAccBalance(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg bg-card border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <select
                    value={accType}
                    onChange={(e) => setAccType(e.target.value as AccountType)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg bg-card border border-border"
                  >
                    <option value="bank">Bank</option>
                    <option value="savings">Savings</option>
                    <option value="investment">Investment</option>
                    <option value="loan">Loan</option>
                    <option value="pension">Pension</option>
                    <option value="credit">Credit</option>
                  </select>
                  <label className="flex items-center gap-2 text-[10px] cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded border-border"
                      checked={addAsJoint}
                      onChange={(e) => {
                        setAddAsJoint(e.target.checked);
                        if (!e.target.checked) setAddJointExtraIds([]);
                      }}
                    />
                    Shared with other household members (joint account)
                  </label>
                  {addAsJoint && (
                    <>
                      <p className="text-[10px] text-muted-foreground">Also owned by (select at least one besides {entity.name})</p>
                      <div className="flex flex-wrap gap-2">
                        {entities
                          .filter((e) => e.id !== entity.id)
                          .map((e) => (
                            <label key={e.id} className="flex items-center gap-1.5 text-[10px] cursor-pointer">
                              <input
                                type="checkbox"
                                checked={addJointExtraIds.includes(e.id)}
                                onChange={() => toggleAddJointExtra(e.id)}
                                className="rounded border-border"
                              />
                              {e.name}
                            </label>
                          ))}
                      </div>
                    </>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => void handleAddAccount(entity.id)}
                      disabled={busy || (addAsJoint && addJointExtraIds.length < 1)}
                      className="px-3 py-1.5 text-[10px] rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      {busy ? "Saving..." : "Add"}
                    </button>
                    <button
                      onClick={() => {
                        setAddingFor(null);
                        setAddAsJoint(false);
                        setAddJointExtraIds([]);
                      }}
                      className="px-3 py-1.5 text-[10px] rounded-lg bg-muted text-muted-foreground hover:bg-muted/80"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setAddingFor(entity.id);
                    setAccName("");
                    setAccBalance("");
                    setAddAsJoint(false);
                    setAddJointExtraIds([]);
                  }}
                  className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 mt-1 ml-2"
                >
                  <Plus className="w-3 h-3" /> Add personal account
                </button>
              )}
            </div>
          )}
        </div>
      ))}
      {entities.length === 0 && <p className="text-xs text-muted-foreground">{t("cards.data.add_entities_first")}</p>}
    </div>
  );
}

function CashflowsBentoCard(p: {
  size: CardSize;
  onHide: () => void;
  onResize: (s: CardSize) => void;
  dragHandleProps: Record<string, unknown>;
}) {
  const { t } = useTranslation();
  const [importsSectionHidden, setImportsSectionHidden] = useState(true);
  return (
    <Card
      title={t("cards.data.cashflows")}
      subtitle={t("cards.data.cashflows_sub")}
      icon={<ArrowDownUp className="w-4 h-4" />}
      headerTrailing={
        <button
          type="button"
          onClick={() => setImportsSectionHidden((v) => !v)}
          className="text-[11px] px-2 py-1 rounded-md border border-border text-muted-foreground hover:bg-muted/80 hover:text-card-foreground whitespace-nowrap shrink-0"
          title={importsSectionHidden ? t("cards.data.imports_title_show") : t("cards.data.imports_title_hide")}
        >
          {importsSectionHidden ? t("cards.data.imports_show") : t("cards.data.imports_hide")}
        </button>
      }
      {...p}
    >
      <CashflowManagerCardContent importsSectionHidden={importsSectionHidden} />
    </Card>
  );
}

function CashflowManagerCardContent({ importsSectionHidden = false }: { importsSectionHidden?: boolean }) {
  const { t } = useTranslation();
  const { cashflows, entities, household, refresh, transactions, accounts, periods } = useAppStore();
  const backend = useBackend();
  const openCsvImport = useOpenCsvImport();
  const [adding, setAdding] = useState(false);
  const [cfName, setCfName] = useState("");
  const [cfEntityId, setCfEntityId] = useState("");
  const [cfDirection, setCfDirection] = useState<CashflowDirection>("income");
  const [cfCategory, setCfCategory] = useState<CashflowCategory>("salary");
  const [cfAmount, setCfAmount] = useState("");
  const [cfFreq, setCfFreq] = useState<Frequency>("monthly");
  const [cfFromId, setCfFromId] = useState("");
  const [cfToId, setCfToId] = useState("");
  const [cfEmploymentFrom, setCfEmploymentFrom] = useState("");
  const [cfEmploymentUntil, setCfEmploymentUntil] = useState("");
  const [cfInternalHideFlow, setCfInternalHideFlow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editingCashflow, setEditingCashflow] = useState<Cashflow | null>(null);
  const [editName, setEditName] = useState("");
  const [editEntityId, setEditEntityId] = useState("");
  const [editDirection, setEditDirection] = useState<CashflowDirection>("income");
  const [editCategory, setEditCategory] = useState<CashflowCategory>("salary");
  const [editAmount, setEditAmount] = useState("");
  const [editFreq, setEditFreq] = useState<Frequency>("monthly");
  const [editFromId, setEditFromId] = useState("");
  const [editToId, setEditToId] = useState("");
  const [editEmploymentFrom, setEditEmploymentFrom] = useState("");
  const [editEmploymentUntil, setEditEmploymentUntil] = useState("");
  const [editInternalHideFlow, setEditInternalHideFlow] = useState(false);

  useEffect(() => {
    if (!editingCashflow) return;
    const c = editingCashflow;
    setEditName(c.name);
    setEditEntityId(c.entity_id);
    setEditDirection(c.direction);
    setEditCategory(c.category);
    setEditAmount(String(c.amount));
    setEditFreq(c.frequency);
    const legs = resolveCashflowAccountLegs(c);
    setEditFromId(legs.fromId ?? "");
    setEditToId(legs.toId ?? "");
    setEditEmploymentFrom(c.employment_active_from?.slice(0, 10) ?? "");
    setEditEmploymentUntil(c.employment_active_until?.slice(0, 10) ?? "");
    setEditInternalHideFlow(cashflowIncomeInternalHideFromFlow(c));
  }, [editingCashflow]);

  const householdEntityIds = useMemo(() => {
    if (!household) return new Set<string>();
    return new Set(
      entities.filter((e) => !e.archived_at && e.household_id === household.id).map((e) => e.id),
    );
  }, [entities, household]);

  const cashflowRoutingAccounts = useMemo(
    () =>
      accountsVisibleForHouseholdCashflowRouting(accounts, householdEntityIds)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [accounts, householdEntityIds],
  );

  const projection = useProjection(1);
  const projectedParentalBenefits = useMemo(() => {
    const rows: { entityId: string; entityName: string; gross: number; net: number }[] = [];
    for (const e of entities) {
      if (e.archived_at) continue;
      const monthProj = projection.months.find((m) => m.entity_id === e.id);
      const b = parentalLeaveBenefitFromProjection(monthProj);
      if (b && b.gross > 0) {
        rows.push({
          entityId: e.id,
          entityName: e.name,
          gross: b.gross,
          net: b.net,
        });
      }
    }
    rows.sort((a, b) =>
      a.entityName.localeCompare(b.entityName, undefined, { sensitivity: "base" }),
    );
    return rows;
  }, [entities, projection.months]);

  const referenceMonth = useMemo(() => startOfMonth(new Date()), []);

  const incomesForDisplayedNet = useMemo(
    () =>
      cashflows.filter(
        (c) =>
          c.direction === "income" &&
          employmentIncomeShownInCashflowsManager(c) &&
          cashflowContributesToPnLTotals(c, accounts) &&
          !cashflowIncomeInternalHideFromFlow(c) &&
          !cashflowExcludedFromHouseholdTotals(c),
      ),
    [cashflows, accounts],
  );

  const incomeDisplayedNetById = useMemo(() => {
    const m = new Map<string, number>();
    if (!household) return m;
    for (const c of incomesForDisplayedNet) {
      m.set(
        c.id,
        displayedNetMonthlyIncomeForCashflow(c, accounts, periods, [], household, undefined, referenceMonth),
      );
    }
    return m;
  }, [incomesForDisplayedNet, accounts, periods, household, referenceMonth]);

  const persistParentalBenefitRouting = async (entity: Entity, routing: ModeledParentalBenefitRouting) => {
    if (!household) return;
    setBusy(true);
    try {
      await backend.upsertEntity({
        ...entity,
        metadata: mergeModeledParentalBenefitRouting(entity.metadata ?? {}, routing),
        updated_at: new Date().toISOString(),
      });
      await refresh();
    } catch (err) {
      console.error("Failed to save modeled föräldrapenning routing:", err);
    } finally {
      setBusy(false);
    }
  };

  const incomes = cashflows.filter(
    (c) => c.direction === "income" && employmentIncomeShownInCashflowsManager(c),
  );
  const expenses = cashflows.filter(
    (c) => c.direction === "expense" && !cashflowExcludedFromHouseholdTotals(c),
  );

  const savedIncomeLabels = useMemo(() => {
    const s = new Set<string>();
    for (const c of incomes) s.add(normalizeRecurringImportLabel(c.name));
    return s;
  }, [incomes]);
  const savedExpenseLabels = useMemo(() => {
    const s = new Set<string>();
    for (const c of expenses) s.add(normalizeRecurringImportLabel(c.name));
    return s;
  }, [expenses]);

  const importPatterns = useMemo(
    () => detectRecurringFromTransactions(transactions, accounts),
    [transactions, accounts],
  );
  /** Hide patterns that already have a matching saved cashflow name (same normalization as imports). */
  const importOut = useMemo(
    () =>
      importPatterns
        .filter(
          (p) =>
            p.direction === "out" &&
            !savedExpenseLabels.has(normalizeRecurringImportLabel(p.label)),
        )
        .slice()
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" })),
    [importPatterns, savedExpenseLabels],
  );
  const importIn = useMemo(
    () =>
      importPatterns
        .filter(
          (p) =>
            p.direction === "in" &&
            !savedIncomeLabels.has(normalizeRecurringImportLabel(p.label)),
        )
        .slice()
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" })),
    [importPatterns, savedIncomeLabels],
  );

  const hadImportInCandidates = useMemo(
    () => importPatterns.some((p) => p.direction === "in"),
    [importPatterns],
  );
  const hadImportOutCandidates = useMemo(
    () => importPatterns.some((p) => p.direction === "out"),
    [importPatterns],
  );

  const handleAdd = async () => {
    if (!cfName.trim() || !cfEntityId || !cfAmount || !household) return;
    setBusy(true);
    try {
      const from_account_id = cfFromId || null;
      const to_account_id = cfToId || null;
      const account_id = primaryCashflowAccountId({
        entity_id: cfEntityId,
        from_account_id,
        to_account_id,
        account_id: null,
        direction: cfDirection,
      } as Cashflow);
      const ew = employmentWindowForCategory(cfCategory, cfDirection, cfEmploymentFrom, cfEmploymentUntil);
      await backend.upsertCashflow({
        id: crypto.randomUUID(),
        entity_id: cfEntityId,
        account_id,
        from_account_id,
        to_account_id,
        direction: cfDirection,
        category: cfCategory,
        name: cfName.trim(),
        amount: Math.abs(Number(cfAmount)),
        currency: household.currency,
        frequency: cfFreq,
        date_from: new Date().toISOString().slice(0, 10),
        date_to: null,
        is_gross: cfDirection === "income",
        tax_rate_override: null,
        notes: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        archived_at: null,
        employment_active_from: ew.employment_active_from,
        employment_active_until: ew.employment_active_until,
        metadata: buildCashflowIncomeMetadata(null, cfInternalHideFlow),
      });
      setCfName("");
      setCfAmount("");
      setCfFromId("");
      setCfToId("");
      setCfEmploymentFrom("");
      setCfEmploymentUntil("");
      setCfInternalHideFlow(false);
      setAdding(false);
      await refresh();
    } catch (err) {
      console.error("Failed to add cashflow:", err);
    } finally {
      setBusy(false);
    }
  };

  const handleArchive = async (id: string) => {
    setEditingCashflow((cur) => (cur?.id === id ? null : cur));
    setBusy(true);
    try {
      await backend.archiveCashflow(id);
      await refresh();
    } catch (err) {
      console.error("Failed to archive cashflow:", err);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveEditCashflow = async () => {
    if (!editingCashflow || !household) return;
    if (!editName.trim() || !editEntityId || !editAmount) return;
    const amt = Number(editAmount);
    if (!Number.isFinite(amt)) return;
    setBusy(true);
    try {
      const from_account_id = editFromId || null;
      const to_account_id = editToId || null;
      const ew = employmentWindowForCategory(editCategory, editDirection, editEmploymentFrom, editEmploymentUntil);
      const merged = {
        ...editingCashflow,
        name: editName.trim(),
        entity_id: editEntityId,
        from_account_id,
        to_account_id,
        direction: editDirection,
        category: editCategory,
        amount: Math.abs(amt),
        currency: household.currency,
        frequency: editFreq,
        is_gross: editDirection === "income",
        employment_active_from: ew.employment_active_from,
        employment_active_until: ew.employment_active_until,
        updated_at: new Date().toISOString(),
        metadata: buildCashflowIncomeMetadata(editingCashflow.metadata, editInternalHideFlow),
      };
      merged.account_id = primaryCashflowAccountId(merged);
      await backend.upsertCashflow(merged);
      setEditingCashflow(null);
      await refresh();
    } catch (err) {
      console.error("Failed to save cashflow:", err);
    } finally {
      setBusy(false);
    }
  };

  const handleCreateFromPattern = async (
    direction: CashflowDirection,
    pattern: RecurringTxPattern,
  ) => {
    if (!household) return;
    const entityId =
      entities.find((e) => e.type === "adult" && !e.archived_at)?.id ??
      entities.find((e) => !e.archived_at)?.id;
    if (!entityId) return;
    setBusy(true);
    try {
      await backend.upsertCashflow({
        id: crypto.randomUUID(),
        entity_id: entityId,
        account_id: null,
        from_account_id: null,
        to_account_id: null,
        direction,
        category: "other",
        name: pattern.label.slice(0, 200),
        amount: Math.abs(pattern.typicalAmount),
        currency: household.currency,
        frequency: "monthly",
        date_from: new Date().toISOString().slice(0, 10),
        date_to: null,
        is_gross: direction === "income",
        tax_rate_override: null,
        notes: "From import pattern (drag-drop)",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        archived_at: null,
        employment_active_from: null,
        employment_active_until: null,
      });
      await refresh();
    } catch (err) {
      console.error("Failed to add cashflow from import pattern:", err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 min-w-0 overflow-x-hidden">
      {importsSectionHidden ? null : (
        <div className="rounded-bento-inner bg-muted/20 p-3 space-y-3 text-xs border border-border/40 min-w-0">
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          <span className="font-medium text-card-foreground">Cashflows</span> are recurring budget lines you attach to an entity (salary, rent, subscriptions). They drive overview and planning projections. The lists below that are{" "}
          <span className="font-medium text-card-foreground">inferred from imported bank transactions</span>—same description and direction at least twice on bank, savings, or credit accounts (median amount shown).{" "}
          <span className="font-medium text-card-foreground">Drag</span> a row into <span className="font-medium text-card-foreground">Income streams</span> or <span className="font-medium text-card-foreground">Recurring expenses</span> to save it as a monthly cashflow (first adult entity, category Other — edit in Data if needed). Once saved (or if you add a cashflow with the same label manually), matching import rows are removed from these lists.
        </p>
        {importPatterns.length === 0 ? (
          <p className="text-muted-foreground text-[11px]">
            No recurring patterns detected. Import account CSVs on this page, then reload data.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <h4 className="text-[10px] font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
                General in (imports)
              </h4>
              <ul className="space-y-0.5 max-h-44 overflow-y-auto overflow-x-hidden pr-1 min-w-0">
                {importIn.map((r) => (
                  <ImportPatternDragRow key={`i-${r.label}`} pattern={r} amountClassName="text-income" />
                ))}
              </ul>
              {importIn.length === 0 && (
                <p className="text-[10px] text-muted-foreground">
                  {hadImportInCandidates
                    ? "No remaining inflows — patterns matching a saved income stream are hidden."
                    : "No repeating inflows found."}
                </p>
              )}
            </div>
            <div>
              <h4 className="text-[10px] font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
                General out (imports)
              </h4>
              <ul className="space-y-0.5 max-h-44 overflow-y-auto overflow-x-hidden pr-1 min-w-0">
                {importOut.map((r) => (
                  <ImportPatternDragRow key={`o-${r.label}`} pattern={r} amountClassName="text-expense" />
                ))}
              </ul>
              {importOut.length === 0 && (
                <p className="text-[10px] text-muted-foreground">
                  {hadImportOutCandidates
                    ? "No remaining outflows — patterns matching a saved recurring expense are hidden."
                    : "No repeating outflows found."}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start min-w-0 [&>*]:min-w-0">
        <CashflowSavedDropSection
          title="Income Streams (saved)"
          targetDirection="income"
          flows={incomes}
          entities={entities}
          accounts={accounts}
          busy={busy}
          onArchive={handleArchive}
          onEdit={(c) => {
            setAdding(false);
            setEditingCashflow(c);
          }}
          onDropPattern={handleCreateFromPattern}
          incomeDisplayedNetById={incomeDisplayedNetById}
          referenceMonth={referenceMonth}
          topSupplement={
            projectedParentalBenefits.length > 0 ? (
              <div className="rounded-md bg-muted/50 px-2 py-2 space-y-2 mb-1">
                <p className="text-[10px] font-medium text-card-foreground">
                  <span
                    className="cursor-help underline decoration-dotted decoration-border underline-offset-2"
                    title="From Planning calendar + SGI — same as this month's projection and Finance Flow. Not a saved cashflow. Route From / To here (stored on the entity) so Finance Flow matches where FK lands."
                  >
                    Parental Leave compensation
                  </span>
                </p>
                <ul className="space-y-2">
                  {projectedParentalBenefits.map((p) => {
                    const ent = entities.find((x) => x.id === p.entityId);
                    if (!ent) return null;
                    return (
                      <li
                        key={p.entityId}
                        className="text-[10px] leading-snug border-t border-border/40 pt-2 first:border-t-0 first:pt-0"
                      >
                        <span className="font-medium text-card-foreground">{p.entityName}</span>
                        <div className="flex flex-wrap gap-x-3 gap-y-0 mt-0.5 tabular-nums">
                          <span>
                            <span className="text-muted-foreground">Gross </span>
                            {formatSEK(p.gross)}
                            <span className="text-muted-foreground font-normal">/month</span>
                          </span>
                          <span>
                            <span className="text-muted-foreground">Net </span>
                            <span className="text-income">{formatSEK(p.net)}</span>
                            <span className="text-muted-foreground font-normal">/month</span>
                          </span>
                        </div>
                        <ModeledParentalBenefitRoutingFields
                          entity={ent}
                          entities={entities}
                          accounts={accounts}
                          routingAccounts={cashflowRoutingAccounts}
                          household={household}
                          disabled={busy}
                          onPersist={persistParentalBenefitRouting}
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : undefined
          }
        />
        <CashflowSavedDropSection
          title="Recurring expenses (saved)"
          targetDirection="expense"
          flows={expenses}
          entities={entities}
          accounts={accounts}
          busy={busy}
          onArchive={handleArchive}
          onEdit={(c) => {
            setAdding(false);
            setEditingCashflow(c);
          }}
          onDropPattern={handleCreateFromPattern}
        />
      </div>

      {editingCashflow ? (
        <div className="p-3 rounded-bento-inner bg-muted/25 space-y-2 border border-primary/25 min-w-0 overflow-x-hidden">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-card-foreground">Edit cashflow</span>
            <button
              type="button"
              onClick={() => setEditingCashflow(null)}
              className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-card-foreground"
              title="Dismiss"
              aria-label="Dismiss editing"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <input
            type="text"
            placeholder="Name (e.g. Salary, Rent)"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="w-full px-3 py-1.5 text-sm rounded-lg bg-card border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <div className="grid grid-cols-2 gap-2 min-w-0">
            <select
              value={editDirection}
              onChange={(e) => setEditDirection(e.target.value as CashflowDirection)}
              className="min-w-0 w-full px-3 py-1.5 text-sm rounded-lg bg-card border border-border"
            >
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
            <select
              value={editCategory}
              onChange={(e) => setEditCategory(e.target.value as CashflowCategory)}
              className="min-w-0 w-full px-3 py-1.5 text-sm rounded-lg bg-card border border-border"
            >
              <option value="salary">Salary</option>
              <option value="dividend">Dividend</option>
              <option value="freelance">Freelance</option>
              <option value="rent">Rent</option>
              <option value="mortgage">Mortgage</option>
              <option value="childcare">Childcare</option>
              <option value="groceries">Groceries</option>
              <option value="transport">Transport</option>
              <option value="insurance">Insurance</option>
              <option value="subscription">Subscription</option>
              <option value="utility">Utility</option>
              <option value="loan_repayment">Loan Repayment</option>
              <option value="savings_transfer">Savings Transfer</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2 min-w-0">
            <input
              type="number"
              placeholder="Amount"
              value={editAmount}
              onChange={(e) => setEditAmount(e.target.value)}
              className="min-w-0 w-full px-3 py-1.5 text-sm rounded-lg bg-card border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <select
              value={editFreq}
              onChange={(e) => setEditFreq(e.target.value as Frequency)}
              className="min-w-0 w-full px-3 py-1.5 text-sm rounded-lg bg-card border border-border"
            >
              <option value="monthly">Monthly</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Biweekly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annually">Annually</option>
              <option value="one_off">One-off</option>
            </select>
          </div>
          {editDirection === "income" && (editCategory === "salary" || editCategory === "freelance") && (
            <div className="grid grid-cols-2 gap-2 min-w-0">
              <label className="min-w-0 space-y-0.5">
                <span className="block text-[10px] text-muted-foreground">Employment from</span>
                <input
                  type="date"
                  value={editEmploymentFrom}
                  onChange={(e) => setEditEmploymentFrom(e.target.value)}
                  className="w-full min-w-0 px-3 py-1.5 text-sm rounded-lg bg-card border border-border"
                />
              </label>
              <label className="min-w-0 space-y-0.5">
                <span className="block text-[10px] text-muted-foreground">Until</span>
                <input
                  type="date"
                  value={editEmploymentUntil}
                  onChange={(e) => setEditEmploymentUntil(e.target.value)}
                  className="w-full min-w-0 px-3 py-1.5 text-sm rounded-lg bg-card border border-border"
                />
              </label>
            </div>
          )}
          <select
            value={editEntityId}
            onChange={(e) => {
              setEditEntityId(e.target.value);
              setEditFromId("");
              setEditToId("");
            }}
            className="w-full px-3 py-1.5 text-sm rounded-lg bg-card border border-border"
          >
            <option value="">Select entity...</option>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} ({e.type})
              </option>
            ))}
          </select>
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground leading-snug">
              From / to: any household bank, savings, card, investment, or pension account (shared and personal). Pick who this cashflow belongs to below.
            </p>
            <div className="grid grid-cols-2 gap-2 min-w-0">
              <div className="min-w-0">
                <label className="block text-[10px] text-muted-foreground mb-0.5">From</label>
                <select
                  value={editFromId}
                  onChange={(e) => setEditFromId(e.target.value)}
                  disabled={!household || cashflowRoutingAccounts.length === 0}
                  className="w-full min-w-0 px-3 py-1.5 text-sm rounded-lg bg-card border border-border disabled:opacity-50"
                >
                  <option value="">Outside household</option>
                  {cashflowRoutingAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {labelAccountForCashflowLeg(a, entities)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-0">
                <label className="block text-[10px] text-muted-foreground mb-0.5">To</label>
                <select
                  value={editToId}
                  onChange={(e) => setEditToId(e.target.value)}
                  disabled={!household || cashflowRoutingAccounts.length === 0}
                  className="w-full min-w-0 px-3 py-1.5 text-sm rounded-lg bg-card border border-border disabled:opacity-50"
                >
                  <option value="">Outside household</option>
                  {cashflowRoutingAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {labelAccountForCashflowLeg(a, entities)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <label className="flex items-start gap-2 px-0.5 cursor-pointer">
            <input
              type="checkbox"
              checked={editInternalHideFlow}
              onChange={(e) => setEditInternalHideFlow(e.target.checked)}
              className="mt-0.5 rounded border-border"
              disabled={busy}
            />
            <span className="text-[10px] text-muted-foreground leading-snug">
              Household-internal — omit from Finance Flow totals, overview cash bar, and forward projections for this income or expense side.
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                openCsvImport(presetAccountForCashflowCsvImport(editingCashflow, accounts))
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border bg-muted/30 text-muted-foreground hover:bg-muted hover:text-card-foreground disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5" />
              CSV Import
            </button>
            <div className="flex gap-2 flex-1 justify-end">
              <button
                type="button"
                onClick={() => void handleSaveEditCashflow()}
                disabled={busy || !editEntityId}
                className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save changes"}
              </button>
              <button
                type="button"
                onClick={() => setEditingCashflow(null)}
                className="px-3 py-1.5 text-xs rounded-lg bg-muted text-muted-foreground hover:bg-muted/80"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : adding ? (
        <div className="p-3 rounded-bento-inner bg-muted/20 space-y-2 min-w-0 overflow-x-hidden">
          <input type="text" placeholder="Name (e.g. Salary, Rent)" value={cfName} onChange={e => setCfName(e.target.value)} className="w-full px-3 py-1.5 text-sm rounded-lg bg-card border border-border focus:outline-none focus:ring-2 focus:ring-primary/30" />
          <div className="grid grid-cols-2 gap-2 min-w-0">
            <select value={cfDirection} onChange={e => setCfDirection(e.target.value as CashflowDirection)} className="min-w-0 w-full px-3 py-1.5 text-sm rounded-lg bg-card border border-border">
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
            <select value={cfCategory} onChange={e => setCfCategory(e.target.value as CashflowCategory)} className="min-w-0 w-full px-3 py-1.5 text-sm rounded-lg bg-card border border-border">
              <option value="salary">Salary</option>
              <option value="dividend">Dividend</option>
              <option value="freelance">Freelance</option>
              <option value="rent">Rent</option>
              <option value="mortgage">Mortgage</option>
              <option value="childcare">Childcare</option>
              <option value="groceries">Groceries</option>
              <option value="transport">Transport</option>
              <option value="insurance">Insurance</option>
              <option value="subscription">Subscription</option>
              <option value="utility">Utility</option>
              <option value="loan_repayment">Loan Repayment</option>
              <option value="savings_transfer">Savings Transfer</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2 min-w-0">
            <input type="number" placeholder="Amount" value={cfAmount} onChange={e => setCfAmount(e.target.value)} className="min-w-0 w-full px-3 py-1.5 text-sm rounded-lg bg-card border border-border focus:outline-none focus:ring-2 focus:ring-primary/30" />
            <select value={cfFreq} onChange={e => setCfFreq(e.target.value as Frequency)} className="min-w-0 w-full px-3 py-1.5 text-sm rounded-lg bg-card border border-border">
              <option value="monthly">Monthly</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Biweekly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annually">Annually</option>
              <option value="one_off">One-off</option>
            </select>
          </div>
          {cfDirection === "income" && (cfCategory === "salary" || cfCategory === "freelance") && (
            <div className="grid grid-cols-2 gap-2 min-w-0">
              <label className="min-w-0 space-y-0.5">
                <span className="block text-[10px] text-muted-foreground">Employment from</span>
                <input
                  type="date"
                  value={cfEmploymentFrom}
                  onChange={(e) => setCfEmploymentFrom(e.target.value)}
                  className="w-full min-w-0 px-3 py-1.5 text-sm rounded-lg bg-card border border-border"
                />
              </label>
              <label className="min-w-0 space-y-0.5">
                <span className="block text-[10px] text-muted-foreground">Until</span>
                <input
                  type="date"
                  value={cfEmploymentUntil}
                  onChange={(e) => setCfEmploymentUntil(e.target.value)}
                  className="w-full min-w-0 px-3 py-1.5 text-sm rounded-lg bg-card border border-border"
                />
              </label>
            </div>
          )}
          <select
            value={cfEntityId}
            onChange={(e) => {
              setCfEntityId(e.target.value);
              setCfFromId("");
              setCfToId("");
            }}
            className="w-full px-3 py-1.5 text-sm rounded-lg bg-card border border-border"
          >
            <option value="">Select entity...</option>
            {entities.map(e => <option key={e.id} value={e.id}>{e.name} ({e.type})</option>)}
          </select>
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground leading-snug">
              From / to: any household bank, savings, card, investment, or pension account (shared and personal). Entity above sets who owns this cashflow line.
            </p>
            <div className="grid grid-cols-2 gap-2 min-w-0">
              <div className="min-w-0">
                <label className="block text-[10px] text-muted-foreground mb-0.5">From</label>
                <select
                  value={cfFromId}
                  onChange={(e) => setCfFromId(e.target.value)}
                  disabled={!household || cashflowRoutingAccounts.length === 0}
                  className="w-full min-w-0 px-3 py-1.5 text-sm rounded-lg bg-card border border-border disabled:opacity-50"
                >
                  <option value="">Outside household</option>
                  {cashflowRoutingAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {labelAccountForCashflowLeg(a, entities)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-0">
                <label className="block text-[10px] text-muted-foreground mb-0.5">To</label>
                <select
                  value={cfToId}
                  onChange={(e) => setCfToId(e.target.value)}
                  disabled={!household || cashflowRoutingAccounts.length === 0}
                  className="w-full min-w-0 px-3 py-1.5 text-sm rounded-lg bg-card border border-border disabled:opacity-50"
                >
                  <option value="">Outside household</option>
                  {cashflowRoutingAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {labelAccountForCashflowLeg(a, entities)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <label className="flex items-start gap-2 px-0.5 cursor-pointer">
            <input
              type="checkbox"
              checked={cfInternalHideFlow}
              onChange={(e) => setCfInternalHideFlow(e.target.checked)}
              className="mt-0.5 rounded border-border"
              disabled={busy}
            />
            <span className="text-[10px] text-muted-foreground leading-snug">
              Household-internal — omit from Finance Flow totals, overview cash bar, and forward projections for this income or expense side.
            </span>
          </label>
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={busy || !cfEntityId} className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">{busy ? "Saving..." : "Add"}</button>
            <button onClick={() => setAdding(false)} className="px-3 py-1.5 text-xs rounded-lg bg-muted text-muted-foreground hover:bg-muted/80">Cancel</button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setEditingCashflow(null);
            setCfFromId("");
            setCfToId("");
            setCfEmploymentFrom("");
            setCfEmploymentUntil("");
            setCfInternalHideFlow(false);
            setAdding(true);
          }}
          className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Add cashflow
        </button>
      )}
    </div>
  );
}

function LoansCardMonthlyTotal() {
  const { loans } = useAppStore();
  const total = loans.reduce((s, l) => s + (l.monthly_payment ?? 0), 0);
  return (
    <div className="text-right -mt-0.5">
      <p className="text-[10px] text-muted-foreground leading-none">Monthly cost</p>
      <p className="text-xl font-bold tabular-nums text-expense leading-tight mt-1">{formatSEK(total)}</p>
    </div>
  );
}

function LoanManagerCardContent() {
  const { loans, accounts, entities, household, refresh } = useAppStore();
  const backend = useBackend();
  const openCsvImport = useOpenCsvImport();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loanName, setLoanName] = useState("");
  const [loanType, setLoanType] = useState<LoanType>("mortgage");
  const [linkMode, setLinkMode] = useState<"existing" | "new">("new");
  const [existingAccountId, setExistingAccountId] = useState("");
  const [newAccName, setNewAccName] = useState("");
  const [newAccShared, setNewAccShared] = useState(false);
  const [newAccEntityId, setNewAccEntityId] = useState("");
  const [newAccCoIds, setNewAccCoIds] = useState<string[]>([]);
  const [principal, setPrincipal] = useState("");
  const [outstanding, setOutstanding] = useState("");
  const [rateType, setRateType] = useState<RateType>("fixed");
  const [interestPct, setInterestPct] = useState("");
  const [rateFixedUntil, setRateFixedUntil] = useState("");
  const [rateIndex, setRateIndex] = useState("");
  const [rateMarginPct, setRateMarginPct] = useState("");
  const [amortType, setAmortType] = useState<AmortizationType>("annuity");
  const [monthlyPay, setMonthlyPay] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState("");

  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  const [editName, setEditName] = useState("");
  const [editLoanType, setEditLoanType] = useState<LoanType>("mortgage");
  const [editPrincipal, setEditPrincipal] = useState("");
  const [editOutstanding, setEditOutstanding] = useState("");
  const [editRateType, setEditRateType] = useState<RateType>("fixed");
  const [editInterestPct, setEditInterestPct] = useState("");
  const [editRateFixedUntil, setEditRateFixedUntil] = useState("");
  const [editRateIndex, setEditRateIndex] = useState("");
  const [editRateMarginPct, setEditRateMarginPct] = useState("");
  const [editAmortType, setEditAmortType] = useState<AmortizationType>("annuity");
  const [editMonthlyPay, setEditMonthlyPay] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [loanCsvFeedback, setLoanCsvFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );
  const loanSetupCsvInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editingLoan) return;
    setEditName(editingLoan.name);
    setEditLoanType(editingLoan.type);
    setEditPrincipal(String(editingLoan.principal));
    setEditOutstanding(String(editingLoan.outstanding));
    setEditRateType(editingLoan.rate_type);
    setEditInterestPct(
      editingLoan.interest_rate > 0 ? String(Math.round(editingLoan.interest_rate * 1e6) / 1e4) : ""
    );
    setEditRateFixedUntil(editingLoan.rate_fixed_until ?? "");
    setEditRateIndex(editingLoan.rate_index ?? "");
    setEditRateMarginPct(
      editingLoan.rate_margin != null ? String(Math.round(editingLoan.rate_margin * 1e6) / 1e4) : ""
    );
    setEditAmortType(editingLoan.amortization_type);
    setEditMonthlyPay(editingLoan.monthly_payment != null ? String(editingLoan.monthly_payment) : "");
    setEditStartDate(editingLoan.start_date);
    setEditEndDate(editingLoan.end_date ?? "");
  }, [editingLoan]);

  const loanAccounts = accounts.filter((a) => a.type === "loan" && !a.archived_at);
  const toggleNewAccCo = (id: string) => {
    setNewAccCoIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const resetLoanForm = () => {
    setLoanName("");
    setNewAccName("");
    setPrincipal("");
    setOutstanding("");
    setInterestPct("");
    setRateFixedUntil("");
    setRateIndex("");
    setRateMarginPct("");
    setMonthlyPay("");
    setNewAccCoIds([]);
    setNewAccShared(false);
    setNewAccEntityId("");
    setExistingAccountId("");
    setEndDate("");
  };

  const resolveEntityIdByName = (label: string | null): string | null => {
    if (!label?.trim()) return null;
    const t = label.trim().toLowerCase();
    const hit = entities.find((e) => !e.archived_at && e.name.trim().toLowerCase() === t);
    return hit?.id ?? null;
  };

  const ensureLoanAccountForImportRow = async (row: ParsedLoanSetupRow): Promise<string> => {
    if (!household) throw new Error("No household");
    const existingId = row.existingAccountId?.trim();
    if (existingId) {
      const ok = accounts.some(
        (a) =>
          !a.archived_at &&
          a.type === "loan" &&
          a.id === existingId,
      );
      if (!ok) throw new Error("existing_account_id does not match an active loan account");
      return existingId;
    }
    const name = row.accountName?.trim() || `${row.name.trim()} — account`;
    let entityId: string;
    let metadata: Record<string, unknown>;
    if (row.shared) {
      if (row.coOwnerNames.length < 2)
        throw new Error('Shared loan needs co_owners with two names (use "|" between names)');
      const ids = row.coOwnerNames.map((lb) => resolveEntityIdByName(lb)).filter(Boolean) as string[];
      if (ids.length !== row.coOwnerNames.length)
        throw new Error("Could not match every co_owners name to a household entity");
      const sorted = [...new Set(ids)].sort();
      if (sorted.length < 2) throw new Error("co_owners must be two different entities");
      entityId = sorted[0];
      metadata = { shared: true, co_entity_ids: sorted };
    } else {
      const oid = resolveEntityIdByName(row.ownerEntityName);
      if (!oid) throw new Error("owner_entity_name or kontohavare must match an entity name");
      entityId = oid;
      metadata = {};
    }
    const acc = await backend.upsertAccount({
      id: crypto.randomUUID(),
      entity_id: entityId,
      type: "loan",
      name,
      iban: row.iban?.trim() || null,
      currency: household.currency,
      balance_snapshot: -Math.abs(row.outstanding),
      balance_snapshot_date: new Date().toISOString().slice(0, 10),
      bank_name: row.bankName?.trim() || null,
      csv_parser_config_id: null,
      is_active: true,
      metadata,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      archived_at: null,
    });
    return acc.id;
  };

  const upsertLoanFromParsedRow = async (accountId: string, row: ParsedLoanSetupRow) => {
    if (!household) throw new Error("No household");
    await backend.upsertLoan({
      id: crypto.randomUUID(),
      account_id: accountId,
      name: row.name.trim(),
      type: row.loanType,
      rate_type: row.rateType,
      principal: row.principal,
      outstanding: row.outstanding,
      interest_rate: row.interestPct / 100,
      rate_index: row.rateType === "floating" && row.rateIndex?.trim() ? row.rateIndex.trim() : null,
      rate_margin:
        row.rateType === "floating" && row.rateMarginPct != null && Number.isFinite(row.rateMarginPct)
          ? row.rateMarginPct / 100
          : null,
      rate_fixed_until: row.rateType === "fixed" && row.rateFixedUntil ? row.rateFixedUntil : null,
      amortization_type: row.amortType,
      monthly_payment: row.monthlyPayment,
      start_date: row.startDate,
      end_date: row.endDate,
      currency: household.currency,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  };

  const applyParsedLoanRowToForm = (row: ParsedLoanSetupRow) => {
    setLoanName(row.name);
    setLoanType(row.loanType);
    setPrincipal(String(row.principal));
    setOutstanding(String(row.outstanding));
    setInterestPct(String(row.interestPct));
    setRateType(row.rateType);
    setRateFixedUntil(row.rateFixedUntil ?? "");
    setRateIndex(row.rateIndex ?? "");
    setRateMarginPct(row.rateMarginPct != null ? String(row.rateMarginPct) : "");
    setAmortType(row.amortType);
    setMonthlyPay(row.monthlyPayment != null ? String(row.monthlyPayment) : "");
    setStartDate(row.startDate);
    setEndDate(row.endDate ?? "");
    setNewAccName(row.accountName ?? "");
    if (row.existingAccountId?.trim()) {
      setLinkMode("existing");
      setExistingAccountId(row.existingAccountId.trim());
      setNewAccShared(false);
      setNewAccCoIds([]);
      setNewAccEntityId("");
    } else {
      setLinkMode("new");
      setExistingAccountId("");
      setNewAccShared(row.shared);
      if (row.shared && row.coOwnerNames.length >= 2) {
        const ids = row.coOwnerNames
          .map((lb) => resolveEntityIdByName(lb))
          .filter((x): x is string => Boolean(x));
        setNewAccCoIds(ids.length >= 2 ? ids : []);
      } else {
        setNewAccCoIds([]);
        setNewAccEntityId(resolveEntityIdByName(row.ownerEntityName) ?? "");
      }
    }
  };

  const handleLoanSetupCsvChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !household) return;
    setLoanCsvFeedback(null);
    try {
      const text = await file.text();
      const { rows, warnings } = parseLoanSetupCsv(text);
      if (rows.length === 0) {
        const msg = warnings.length ? warnings.join("\n") : "No loan rows found in CSV.";
        setLoanCsvFeedback({ kind: "err", text: msg });
        return;
      }
      if (rows.length === 1) {
        applyParsedLoanRowToForm(rows[0]);
        const extra = warnings.length ? `\n${warnings.join("\n")}` : "";
        setLoanCsvFeedback({
          kind: "ok",
          text: `Filled the form from CSV — review loan account linking and click Add loan.${extra}`,
        });
        return;
      }
      if (
        !window.confirm(
          `Import ${rows.length} loans from this CSV? Each row creates or links a loan account.`,
        )
      )
        return;

      setBusy(true);
      let imported = 0;
      const errs: string[] = [...warnings];
      for (const row of rows) {
        try {
          const accountId = await ensureLoanAccountForImportRow(row);
          await upsertLoanFromParsedRow(accountId, row);
          imported++;
        } catch (err) {
          errs.push(`${row.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      await refresh();
      resetLoanForm();
      setAdding(false);
      setLoanCsvFeedback({
        kind: imported === rows.length ? "ok" : "err",
        text:
          imported === rows.length
            ? `Imported ${imported} loans.${warnings.length ? `\n${warnings.join("\n")}` : ""}`
            : errs.join("\n"),
      });
    } catch (err) {
      setLoanCsvFeedback({
        kind: "err",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  const ensureLoanAccount = async (): Promise<string> => {
    if (!household) throw new Error("No household");
    if (linkMode === "existing") {
      if (!existingAccountId) throw new Error("Select a loan account");
      return existingAccountId;
    }
    const name = newAccName.trim() || `${loanName.trim() || "Loan"} — account`;
    let entityId: string;
    let metadata: Record<string, unknown> | undefined;
    if (newAccShared) {
      const sorted = [...newAccCoIds].sort();
      if (sorted.length < 2) throw new Error("Select at least two co-owners for a shared loan account");
      entityId = sorted[0];
      metadata = { shared: true, co_entity_ids: sorted };
    } else {
      if (!newAccEntityId) throw new Error("Select account owner");
      entityId = newAccEntityId;
      metadata = {};
    }
    const out = Number(outstanding.replace(",", "."));
    const acc = await backend.upsertAccount({
      id: crypto.randomUUID(),
      entity_id: entityId,
      type: "loan",
      name,
      iban: null,
      currency: household.currency,
      balance_snapshot: Number.isFinite(out) ? -Math.abs(out) : 0,
      balance_snapshot_date: new Date().toISOString().slice(0, 10),
      bank_name: null,
      csv_parser_config_id: null,
      is_active: true,
      metadata,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      archived_at: null,
    });
    return acc.id;
  };

  const handleAddLoan = async () => {
    if (!household || !loanName.trim()) return;
    const p = Number(principal.replace(",", "."));
    const o = Number(outstanding.replace(",", "."));
    const ir = Number(interestPct.replace(",", "."));
    if (!Number.isFinite(p) || !Number.isFinite(o) || !Number.isFinite(ir)) return;
    setBusy(true);
    try {
      const accountId = await ensureLoanAccount();
      await backend.upsertLoan({
        id: crypto.randomUUID(),
        account_id: accountId,
        name: loanName.trim(),
        type: loanType,
        rate_type: rateType,
        principal: p,
        outstanding: o,
        interest_rate: ir / 100,
        rate_index: rateType === "floating" && rateIndex.trim() ? rateIndex.trim() : null,
        rate_margin:
          rateType === "floating" && rateMarginPct.trim()
            ? Number(rateMarginPct.replace(",", ".")) / 100
            : null,
        rate_fixed_until: rateType === "fixed" && rateFixedUntil ? rateFixedUntil : null,
        amortization_type: amortType,
        monthly_payment: monthlyPay.trim() ? Number(monthlyPay.replace(",", ".")) : null,
        start_date: startDate,
        end_date: endDate.trim() ? endDate : null,
        currency: household.currency,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      resetLoanForm();
      setAdding(false);
      await refresh();
    } catch (err) {
      console.error("Failed to add loan:", err);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveLoanEdit = async () => {
    if (!editingLoan || !household) return;
    const p = Number(editPrincipal.replace(",", "."));
    const o = Number(editOutstanding.replace(",", "."));
    const ir = Number(editInterestPct.replace(",", "."));
    if (!Number.isFinite(p) || !Number.isFinite(o) || !Number.isFinite(ir)) return;
    setBusy(true);
    try {
      await backend.upsertLoan({
        ...editingLoan,
        name: editName.trim(),
        type: editLoanType,
        principal: p,
        outstanding: o,
        interest_rate: ir / 100,
        rate_type: editRateType,
        rate_index: editRateType === "floating" && editRateIndex.trim() ? editRateIndex.trim() : null,
        rate_margin:
          editRateType === "floating" && editRateMarginPct.trim()
            ? Number(editRateMarginPct.replace(",", ".")) / 100
            : null,
        rate_fixed_until: editRateType === "fixed" && editRateFixedUntil ? editRateFixedUntil : null,
        amortization_type: editAmortType,
        monthly_payment: editMonthlyPay.trim() ? Number(editMonthlyPay.replace(",", ".")) : null,
        start_date: editStartDate,
        end_date: editEndDate.trim() ? editEndDate : null,
        updated_at: new Date().toISOString(),
      });
      const acc = accounts.find((a) => a.id === editingLoan.account_id);
      if (acc) {
        await backend.upsertAccount({
          ...acc,
          balance_snapshot: acc.type === "loan" ? -Math.abs(o) : acc.balance_snapshot,
          balance_snapshot_date: new Date().toISOString().slice(0, 10),
          updated_at: new Date().toISOString(),
        });
      }
      setEditingLoan(null);
      await refresh();
    } catch (err) {
      console.error("Failed to update loan:", err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {editingLoan && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close"
            onClick={() => !busy && setEditingLoan(null)}
          />
          <div
            className="relative w-full max-w-md max-h-[min(90vh,560px)] rounded-bento bg-card border border-border shadow-bento flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-labelledby="loan-edit-title"
          >
            <div className="flex items-start justify-between gap-2 p-4 pb-2 shrink-0 border-b border-border/50">
              <h2 id="loan-edit-title" className="text-sm font-semibold">
                Edit loan
              </h2>
              <button
                type="button"
                onClick={() => !busy && setEditingLoan(null)}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-2 overflow-y-auto text-xs flex-1 min-h-0">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-background border border-border"
                placeholder="Name"
              />
              <select
                value={editLoanType}
                onChange={(e) => setEditLoanType(e.target.value as LoanType)}
                className="w-full px-3 py-1.5 rounded-lg bg-background border border-border"
              >
                <option value="mortgage">Mortgage</option>
                <option value="car">Car</option>
                <option value="student">Student</option>
                <option value="personal">Personal</option>
                <option value="other">Other</option>
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  value={editPrincipal}
                  onChange={(e) => setEditPrincipal(e.target.value)}
                  className="px-3 py-1.5 rounded-lg bg-background border border-border"
                  placeholder="Principal"
                />
                <input
                  type="text"
                  inputMode="decimal"
                  value={editOutstanding}
                  onChange={(e) => setEditOutstanding(e.target.value)}
                  className="px-3 py-1.5 rounded-lg bg-background border border-border"
                  placeholder="Outstanding"
                />
              </div>
              <select
                value={editRateType}
                onChange={(e) => setEditRateType(e.target.value as RateType)}
                className="w-full px-3 py-1.5 rounded-lg bg-background border border-border"
              >
                <option value="fixed">Fixed rate</option>
                <option value="floating">Floating</option>
              </select>
              <input
                type="text"
                inputMode="decimal"
                value={editInterestPct}
                onChange={(e) => setEditInterestPct(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-background border border-border"
                placeholder="Nominal % p.a."
              />
              {editRateType === "fixed" ? (
                <input
                  type="date"
                  value={editRateFixedUntil}
                  onChange={(e) => setEditRateFixedUntil(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-background border border-border"
                />
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={editRateIndex}
                    onChange={(e) => setEditRateIndex(e.target.value)}
                    className="px-3 py-1.5 rounded-lg bg-background border border-border"
                    placeholder="Index"
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editRateMarginPct}
                    onChange={(e) => setEditRateMarginPct(e.target.value)}
                    className="px-3 py-1.5 rounded-lg bg-background border border-border"
                    placeholder="Margin %"
                  />
                </div>
              )}
              <select
                value={editAmortType}
                onChange={(e) => setEditAmortType(e.target.value as AmortizationType)}
                className="w-full px-3 py-1.5 rounded-lg bg-background border border-border"
              >
                <option value="annuity">Annuity</option>
                <option value="straight_line">Straight line</option>
                <option value="interest_only">Interest only</option>
                <option value="custom">Custom</option>
              </select>
              <input
                type="text"
                inputMode="decimal"
                value={editMonthlyPay}
                onChange={(e) => setEditMonthlyPay(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-background border border-border"
                placeholder="Monthly payment (optional)"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={editStartDate}
                  onChange={(e) => setEditStartDate(e.target.value)}
                  className="px-3 py-1.5 rounded-lg bg-background border border-border"
                />
                <input
                  type="date"
                  value={editEndDate}
                  onChange={(e) => setEditEndDate(e.target.value)}
                  className="px-3 py-1.5 rounded-lg bg-background border border-border"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 p-4 pt-2 shrink-0 border-t border-border/50">
              <button
                type="button"
                disabled={busy || !editingLoan?.account_id}
                onClick={() => {
                  if (!editingLoan?.account_id) return;
                  openCsvImport(editingLoan.account_id);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border bg-muted/30 text-muted-foreground hover:bg-muted hover:text-card-foreground disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5" />
                CSV Import
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditingLoan(null)}
                  disabled={busy}
                  className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted/80 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveLoanEdit()}
                  disabled={busy || !editName.trim()}
                  className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {loans.map((l) => (
        <div
          key={l.id}
          className="group relative p-2.5 rounded-bento-inner bg-muted/30 text-xs space-y-1"
        >
          <button
            type="button"
            onClick={() => setEditingLoan(l)}
            className="absolute top-2 right-2 p-1 rounded-md bg-card/90 border border-border/60 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-card-foreground hover:bg-muted group-hover:opacity-100"
            title="Edit loan"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <div className="flex justify-between pr-8">
            <span className="font-medium">{l.name}</span>
            <span className="tabular-nums text-expense">{formatSEK(l.outstanding)}</span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
            <span>{(l.interest_rate * 100).toFixed(2)}% nominal</span>
            <span className="capitalize">{l.rate_type}</span>
            {l.rate_type === "fixed" && l.rate_fixed_until && (
              <span>Fixed until {l.rate_fixed_until}</span>
            )}
            {l.rate_type === "floating" && (l.rate_index || l.rate_margin != null) && (
              <span>
                {l.rate_index ?? "—"}
                {l.rate_margin != null ? ` + ${(l.rate_margin * 100).toFixed(2)}%` : ""}
              </span>
            )}
            <span className="capitalize">{l.amortization_type.replace(/_/g, " ")}</span>
            {l.monthly_payment != null && <span>{formatSEK(l.monthly_payment)}/mo</span>}
            {l.end_date && <span>Ends {l.end_date}</span>}
          </div>
        </div>
      ))}
      {loans.length === 0 && !adding && <p className="text-xs text-muted-foreground">No loans configured</p>}

      {adding ? (
        <div className="p-3 rounded-bento-inner bg-muted/20 space-y-2 text-xs">
          <input
            ref={loanSetupCsvInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(ev) => void handleLoanSetupCsvChange(ev)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy || !household}
              onClick={() => loanSetupCsvInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted/50 disabled:opacity-50 text-[11px]"
            >
              <Upload className="w-3.5 h-3.5 shrink-0" />
              Import loan setup CSV
            </button>
            <span className="text-[10px] text-muted-foreground flex-1 min-w-[12rem]">
              One row fills this form; multiple rows import in one step. Required columns:{" "}
              <span className="font-mono text-[9px]">name, principal, outstanding, interest_rate_pct</span>.
              Optional:{" "}
              <span className="font-mono text-[9px]">
                rate_type, rate_fixed_until, start_date, end_date, monthly_payment, iban, owner_entity_name,
                kontohavare, shared, co_owners
              </span>
              . Transaction exports (e.g. Bokföringsdag) are not accepted here — use CSV Import on an existing
              loan for those.
            </span>
          </div>
          {loanCsvFeedback && (
            <p
              className={cn(
                "text-[10px] whitespace-pre-wrap rounded-lg px-2 py-1.5",
                loanCsvFeedback.kind === "err"
                  ? "bg-destructive/10 text-destructive"
                  : "bg-muted/40 text-muted-foreground",
              )}
            >
              {loanCsvFeedback.text}
            </p>
          )}
          <input
            type="text"
            placeholder="Loan name (e.g. Bolån)"
            value={loanName}
            onChange={(e) => setLoanName(e.target.value)}
            className="w-full px-3 py-1.5 rounded-lg bg-card border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <select
            value={loanType}
            onChange={(e) => setLoanType(e.target.value as LoanType)}
            className="w-full px-3 py-1.5 rounded-lg bg-card border border-border"
          >
            <option value="mortgage">Mortgage</option>
            <option value="car">Car</option>
            <option value="student">Student</option>
            <option value="personal">Personal</option>
            <option value="other">Other</option>
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              inputMode="decimal"
              placeholder="Principal"
              value={principal}
              onChange={(e) => setPrincipal(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-card border border-border"
            />
            <input
              type="text"
              inputMode="decimal"
              placeholder="Outstanding"
              value={outstanding}
              onChange={(e) => setOutstanding(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-card border border-border"
            />
          </div>
          <p className="text-[10px] text-muted-foreground font-medium">Loan account</p>
          <div className="flex gap-3">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                checked={linkMode === "new"}
                onChange={() => setLinkMode("new")}
                className="rounded-full"
              />
              New account
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                checked={linkMode === "existing"}
                onChange={() => setLinkMode("existing")}
                className="rounded-full"
              />
              Existing
            </label>
          </div>
          {linkMode === "existing" ? (
            <select
              value={existingAccountId}
              onChange={(e) => setExistingAccountId(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg bg-card border border-border"
            >
              <option value="">Select loan account…</option>
              {loanAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="space-y-2 pl-0.5">
              <input
                type="text"
                placeholder="Account label (optional)"
                value={newAccName}
                onChange={(e) => setNewAccName(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-card border border-border"
              />
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newAccShared}
                  onChange={(e) => {
                    setNewAccShared(e.target.checked);
                    if (!e.target.checked) setNewAccCoIds([]);
                  }}
                  className="rounded border-border"
                />
                Shared / joint loan account
              </label>
              {newAccShared ? (
                <div className="flex flex-wrap gap-2">
                  {entities.map((e) => (
                    <label key={e.id} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newAccCoIds.includes(e.id)}
                        onChange={() => toggleNewAccCo(e.id)}
                        className="rounded border-border"
                      />
                      {e.name}
                    </label>
                  ))}
                </div>
              ) : (
                <select
                  value={newAccEntityId}
                  onChange={(e) => setNewAccEntityId(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-card border border-border"
                >
                  <option value="">Owner entity…</option>
                  {entities.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <p className="text-[10px] text-muted-foreground font-medium pt-1">Interest</p>
          <select
            value={rateType}
            onChange={(e) => setRateType(e.target.value as RateType)}
            className="w-full px-3 py-1.5 rounded-lg bg-card border border-border"
          >
            <option value="fixed">Fixed</option>
            <option value="floating">Floating</option>
          </select>
          <input
            type="text"
            inputMode="decimal"
            placeholder="Nominal rate % p.a. (e.g. 4.65)"
            value={interestPct}
            onChange={(e) => setInterestPct(e.target.value)}
            className="w-full px-3 py-1.5 rounded-lg bg-card border border-border"
          />
          {rateType === "fixed" ? (
            <label className="block space-y-0.5">
              <span className="text-[10px] text-muted-foreground">Fixed rate until (bindningstid end)</span>
              <input
                type="date"
                value={rateFixedUntil}
                onChange={(e) => setRateFixedUntil(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-card border border-border"
              />
            </label>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Index (e.g. STIBOR 3m)"
                value={rateIndex}
                onChange={(e) => setRateIndex(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-card border border-border"
              />
              <input
                type="text"
                inputMode="decimal"
                placeholder="Margin % (e.g. 1.45)"
                value={rateMarginPct}
                onChange={(e) => setRateMarginPct(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-card border border-border"
              />
            </div>
          )}
          <p className="text-[10px] text-muted-foreground">Fixed: set “fixed until” for the bindningstid. Floating: index + margin (optional).</p>

          <select
            value={amortType}
            onChange={(e) => setAmortType(e.target.value as AmortizationType)}
            className="w-full px-3 py-1.5 rounded-lg bg-card border border-border"
          >
            <option value="annuity">Annuity</option>
            <option value="straight_line">Straight line</option>
            <option value="interest_only">Interest only</option>
            <option value="custom">Custom</option>
          </select>
          <input
            type="text"
            inputMode="decimal"
            placeholder="Monthly payment (optional)"
            value={monthlyPay}
            onChange={(e) => setMonthlyPay(e.target.value)}
            className="w-full px-3 py-1.5 rounded-lg bg-card border border-border"
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-0.5">
              <span className="text-[10px] text-muted-foreground">Start</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-card border border-border"
              />
            </label>
            <label className="space-y-0.5">
              <span className="text-[10px] text-muted-foreground">Maturity (optional)</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-card border border-border"
              />
            </label>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => void handleAddLoan()}
              disabled={
                busy ||
                !loanName.trim() ||
                !principal.trim() ||
                !outstanding.trim() ||
                !interestPct.trim()
              }
              className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Add loan"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                resetLoanForm();
                setLoanCsvFeedback(null);
              }}
              className="px-3 py-1.5 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setLoanCsvFeedback(null);
            setAdding(true);
          }}
          className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Add loan
        </button>
      )}
    </div>
  );
}

export function useDataSettingsBentoCards(): BentoCardDefinition[] {
  const { t } = useTranslation();
  return useMemo(
    () => [
      {
        id: "flow-diagram",
        title: t("cards.data.finance_flow"),
        defaultSize: "full",
        render: (p) => (
          <Card
            title={t("cards.data.finance_flow")}
            subtitle={t("cards.data.finance_flow_sub")}
            icon={<ArrowDownUp className="w-4 h-4" />}
            headerTrailing={<FinanceFlowSankeyLegendButton />}
            {...p}
          >
            <FlowDiagramCardContent />
          </Card>
        ),
      },
      {
        id: "entity-manager",
        title: t("cards.data.people_companies"),
        defaultSize: "small",
        render: (p) => (
          <Card
            title={t("cards.data.people_companies")}
            titleTooltip={t("cards.data.people_companies_tooltip")}
            subtitle={t("cards.data.people_companies_sub")}
            icon={<Users className="w-4 h-4" />}
            {...p}
          >
            <EntityManagerCardContent />
          </Card>
        ),
      },
      {
        id: "account-manager",
        title: t("cards.data.accounts"),
        defaultSize: "small",
        render: (p) => (
          <Card title={t("cards.data.accounts")} subtitle={t("cards.data.accounts_sub")} icon={<Wallet className="w-4 h-4" />} {...p}>
            <AccountManagerCardContent />
          </Card>
        ),
      },
      {
        id: "cashflow-manager",
        title: t("cards.data.cashflows"),
        defaultSize: "medium",
        render: (p) => <CashflowsBentoCard {...p} />,
      },
      {
        id: "loan-manager",
        title: t("cards.data.loans"),
        defaultSize: "small",
        render: (p) => (
          <Card
            title={t("cards.data.loans")}
            icon={<Building2 className="w-4 h-4" />}
            headerTrailing={<LoansCardMonthlyTotal />}
            {...p}
          >
            <LoanManagerCardContent />
          </Card>
        ),
      },
    ],
    [t],
  );
}

export function DataSettingsPage() {
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [csvImportPresetAccountId, setCsvImportPresetAccountId] = useState<string | null>(null);
  const openCsvImport = useCallback((presetAccountId: string | null) => {
    setCsvImportPresetAccountId(presetAccountId);
    setCsvImportOpen(true);
  }, []);

  const cards = useDataSettingsBentoCards();

  return (
    <OpenCsvImportContext.Provider value={openCsvImport}>
      <CsvImportModal
        open={csvImportOpen}
        presetAccountId={csvImportPresetAccountId}
        onClose={() => {
          setCsvImportOpen(false);
          setCsvImportPresetAccountId(null);
        }}
      />
      <BentoGrid tab="data" cards={cards} />
    </OpenCsvImportContext.Provider>
  );
}
