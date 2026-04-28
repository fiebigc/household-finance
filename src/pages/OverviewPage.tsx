import { BentoGrid, type BentoCardDefinition } from "@/components/BentoGrid";
import { Card } from "@/components/ui/BentoCard";
import { useAppStore } from "@/stores/appStore";
import { formatSEK, formatPercent, formatCompact } from "@/lib/utils";
import {
  TrendingUp, Wallet, PiggyBank, Building2,
  CreditCard, Activity, DollarSign, Users, BarChart3,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { useMemo } from "react";

function AccountOverviewCardContent() {
  const { accounts } = useAppStore();

  const chartData = useMemo(() => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
    return months.map((m, i) => {
      const base: Record<string, unknown> = { month: m };
      accounts.filter(a => a.type !== "loan" && a.type !== "credit").forEach((a) => {
        base[a.name] = (a.balance_snapshot || 0) * (0.85 + Math.random() * 0.3 + i * 0.02);
      });
      base["Total"] = Object.entries(base)
        .filter(([k]) => k !== "month")
        .reduce((s, [, v]) => s + (v as number), 0);
      return base;
    });
  }, [accounts]);

  const accountNames = accounts
    .filter(a => a.type !== "loan" && a.type !== "credit")
    .map(a => a.name);
  const colors = ["#3b82f6", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444"];

  if (accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground text-sm">
        <Wallet className="w-8 h-8 mb-2 opacity-40" />
        <p>No accounts yet</p>
        <p className="text-xs mt-1">Add accounts in Data & Settings</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={chartData}>
        <defs>
          {accountNames.map((name, i) => (
            <linearGradient key={name} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={colors[i % colors.length]} stopOpacity={0.2} />
              <stop offset="95%" stopColor={colors[i % colors.length]} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 91%)" />
        <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(220 9% 46%)" />
        <YAxis tick={{ fontSize: 11 }} stroke="hsl(220 9% 46%)" tickFormatter={(v) => formatCompact(v)} />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(0 0% 100%)",
            border: "1px solid hsl(220 13% 91%)",
            borderRadius: "10px",
            fontSize: "12px",
          }}
          formatter={(v: number) => formatSEK(v)}
        />
        <Legend wrapperStyle={{ fontSize: "11px" }} />
        {accountNames.map((name, i) => (
          <Area
            key={name}
            type="monotone"
            dataKey={name}
            stroke={colors[i % colors.length]}
            fill={`url(#grad-${i})`}
            strokeWidth={2}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

function HouseholdHealthCardContent() {
  const { entities, cashflows, loans } = useAppStore();
  const adults = entities.filter(e => e.type === "adult");
  const totalIncome = cashflows
    .filter(c => c.direction === "income")
    .reduce((s, c) => s + c.amount, 0);
  const totalExpense = cashflows
    .filter(c => c.direction === "expense")
    .reduce((s, c) => s + c.amount, 0);
  const totalLoanPayment = loans.reduce((s, l) => s + (l.monthly_payment ?? 0), 0);
  const netMonthly = totalIncome - totalExpense - totalLoanPayment;
  const healthScore = Math.min(100, Math.max(0, Math.round(50 + (netMonthly / Math.max(1, totalIncome)) * 50)));

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-28 h-16">
        <svg viewBox="0 0 120 70" className="w-full h-full">
          <path d="M 10 60 A 50 50 0 0 1 110 60" fill="none" stroke="hsl(220 13% 91%)" strokeWidth="10" strokeLinecap="round" />
          <path
            d="M 10 60 A 50 50 0 0 1 110 60"
            fill="none"
            stroke={healthScore >= 60 ? "hsl(142 71% 45%)" : healthScore >= 30 ? "hsl(38 92% 50%)" : "hsl(0 84% 60%)"}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${(healthScore / 100) * 157} 157`}
          />
        </svg>
      </div>
      <div className="text-center">
        <span className="text-2xl font-bold tabular-nums">{healthScore}%</span>
        <p className="text-xs text-muted-foreground">
          {healthScore >= 70 ? "Healthy" : healthScore >= 40 ? "Needs attention" : "Critical"}
        </p>
      </div>
      <div className="text-xs text-muted-foreground text-center">
        {adults.length} adult{adults.length !== 1 ? "s" : ""}, {entities.filter(e => e.type === "child").length} child{entities.filter(e => e.type === "child").length !== 1 ? "ren" : ""}
      </div>
    </div>
  );
}

function KPIValue({ label, value, trend, color }: { label: string; value: string; trend?: string; color?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${color ?? ""}`}>{value}</p>
      {trend && <p className="text-xs text-muted-foreground">{trend}</p>}
    </div>
  );
}

function TotalLoanCardContent() {
  const { loans } = useAppStore();
  const totalOutstanding = loans.reduce((s, l) => s + l.outstanding, 0);
  const totalMonthly = loans.reduce((s, l) => s + (l.monthly_payment ?? 0), 0);
  return (
    <div className="space-y-3">
      <KPIValue label="Outstanding" value={formatSEK(totalOutstanding)} color="text-expense" />
      <KPIValue label="Monthly payment" value={formatSEK(totalMonthly)} />
      <div className="space-y-1.5">
        {loans.map(l => (
          <div key={l.id} className="flex justify-between text-xs">
            <span className="text-muted-foreground truncate mr-2">{l.name}</span>
            <span className="tabular-nums shrink-0">{formatSEK(l.outstanding)}</span>
          </div>
        ))}
        {loans.length === 0 && <p className="text-xs text-muted-foreground">No loans</p>}
      </div>
    </div>
  );
}

function FixedCostsCardContent() {
  const { cashflows } = useAppStore();
  const recurring = cashflows.filter(c => c.direction === "expense" && c.frequency === "monthly");
  const total = recurring.reduce((s, c) => s + c.amount, 0);

  const byCat = recurring.reduce<Record<string, number>>((acc, c) => {
    acc[c.category] = (acc[c.category] ?? 0) + c.amount;
    return acc;
  }, {});

  return (
    <div className="space-y-3">
      <KPIValue label="Monthly fixed costs" value={formatSEK(total)} color="text-expense" />
      <div className="space-y-1.5">
        {Object.entries(byCat)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 6)
          .map(([cat, amt]) => (
            <div key={cat} className="flex justify-between text-xs">
              <span className="text-muted-foreground capitalize">{cat.replace(/_/g, " ")}</span>
              <span className="tabular-nums">{formatSEK(amt)}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

function TotalIncomeCardContent() {
  const { cashflows, entities } = useAppStore();
  const incomes = cashflows.filter(c => c.direction === "income");
  const total = incomes.reduce((s, c) => s + c.amount, 0);

  return (
    <div className="space-y-3">
      <KPIValue label="Total monthly income" value={formatSEK(total)} color="text-income" />
      <div className="space-y-1.5">
        {entities.filter(e => e.type === "adult").map(entity => {
          const entityIncome = incomes.filter(i => i.entity_id === entity.id).reduce((s, c) => s + c.amount, 0);
          return (
            <div key={entity.id} className="flex justify-between text-xs">
              <span className="text-muted-foreground">{entity.name}</span>
              <span className="tabular-nums">{formatSEK(entityIncome)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NetSurplusCardContent() {
  const { cashflows, loans } = useAppStore();
  const totalIncome = cashflows.filter(c => c.direction === "income").reduce((s, c) => s + c.amount, 0);
  const totalExpense = cashflows.filter(c => c.direction === "expense").reduce((s, c) => s + c.amount, 0);
  const totalLoan = loans.reduce((s, l) => s + (l.monthly_payment ?? 0), 0);
  const net = totalIncome - totalExpense - totalLoan;
  const savingsRate = totalIncome > 0 ? net / totalIncome : 0;

  return (
    <div className="space-y-3">
      <KPIValue
        label="Monthly net"
        value={formatSEK(net)}
        color={net >= 0 ? "text-income" : "text-expense"}
      />
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(100, Math.max(0, savingsRate * 100))}%`,
              backgroundColor: savingsRate >= 0.1 ? "hsl(142 71% 45%)" : "hsl(38 92% 50%)",
            }}
          />
        </div>
        <span className="tabular-nums">{formatPercent(savingsRate)}</span>
      </div>
      <p className="text-xs text-muted-foreground">Savings rate</p>
    </div>
  );
}

function CashflowBarCardContent() {
  const { cashflows } = useAppStore();
  const months = ["Jan", "Feb", "Mar", "Apr"];
  const data = months.map(m => ({
    month: m,
    Income: cashflows.filter(c => c.direction === "income").reduce((s, c) => s + c.amount, 0) * (0.9 + Math.random() * 0.2),
    Expenses: cashflows.filter(c => c.direction === "expense").reduce((s, c) => s + c.amount, 0) * (0.9 + Math.random() * 0.2),
  }));

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 91%)" />
        <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(220 9% 46%)" />
        <YAxis tick={{ fontSize: 11 }} stroke="hsl(220 9% 46%)" tickFormatter={formatCompact} />
        <Tooltip
          contentStyle={{ backgroundColor: "hsl(0 0% 100%)", border: "1px solid hsl(220 13% 91%)", borderRadius: "10px", fontSize: "12px" }}
          formatter={(v: number) => formatSEK(v)}
        />
        <Bar dataKey="Income" fill="hsl(142 71% 45%)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="Expenses" fill="hsl(0 84% 60%)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function InvestmentsCardContent() {
  const { accounts } = useAppStore();
  const investments = accounts.filter(a => a.type === "investment" || a.type === "pension");
  const total = investments.reduce((s, a) => s + (a.balance_snapshot || 0), 0);

  return (
    <div className="space-y-3">
      <KPIValue label="Portfolio value" value={formatSEK(total)} />
      <div className="space-y-1.5">
        {investments.map(a => (
          <div key={a.id} className="flex justify-between text-xs">
            <span className="text-muted-foreground truncate mr-2">{a.name}</span>
            <span className="tabular-nums">{formatSEK(a.balance_snapshot || 0)}</span>
          </div>
        ))}
        {investments.length === 0 && <p className="text-xs text-muted-foreground">No investments tracked</p>}
      </div>
    </div>
  );
}

function EntityAccountCardContent({ entityType }: { entityType: "adult" }) {
  const { entities, accounts, cashflows } = useAppStore();
  const adults = entities.filter(e => e.type === entityType);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {adults.map(entity => {
        const entityAccounts = accounts.filter(a => a.entity_id === entity.id && a.type !== "loan");
        const income = cashflows.filter(c => c.entity_id === entity.id && c.direction === "income").reduce((s, c) => s + c.amount, 0);
        const expense = cashflows.filter(c => c.entity_id === entity.id && c.direction === "expense").reduce((s, c) => s + c.amount, 0);
        return (
          <div key={entity.id} className="p-3 rounded-bento-inner bg-muted/30">
            <h4 className="text-sm font-medium mb-2">{entity.name}</h4>
            <div className="grid grid-cols-2 gap-2 text-xs mb-2">
              <div>
                <span className="text-muted-foreground">Income</span>
                <p className="font-medium tabular-nums text-income">{formatSEK(income)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Costs</span>
                <p className="font-medium tabular-nums text-expense">{formatSEK(expense)}</p>
              </div>
            </div>
            {entityAccounts.map(a => (
              <div key={a.id} className="flex justify-between text-xs text-muted-foreground">
                <span className="truncate mr-2">{a.name}</span>
                <span className="tabular-nums">{formatSEK(a.balance_snapshot || 0)}</span>
              </div>
            ))}
          </div>
        );
      })}
      {adults.length === 0 && (
        <p className="text-xs text-muted-foreground col-span-full">No adults configured. Go to Data & Settings to add entities.</p>
      )}
    </div>
  );
}

export function OverviewPage() {
  const cards: BentoCardDefinition[] = [
    {
      id: "account-overview",
      title: "Account Overview",
      defaultSize: "large",
      render: (p) => (
        <Card title="Account Overview" icon={<BarChart3 className="w-4 h-4" />} {...p}>
          <AccountOverviewCardContent />
        </Card>
      ),
    },
    {
      id: "household-health",
      title: "Household",
      defaultSize: "small",
      render: (p) => (
        <Card title="Household" icon={<Activity className="w-4 h-4" />} {...p}>
          <HouseholdHealthCardContent />
        </Card>
      ),
    },
    {
      id: "total-loan",
      title: "Total Loans",
      defaultSize: "small",
      render: (p) => (
        <Card title="Total Loans" icon={<Building2 className="w-4 h-4" />} {...p}>
          <TotalLoanCardContent />
        </Card>
      ),
    },
    {
      id: "fixed-costs",
      title: "Fixed Costs",
      defaultSize: "small",
      render: (p) => (
        <Card title="Fixed Costs" icon={<CreditCard className="w-4 h-4" />} {...p}>
          <FixedCostsCardContent />
        </Card>
      ),
    },
    {
      id: "total-income",
      title: "Total Income",
      defaultSize: "small",
      render: (p) => (
        <Card title="Total Income" icon={<TrendingUp className="w-4 h-4" />} {...p}>
          <TotalIncomeCardContent />
        </Card>
      ),
    },
    {
      id: "net-surplus",
      title: "Total Net",
      defaultSize: "small",
      render: (p) => (
        <Card title="Total Net" icon={<DollarSign className="w-4 h-4" />} {...p}>
          <NetSurplusCardContent />
        </Card>
      ),
    },
    {
      id: "cashflow-bar",
      title: "Cashflow",
      defaultSize: "medium",
      render: (p) => (
        <Card title="Cashflow" subtitle="Last 4 months" icon={<BarChart3 className="w-4 h-4" />} {...p}>
          <CashflowBarCardContent />
        </Card>
      ),
    },
    {
      id: "entity-accounts",
      title: "Individual Accounts",
      defaultSize: "medium",
      render: (p) => (
        <Card title="Individual Accounts" icon={<Users className="w-4 h-4" />} {...p}>
          <EntityAccountCardContent entityType="adult" />
        </Card>
      ),
    },
    {
      id: "investments-1",
      title: "Investments",
      defaultSize: "small",
      render: (p) => (
        <Card title="Investments" icon={<PiggyBank className="w-4 h-4" />} {...p}>
          <InvestmentsCardContent />
        </Card>
      ),
    },
  ];

  return <BentoGrid tab="overview" cards={cards} />;
}
