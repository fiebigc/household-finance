import { useMemo } from "react";
import { BentoGrid, type BentoCardDefinition } from "@/components/BentoGrid";
import { Card } from "@/components/ui/BentoCard";
import { useAppStore } from "@/stores/appStore";
import { formatSEK, formatCompact, formatPercent } from "@/lib/utils";
import {
  PiggyBank, TrendingUp, Flame, LineChart as LineChartIcon,
  Baby,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, LineChart, Line,
} from "recharts";

function PensionProjectionCardContent() {
  const { entities } = useAppStore();
  const adults = entities.filter(e => e.type === "adult");

  const data = useMemo(() => {
    return Array.from({ length: 35 }, (_, i) => {
      const year = new Date().getFullYear() + i;
      const entry: Record<string, unknown> = { year };
      adults.forEach(a => {
        entry[a.name] = Math.round(5000 * Math.pow(1.06, i) * (1 + Math.random() * 0.1));
      });
      return entry;
    });
  }, [adults]);

  const colors = ["#3b82f6", "#8b5cf6"];

  return (
    <div>
      {adults.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-8">Add adults in Data & Settings to see projections</p>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data}>
            <defs>
              {adults.map((a, i) => (
                <linearGradient key={a.id} id={`pension-grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={colors[i]} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={colors[i]} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 91%)" />
            <XAxis dataKey="year" tick={{ fontSize: 10 }} stroke="hsl(220 9% 46%)" />
            <YAxis tick={{ fontSize: 10 }} stroke="hsl(220 9% 46%)" tickFormatter={formatCompact} />
            <Tooltip formatter={(v: number) => formatSEK(v)} contentStyle={{ borderRadius: "10px", fontSize: "12px" }} />
            <Legend wrapperStyle={{ fontSize: "11px" }} />
            {adults.map((a, i) => (
              <Area
                key={a.id}
                type="monotone"
                dataKey={a.name}
                stroke={colors[i]}
                fill={`url(#pension-grad-${i})`}
                strokeWidth={2}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function FireNumberCardContent() {
  const { cashflows } = useAppStore();
  const annualExpenses = cashflows
    .filter(c => c.direction === "expense")
    .reduce((s, c) => s + c.amount * 12, 0);
  const fireNumber = annualExpenses * 25;
  const currentSavings = 150_000;
  const progress = fireNumber > 0 ? Math.min(1, currentSavings / fireNumber) : 0;

  return (
    <div className="space-y-4">
      <div className="text-center">
        <p className="text-xs text-muted-foreground mb-1">FIRE Target (25x annual expenses)</p>
        <p className="text-2xl font-bold tabular-nums">{formatSEK(fireNumber)}</p>
      </div>
      <div>
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>Progress</span>
          <span>{formatPercent(progress)}</span>
        </div>
        <div className="h-3 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-income transition-all"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-muted-foreground">Current savings</p>
          <p className="font-medium tabular-nums">{formatSEK(currentSavings)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Gap</p>
          <p className="font-medium tabular-nums">{formatSEK(fireNumber - currentSavings)}</p>
        </div>
      </div>
    </div>
  );
}

function InvestmentGrowthCardContent() {
  const { accounts } = useAppStore();
  const investments = accounts.filter(a => a.type === "investment" || a.type === "pension");
  const totalNow = investments.reduce((s, a) => s + (a.balance_snapshot || 0), 0);

  const scenarios = [
    { name: "Conservative (4%)", rate: 0.04, color: "#06b6d4" },
    { name: "Moderate (7%)", rate: 0.07, color: "#10b981" },
    { name: "Aggressive (10%)", rate: 0.10, color: "#f59e0b" },
  ];

  const data = Array.from({ length: 30 }, (_, i) => {
    const entry: Record<string, unknown> = { year: new Date().getFullYear() + i };
    scenarios.forEach(s => {
      entry[s.name] = Math.round(totalNow * Math.pow(1 + s.rate, i));
    });
    return entry;
  });

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 91%)" />
        <XAxis dataKey="year" tick={{ fontSize: 10 }} stroke="hsl(220 9% 46%)" />
        <YAxis tick={{ fontSize: 10 }} stroke="hsl(220 9% 46%)" tickFormatter={formatCompact} />
        <Tooltip formatter={(v: number) => formatSEK(v)} contentStyle={{ borderRadius: "10px", fontSize: "12px" }} />
        <Legend wrapperStyle={{ fontSize: "10px" }} />
        {scenarios.map(s => (
          <Line key={s.name} type="monotone" dataKey={s.name} stroke={s.color} strokeWidth={2} dot={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function NetWorthTrajectoryCardContent() {
  const { accounts, loans } = useAppStore();
  const totalAssets = accounts.filter(a => a.type !== "loan" && a.type !== "credit").reduce((s, a) => s + (a.balance_snapshot || 0), 0);
  const totalDebt = loans.reduce((s, l) => s + l.outstanding, 0);

  const data = Array.from({ length: 30 }, (_, i) => ({
    year: new Date().getFullYear() + i,
    Assets: Math.round(totalAssets * Math.pow(1.05, i)),
    Debt: Math.round(totalDebt * Math.pow(0.96, i)),
    "Net Worth": Math.round(totalAssets * Math.pow(1.05, i) - totalDebt * Math.pow(0.96, i)),
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="nw-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(142 71% 45%)" stopOpacity={0.15} />
            <stop offset="95%" stopColor="hsl(142 71% 45%)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 91%)" />
        <XAxis dataKey="year" tick={{ fontSize: 10 }} stroke="hsl(220 9% 46%)" />
        <YAxis tick={{ fontSize: 10 }} stroke="hsl(220 9% 46%)" tickFormatter={formatCompact} />
        <Tooltip formatter={(v: number) => formatSEK(v)} contentStyle={{ borderRadius: "10px", fontSize: "12px" }} />
        <Legend wrapperStyle={{ fontSize: "10px" }} />
        <Area type="monotone" dataKey="Net Worth" stroke="hsl(142 71% 45%)" fill="url(#nw-grad)" strokeWidth={2} />
        <Area type="monotone" dataKey="Assets" stroke="#3b82f6" fill="transparent" strokeWidth={1.5} strokeDasharray="4 4" />
        <Area type="monotone" dataKey="Debt" stroke="hsl(0 84% 60%)" fill="transparent" strokeWidth={1.5} strokeDasharray="4 4" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function LeavePensionImpactCardContent() {
  const { entities, periods } = useAppStore();
  const adults = entities.filter(e => e.type === "adult");

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Pension gap analysis for parental/unpaid leave periods
      </p>
      {adults.map(adult => {
        const leaves = periods.filter(p =>
          p.entity_id === adult.id &&
          (p.type === "parental_leave" || p.type === "unpaid_leave")
        );
        const totalMonths = leaves.reduce((s, l) => {
          const from = new Date(l.date_from);
          const to = l.date_to ? new Date(l.date_to) : new Date();
          return s + Math.max(0, (to.getTime() - from.getTime()) / (30 * 24 * 60 * 60 * 1000));
        }, 0);

        return (
          <div key={adult.id} className="p-3 rounded-bento-inner bg-muted/30">
            <h4 className="text-xs font-medium mb-1">{adult.name}</h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-muted-foreground">Leave months</p>
                <p className="font-medium tabular-nums">{Math.round(totalMonths)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Est. pension gap</p>
                <p className="font-medium tabular-nums text-expense">{formatSEK(Math.round(totalMonths * 1500))}</p>
              </div>
            </div>
          </div>
        );
      })}
      {adults.length === 0 && <p className="text-xs text-muted-foreground">No adults configured</p>}
    </div>
  );
}

export function RetirementPage() {
  const cards: BentoCardDefinition[] = [
    {
      id: "pension-projection",
      title: "Pension Projection",
      defaultSize: "large",
      render: (p) => (
        <Card title="Pension Projection" subtitle="Projected pension at retirement" icon={<PiggyBank className="w-4 h-4" />} {...p}>
          <PensionProjectionCardContent />
        </Card>
      ),
    },
    {
      id: "fire-number",
      title: "FIRE Target",
      defaultSize: "small",
      render: (p) => (
        <Card title="FIRE Target" icon={<Flame className="w-4 h-4" />} {...p}>
          <FireNumberCardContent />
        </Card>
      ),
    },
    {
      id: "investment-growth",
      title: "Investment Growth",
      defaultSize: "medium",
      render: (p) => (
        <Card title="Investment Growth" subtitle="Compound growth scenarios" icon={<TrendingUp className="w-4 h-4" />} {...p}>
          <InvestmentGrowthCardContent />
        </Card>
      ),
    },
    {
      id: "net-worth-trajectory",
      title: "Net Worth Trajectory",
      defaultSize: "medium",
      render: (p) => (
        <Card title="Net Worth Trajectory" subtitle="30-year outlook" icon={<LineChartIcon className="w-4 h-4" />} {...p}>
          <NetWorthTrajectoryCardContent />
        </Card>
      ),
    },
    {
      id: "leave-pension-impact",
      title: "Leave Pension Impact",
      defaultSize: "small",
      render: (p) => (
        <Card title="Leave Impact" subtitle="Pension gap from leave periods" icon={<Baby className="w-4 h-4" />} {...p}>
          <LeavePensionImpactCardContent />
        </Card>
      ),
    },
  ];

  return <BentoGrid tab="retirement" cards={cards} />;
}
