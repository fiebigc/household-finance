import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BentoGrid, type BentoCardDefinition } from "@/components/BentoGrid";
import {
  RenovationImportCardContent,
  RenovationProjectCardBody,
  RenovationImportCardEditDialog,
  RenovationProjectCardEditDialog,
} from "@/components/RenovationExpensesSection";
import { Card } from "@/components/ui/BentoCard";
import { useAppStore } from "@/stores/appStore";
import { useHouseholdCardValues } from "@/hooks/useHouseholdCardValues";
import { CardNumericFieldsDialog } from "@/components/CardNumericFieldsDialog";
import { formatSEK } from "@/lib/utils";
import {
  cashflowExcludedFromHouseholdTotals,
  cashflowIncomeInternalHideFromFlow,
} from "@/utils/cashflowIncomeVisibility";
import { isRenovationImportCashflow, renovationExpenseCardId } from "@/utils/renovationExpensesCsv";
import {
  Receipt, TrendingDown, Tag,
  PieChart as PieChartIcon,
  Upload,
  Home,
  Layers,
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import type { Cashflow } from "@/types/schema";

const PIE_COLORS = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#06b6d4", "#ec4899", "#6366f1"];

function expenseListAmountLabel(c: Cashflow): string {
  if (c.direction === "expense" && c.amount < 0) return `+${formatSEK(Math.abs(c.amount))}`;
  if (c.direction === "expense") return `−${formatSEK(c.amount)}`;
  return formatSEK(Math.abs(c.amount));
}

type BentoRender = Parameters<BentoCardDefinition["render"]>[0];

function trendBarFactor(i: number, count: number, spreadPct: number): number {
  if (count <= 1 || spreadPct === 0) return 1;
  const t = i / (count - 1);
  return 1 + (t - 0.5) * 2 * (spreadPct / 100);
}

function breakdownPieBlock(
  chartData: { name: string; value: number }[],
  colorOffset: number,
  opts?: { pieValue?: (raw: number) => number },
) {
  const pieRows = chartData.map((d) => ({
    name: d.name,
    value: opts?.pieValue ? opts.pieValue(d.value) : d.value,
  }));
  const pieSlices = pieRows.filter((d) => Math.abs(d.value) > 1e-6);
  const showPie = pieSlices.length > 0;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      {showPie ? (
        <ResponsiveContainer width="100%" height={180} className="sm:w-1/2 max-w-[240px] mx-auto sm:mx-0">
          <PieChart>
            <Pie
              data={pieSlices}
              cx="50%"
              cy="50%"
              outerRadius={70}
              innerRadius={40}
              dataKey="value"
              strokeWidth={2}
              stroke="hsl(0 0% 100%)"
            >
              {pieSlices.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[(i + colorOffset) % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v: number) => formatSEK(v)} contentStyle={{ borderRadius: "10px", fontSize: "12px" }} />
          </PieChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-[11px] text-muted-foreground text-center sm:w-1/2 py-6 px-2">
          Nothing to draw as slices (nets may be zero or negative after refunds).
        </p>
      )}
      <div className="flex-1 w-full space-y-1.5 min-w-0">
        {chartData.slice(0, 8).map((d, i) => (
          <div key={d.name} className="flex items-center gap-2 text-xs">
            <div
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: PIE_COLORS[(i + colorOffset) % PIE_COLORS.length] }}
            />
            <span className="text-muted-foreground flex-1 truncate">{d.name}</span>
            <span className="tabular-nums shrink-0">{formatSEK(d.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExpenseBreakdownCardContent() {
  const { cashflows } = useAppStore();
  const expenses = cashflows.filter(
    (c) =>
      c.direction === "expense" &&
      !cashflowIncomeInternalHideFromFlow(c) &&
      !cashflowExcludedFromHouseholdTotals(c),
  );
  const byCat = expenses.reduce<Record<string, number>>((acc, c) => {
    acc[c.category] = (acc[c.category] ?? 0) + c.amount;
    return acc;
  }, {});

  const data = Object.entries(byCat)
    .map(([name, value]) => ({ name: name.replace(/_/g, " "), value }))
    .sort((a, b) => b.value - a.value);

  if (data.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-8">No household expense categories to display</p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Household categories</p>
      {breakdownPieBlock(data, 0)}
    </div>
  );
}

function RenovationByProjectCardContent() {
  const { cashflows } = useAppStore();
  const renovationExpenseRows = cashflows.filter(
    (c) => c.direction === "expense" && isRenovationImportCashflow(c),
  );
  const byProject = renovationExpenseRows.reduce<Record<string, number>>((acc, c) => {
    const m = c.metadata as Record<string, unknown>;
    const pr = typeof m.renovation_project === "string" ? m.renovation_project : "Other";
    acc[pr] = (acc[pr] ?? 0) + c.amount;
    return acc;
  }, {});
  const renoData = Object.entries(byProject)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
  const renoGrandTotal = renovationExpenseRows.reduce((s, c) => s + c.amount, 0);

  if (renoData.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-8">
        No renovation expenses yet — import the bundled CSV on the Renovation projects card.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {breakdownPieBlock(renoData, 3, { pieValue: (v) => Math.max(0, v) })}
      <div className="flex justify-between items-center gap-3 pt-2 mt-1 border-t border-border/30">
        <span className="text-xs font-medium text-card-foreground">All renovation projects (net)</span>
        <span className="text-sm font-bold tabular-nums text-card-foreground">{formatSEK(renoGrandTotal)}</span>
      </div>
    </div>
  );
}

function MonthlyExpenseTrendContent() {
  const { cashflows } = useAppStore();
  const { values } = useHouseholdCardValues();
  const spread = values.expenses.trendSpreadPct;
  const total = cashflows
    .filter(
      (c) =>
        c.direction === "expense" &&
        !cashflowIncomeInternalHideFromFlow(c) &&
        !cashflowExcludedFromHouseholdTotals(c),
    )
    .reduce((s, c) => s + c.amount, 0);
  const months = ["Nov", "Dec", "Jan", "Feb", "Mar", "Apr"];
  const data = months.map((m, i) => ({
    month: m,
    amount: total * trendBarFactor(i, months.length, spread),
  }));

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 91%)" />
        <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(220 9% 46%)" />
        <YAxis tick={{ fontSize: 11 }} stroke="hsl(220 9% 46%)" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
        <Tooltip formatter={(v: number) => formatSEK(v)} contentStyle={{ borderRadius: "10px", fontSize: "12px" }} />
        <Bar dataKey="amount" fill="hsl(0 84% 60%)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function TopExpensesListContent() {
  const { t } = useTranslation();
  const { cashflows, entities } = useAppStore();
  const expenses = cashflows
    .filter(
      (c) =>
        c.direction === "expense" &&
        !cashflowIncomeInternalHideFromFlow(c) &&
        !cashflowExcludedFromHouseholdTotals(c),
    )
    .sort((a, b) => b.amount - a.amount);

  return (
    <div className="space-y-1.5">
      {expenses.slice(0, 10).map(c => {
        const entity = entities.find(e => e.id === c.entity_id);
        return (
          <div key={c.id} className="flex items-center justify-between p-2 rounded-bento-inner bg-muted/30 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <Tag className="w-3 h-3 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <span className="font-medium truncate block">{c.name}</span>
                <span className="text-muted-foreground capitalize">{c.category.replace(/_/g, " ")} · {entity?.name}</span>
              </div>
            </div>
            <span
              className={`tabular-nums shrink-0 ml-2 ${c.amount < 0 ? "text-income" : "text-expense"}`}
            >
              {expenseListAmountLabel(c)}
            </span>
          </div>
        );
      })}
      {expenses.length === 0 && <p className="text-xs text-muted-foreground">{t("cards.expenses.no_expenses_recorded")}</p>}
    </div>
  );
}

function MonthlyExpenseTrendCard(p: BentoRender) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { values, update } = useHouseholdCardValues();
  return (
    <>
      <Card title={t("cards.expenses.monthly_trend")} subtitle={t("cards.expenses.monthly_trend_sub")} icon={<TrendingDown className="w-4 h-4" />} onEdit={() => setOpen(true)} {...p}>
        <MonthlyExpenseTrendContent />
      </Card>
      <CardNumericFieldsDialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("cards.expenses.monthly_trend_dialog")}
        description={t("cards.expenses.monthly_trend_desc")}
        fields={[{ key: "spread", label: t("cards.expenses.monthly_trend_spread_label") }]}
        initial={{ spread: values.expenses.trendSpreadPct }}
        onSave={(next) =>
          update((v) => ({
            ...v,
            expenses: { ...v.expenses, trendSpreadPct: next.spread ?? 0 },
          }))
        }
      />
    </>
  );
}

function RenovationImportCardWrap(p: BentoRender) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { values } = useHouseholdCardValues();
  const title = values.expenses.renovationImportCardTitleOverride.trim() || t("cards.expenses.renovation_projects_default");

  return (
    <>
      <Card
        title={title}
        subtitle={t("cards.expenses.renovation_import_sub")}
        icon={<Upload className="w-4 h-4" />}
        onEdit={() => setOpen(true)}
        {...p}
      >
        <RenovationImportCardContent />
      </Card>
      <RenovationImportCardEditDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function RenovationProjectCardWrap({ projectName, ...p }: { projectName: string } & BentoRender) {
  const { t } = useTranslation();
  const [editOpen, setEditOpen] = useState(false);
  const { cashflows } = useAppStore();
  const flows = useMemo(() => {
    return cashflows
      .filter((c) => {
        if (!isRenovationImportCashflow(c)) return false;
        const m = c.metadata as Record<string, unknown>;
        return m.renovation_project === projectName;
      })
      .sort((a, b) => b.date_from.localeCompare(a.date_from) || a.name.localeCompare(b.name));
  }, [cashflows, projectName]);

  const total = flows.reduce((s, c) => s + c.amount, 0);

  return (
    <>
      <Card
        title={projectName}
        subtitle={
          flows.length === 1
            ? t("cards.expenses.renovation_lines_one", { count: flows.length })
            : t("cards.expenses.renovation_lines_other", { count: flows.length })
        }
        headerTrailing={
          <span className="text-sm font-bold tabular-nums text-card-foreground">{formatSEK(total)}</span>
        }
        icon={<Home className="w-4 h-4" />}
        onEdit={() => setEditOpen(true)}
        {...p}
      >
        <RenovationProjectCardBody projectName={projectName} flows={flows} />
      </Card>
      <RenovationProjectCardEditDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        projectName={projectName}
      />
    </>
  );
}

export function useExpensesBentoCards(): BentoCardDefinition[] {
  const { t } = useTranslation();
  const cashflows = useAppStore((s) => s.cashflows);
  const { values } = useHouseholdCardValues();
  const renovationImportPickerTitle =
    values.expenses.renovationImportCardTitleOverride.trim() || t("cards.expenses.renovation_projects_default");

  const renovationProjectNames = useMemo(() => {
    const names = new Set<string>();
    for (const c of cashflows) {
      if (!isRenovationImportCashflow(c)) continue;
      const m = c.metadata as Record<string, unknown>;
      if (typeof m.renovation_project === "string") names.add(m.renovation_project);
    }
    return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [cashflows]);

  return useMemo((): BentoCardDefinition[] => {
    const base: BentoCardDefinition[] = [
      {
        id: "expense-breakdown",
        title: t("cards.expenses.expense_breakdown"),
        defaultSize: "medium",
        render: (p) => (
          <Card
            title={t("cards.expenses.expense_breakdown")}
            subtitle={t("cards.expenses.expense_breakdown_sub")}
            icon={<PieChartIcon className="w-4 h-4" />}
            {...p}
          >
            <ExpenseBreakdownCardContent />
          </Card>
        ),
      },
      {
        id: "renovation-by-project",
        title: t("cards.expenses.renovation_by_project"),
        defaultSize: "medium",
        render: (p) => (
          <Card
            title={t("cards.expenses.renovation_by_project")}
            subtitle={t("cards.expenses.renovation_by_project_sub")}
            icon={<Layers className="w-4 h-4" />}
            {...p}
          >
            <RenovationByProjectCardContent />
          </Card>
        ),
      },
      {
        id: "monthly-expense-trend",
        title: t("cards.expenses.monthly_trend"),
        defaultSize: "medium",
        render: (p) => <MonthlyExpenseTrendCard {...p} />,
      },
      {
        id: "top-expenses",
        title: t("cards.expenses.top_expenses"),
        defaultSize: "medium",
        render: (p) => (
          <Card title={t("cards.expenses.top_expenses")} icon={<Receipt className="w-4 h-4" />} {...p}>
            <TopExpensesListContent />
          </Card>
        ),
      },
      {
        id: "renovation-import",
        title: renovationImportPickerTitle,
        defaultSize: "large",
        render: (p) => <RenovationImportCardWrap {...p} />,
      },
    ];

    for (const name of renovationProjectNames) {
      base.push({
        id: renovationExpenseCardId(name),
        title: name,
        defaultSize: "medium",
        render: (p) => <RenovationProjectCardWrap projectName={name} {...p} />,
      });
    }

    return base;
  }, [renovationProjectNames, renovationImportPickerTitle, t]);
}

export function ExpensesPage() {
  const cards = useExpensesBentoCards();
  return <BentoGrid tab="expenses" cards={cards} />;
}
