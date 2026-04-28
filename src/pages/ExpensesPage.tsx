import { BentoGrid, type BentoCardDefinition } from "@/components/BentoGrid";
import { Card } from "@/components/ui/BentoCard";
import { useAppStore } from "@/stores/appStore";
import { formatSEK } from "@/lib/utils";
import {
  Receipt, TrendingDown, Tag,
  PieChart as PieChartIcon,
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";

const PIE_COLORS = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#06b6d4", "#ec4899", "#6366f1"];

function ExpenseBreakdownCardContent() {
  const { cashflows } = useAppStore();
  const expenses = cashflows.filter(c => c.direction === "expense");
  const byCat = expenses.reduce<Record<string, number>>((acc, c) => {
    acc[c.category] = (acc[c.category] ?? 0) + c.amount;
    return acc;
  }, {});

  const data = Object.entries(byCat)
    .map(([name, value]) => ({ name: name.replace(/_/g, " "), value }))
    .sort((a, b) => b.value - a.value);

  if (data.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-8">No expenses to display</p>;
  }

  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width="50%" height={180}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" outerRadius={70} innerRadius={40} dataKey="value" strokeWidth={2} stroke="hsl(0 0% 100%)">
            {data.map((_, i) => (
              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(v: number) => formatSEK(v)} contentStyle={{ borderRadius: "10px", fontSize: "12px" }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex-1 space-y-1.5">
        {data.slice(0, 6).map((d, i) => (
          <div key={d.name} className="flex items-center gap-2 text-xs">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
            <span className="text-muted-foreground capitalize flex-1 truncate">{d.name}</span>
            <span className="tabular-nums">{formatSEK(d.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MonthlyExpenseTrendContent() {
  const { cashflows } = useAppStore();
  const total = cashflows.filter(c => c.direction === "expense").reduce((s, c) => s + c.amount, 0);
  const months = ["Nov", "Dec", "Jan", "Feb", "Mar", "Apr"];
  const data = months.map(m => ({
    month: m,
    amount: total * (0.8 + Math.random() * 0.4),
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
  const { cashflows, entities } = useAppStore();
  const expenses = cashflows
    .filter(c => c.direction === "expense")
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
            <span className="tabular-nums text-expense shrink-0 ml-2">−{formatSEK(c.amount)}</span>
          </div>
        );
      })}
      {expenses.length === 0 && <p className="text-xs text-muted-foreground">No expenses recorded</p>}
    </div>
  );
}

export function ExpensesPage() {
  const cards: BentoCardDefinition[] = [
    {
      id: "expense-breakdown",
      title: "Expense Breakdown",
      defaultSize: "medium",
      render: (p) => (
        <Card title="Expense Breakdown" icon={<PieChartIcon className="w-4 h-4" />} {...p}>
          <ExpenseBreakdownCardContent />
        </Card>
      ),
    },
    {
      id: "monthly-expense-trend",
      title: "Monthly Trend",
      defaultSize: "medium",
      render: (p) => (
        <Card title="Monthly Trend" subtitle="6 month expense trend" icon={<TrendingDown className="w-4 h-4" />} {...p}>
          <MonthlyExpenseTrendContent />
        </Card>
      ),
    },
    {
      id: "top-expenses",
      title: "Top Expenses",
      defaultSize: "medium",
      render: (p) => (
        <Card title="Top Expenses" icon={<Receipt className="w-4 h-4" />} {...p}>
          <TopExpensesListContent />
        </Card>
      ),
    },
  ];

  return <BentoGrid tab="expenses" cards={cards} />;
}
